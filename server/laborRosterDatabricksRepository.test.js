import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import { getLaborRosterConfig, buildLaborRosterLookup, joinLaborFacilities, readLaborRosterLookup } from './laborRosterDatabricksRepository.js';
import { LABOR_UTILIZATION_NEW_DBM_QUERY } from './dbmQueries/laborUtilizationNewQuery.js';

const roster = (overrides = {}) => ({
  myid: ' a1 ',
  city: 'Huntsville', state: 'AL', sector: 'Defense Systems', ...overrides
});
const labor = (my_id, entered_hours, overrides = {}) => ({
  year: 2026, month: 9, division: 'Weapon Systems', business_unit: 'BU',
  cost_center: 'CC1', labor_category: 'Labor Direct', my_id, entered_hours, ...overrides
});

test('table identifiers are required, individually quoted, and not hardcoded', () => {
  assert.throws(() => getLaborRosterConfig({}), /DATABRICKS_LABOR_ROSTER_CATALOG.*DATABRICKS_LABOR_ROSTER_SCHEMA.*DATABRICKS_LABOR_ROSTER_TABLE/);
  const config = getLaborRosterConfig({
    DATABRICKS_LABOR_ROSTER_CATALOG: ' test_catalog ',
    DATABRICKS_LABOR_ROSTER_SCHEMA: 'test_schema',
    DATABRICKS_LABOR_ROSTER_TABLE: 'name`with.dot;SELECT'
  });
  assert.equal(config.tableSql, '`test_catalog`.`test_schema`.`name``with.dot;SELECT`');
});

test('latest roster MyID matches without duplicate hours or employee IDs in the response', () => {
  const lookup = buildLaborRosterLookup([roster(), roster(), roster({ city: 'HUNTSVILLE', state: 'al' })]);
  const source = [labor(' A1 ', 8.25), labor('a1', -1.25), labor('A1', 2), labor('a1', 0)];
  const before = structuredClone(source);
  const rows = joinLaborFacilities(source, lookup);
  assert.equal(lookup.size, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entered_hours, 9);
  assert.equal(rows[0].facility, 'Huntsville');
  assert.equal(rows[0].facility_state, 'AL');
  assert.equal('my_id' in rows[0], false);
  assert.deepEqual(source, before);
});

test('non-Defense, missing, unknown, and ambiguous roster matches stay unmapped', () => {
  const lookup = buildLaborRosterLookup([
    roster(), roster({ myid: 'A1', city: 'Other City' }),
    roster({ myid: 'X1', sector: 'Aeronautics' }),
    roster({ myid: 'Y1', city: 'UNKNOWN CITY' }),
    roster({ myid: 'Z1', city: '' })
  ]);
  const rows = joinLaborFacilities(['A1', 'X1', 'Y1', 'Z1', null, 'not found'].map((id) => labor(id, 1)), lookup);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entered_hours, 6);
  assert.equal(rows[0].facility, '');
  assert.equal(lookup.has('A1'), false);
  assert.throws(() => buildLaborRosterLookup([{ city: 'City' }]), /required MyID/);
});

test('SQL retains per-person hours and never queries the old roster', () => {
  assert.match(LABOR_UTILIZATION_NEW_DBM_QUERY, /FROM rpt\.rb_Actuals_RM_Load_Table/);
  assert.match(LABOR_UTILIZATION_NEW_DBM_QUERY, /FROM rpt\.rb_load_cost_center_hierarchy/);
  assert.match(LABOR_UTILIZATION_NEW_DBM_QUERY, /a\.MyID AS my_id/);
  assert.doesNotMatch(LABOR_UTILIZATION_NEW_DBM_QUERY, /rb_roster_transform|RosterByPerson|DefenseRoster/);
});

test('roster reads the configured table, follows chunks, and surfaces Databricks errors', async (t) => {
  for (const [key, value] of Object.entries({ DATABRICKS_HOST: 'roster.example.test', DATABRICKS_TOKEN: 'test', DATABRICKS_SQL_WAREHOUSE_ID: 'test' })) {
    const before = process.env[key]; process.env[key] = value;
    t.after(() => before === undefined ? delete process.env[key] : process.env[key] = before);
  }
  const data = roster();
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    if (init.method === 'POST') {
      const query = JSON.parse(init.body).statement;
      assert.ok(query.includes('FROM `test_catalog`.`test_schema`.`test_roster`'));
      assert.ok(query.includes("LIKE '%DEFENSE%'"));
      assert.ok(query.includes('`myid`'));
      assert.ok(query.includes('`work_city`'));
      assert.ok(query.includes('`work_state_code`'));
      assert.ok(query.includes('`org_structure_lvl2`'));
      assert.ok(query.includes('`effective_date` = (SELECT MAX(`effective_date`)'));
      assert.doesNotMatch(query, /Employee_MyID|Work_City_NSR|\`Sector\`/);
      return Response.json({
        status: { state: 'SUCCEEDED' },
        manifest: { schema: { columns: Object.keys(data).map((name) => ({ name })) }, total_row_count: 1 },
        result: { data_array: [], next_chunk_internal_link: '/next' }
      });
    }
    return Response.json({ data_array: [Object.values(data)] });
  });
  assert.equal((await readLaborRosterLookup({ tableSql: '`test_catalog`.`test_schema`.`test_roster`' })).get('A1').city, 'Huntsville');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'not available' }, { status: 403 }));
  await assert.rejects(readLaborRosterLookup({ tableSql: '`test`.`test`.`test`' }), { code: 'LABOR_ROSTER_UNAVAILABLE' });
});

async function repositoryHarness(rosterLoader) {
  const url = new URL('./laborUtilizationNewRepository.js', import.meta.url);
  const source = (await fs.readFile(url, 'utf8'))
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\n/gm, '')
    .replaceAll('export ', '')
    .replaceAll('import.meta.url', JSON.stringify(url.href));
  let fallbackReads = 0;
  const context = {
    path, fileURLToPath,
    fs: { access: async () => { fallbackReads += 1; throw new Error('unexpected Excel fallback'); } },
    normalizeCostCenter: (value) => String(value ?? '').trim().toUpperCase(),
    getLaborRosterConfig: () => ({ tableSql: '`test`.`test`.`test`' }),
    readLaborRosterLookup: rosterLoader,
    joinLaborFacilities, LABOR_UTILIZATION_NEW_DBM_QUERY,
    getConnectionConfig: () => ({ config: {}, missing: [] }),
    getPool: async () => ({ request: () => ({ query: async () => ({ recordset: [labor('A1', 8), labor('a1', -2), labor('missing', 3)] }) }) }),
    createTimer: () => () => 0, formatDuration: () => '', logDebug() {}, logError() {}
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { load: context.readLaborUtilizationNewData, fallbackReads: () => fallbackReads };
}

test('repository joins before payload creation and retains signed totals and Unmapped rows', async () => {
  const harness = await repositoryHarness(async () => buildLaborRosterLookup([roster()]));
  const payload = await harness.load();
  assert.equal(payload.totalEnteredHours, 9);
  assert.equal(payload.rows.find((row) => row.facility === 'Huntsville').entered_hours, 6);
  assert.equal(payload.rows.find((row) => row.facility === 'Unmapped').entered_hours, 3);
  assert.equal(payload.facilityMapping.source, 'databricks');
  assert.equal(harness.fallbackReads(), 0);
});

test('roster failure never triggers a silent Excel fallback', async () => {
  const harness = await repositoryHarness(async () => { throw Object.assign(new Error('roster unavailable'), { code: 'LABOR_ROSTER_UNAVAILABLE' }); });
  await assert.rejects(harness.load(), /roster unavailable/);
  assert.equal(harness.fallbackReads(), 0);
});
