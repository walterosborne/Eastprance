import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mock, test } from 'node:test';

const rosterCalls = [];
const fallbackEvents = [
  { Date: '2026-01-15', Division: 'DS Weapon Systems', Site: 'Local', SIF: 1, pSIF: 1, 'Near Miss': 1 },
  { Date: '2026-01-16', Division: 'DS Weapon Systems', Site: 'Local', SIF: 0, pSIF: 1, 'Near Miss': 1 },
  { Date: '2026-01-17', Division: 'DS Weapon Systems', Site: 'Local', SIF: 0, pSIF: 0, 'Near Miss': 1 }
];
await mock.module('fs/promises', {
  defaultExport: {
    ...fs,
    access: async () => {},
    readFile: async (file, ...args) => String(file).endsWith('sif_data.json')
      ? JSON.stringify(fallbackEvents)
      : fs.readFile(file, ...args)
  }
});
await mock.module('xlsx', {
  defaultExport: {
    readFile: () => ({ SheetNames: ['Data'], Sheets: { Data: {} } }),
    utils: { sheet_to_json: () => [{ Program: 'Local program', Timeline: 'Contract Commitment', JAN: 5 }] }
  }
});
await mock.module('./sqlConnection.js', {
  namedExports: {
    getConnectionConfig: (scope) => {
      assert.equal(scope, 'roster', 'incident and OTD reads must not require the default SQL connection');
      return { config: { roster: true }, missing: [], source: 'roster' };
    },
    formatSqlIdentifier: (name) => name,
    getPool: async (config, scope) => {
      assert.equal(scope, 'roster');
      assert.equal(config.roster, true);
      return {
        request: () => ({
          input(name, value) {
            assert.equal(name, 'busUnitLvl2NoCode');
            assert.equal(value, 'Defense Systems');
            return this;
          },
          query: async (statement) => {
            rosterCalls.push(statement);
            assert.match(statement, /COUNT\(DISTINCT/);
            assert.match(statement, /RosterExtractFarm/);
            return { recordset: [{ employee_count: '100' }] };
          }
        })
      };
    }
  }
});
const { readOtdData } = await import('./otdRepository.js');
const { readSafetyEventMetricsData, readSafetyNmfrData, getSafetyMetricPayload } = await import('./sifRepository.js');
const { executeDatabricksQuery } = await import('./databricksQuery.js');

function connect(t) {
  for (const [name, value] of Object.entries({
    DATABRICKS_HOST: 'https://warehouse.example.test/',
    DATABRICKS_TOKEN: 'test-token',
    DATABRICKS_SQL_WAREHOUSE_ID: 'test-warehouse'
  })) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => previous === undefined ? delete process.env[name] : process.env[name] = previous);
  }
}
function result(columns, rows, extra = {}) {
  return {
    statement_id: 'test-statement',
    status: { state: 'SUCCEEDED' },
    manifest: { schema: { columns: columns.map((name) => ({ name })) }, total_row_count: rows.length },
    result: { data_array: rows },
    ...extra
  };
}
const safetyColumns = ['year', 'month', 'division', 'site', 'sif_count', 'potential_sif_count', 'near_miss_count'];

test('OTD reads Databricks across reporting years and preserves the API row contract', async (t) => {
  connect(t);
  const columns = ['Timeline', 'Program', 'Division', 'Business Unit', 'Project ID', 'Site', 'Type', 'JAN', 'FEB', 'Year'];
  const rows = [
    ['Contract Commitment', 'Program A', 'Weapon Systems', 'WS Armament Systems', 'P1', 'Facility A', 'Delivery', '10', null, '2025'],
    ['Actuals Delivered', 'Program A', 'Weapon Systems', 'WS Armament Systems', 'P1', 'Facility A', 'Delivery', '8', '2', '2026']
  ];
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.match(url, /^https:\/\/warehouse.example.test\/api\/2.0\/sql\/statements/);
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    if (init.method === 'POST') {
      posts += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.warehouse_id, 'test-warehouse');
      assert.match(body.statement, /FROM `integrated_operations_dev`\.`analytics`\.`otd`/);
      assert.match(body.statement, /`Business Unit`/);
      assert.doesNotMatch(body.statement, /\[|ecosystem_source/);
      return Response.json(result(columns, rows.slice(0, 1), {
        manifest: { schema: { columns: columns.map((name) => ({ name })) }, total_row_count: 2 },
        result: { data_array: rows.slice(0, 1), next_chunk_internal_link: '/api/2.0/sql/statements/test-statement/result/chunks/1' }
      }));
    }
    return Response.json({ data_array: rows.slice(1) });
  });
  const payload = await readOtdData();
  assert.equal(posts, 1);
  assert.equal(payload.source, 'databricks');
  assert.equal(payload.tableName, 'integrated_operations_dev.analytics.otd');
  assert.equal(payload.rowCount, 2);
  assert.deepEqual(payload.rows.map((r) => r.year), [2025, 2026]);
  assert.deepEqual(payload.rows.map((r) => r.JAN), [10, 8]);
  assert.equal(payload.rows[0].FEB, null);
  assert.equal(payload.rows[1].measure_type, 'Actuals Delivered');
  assert.equal(payload.rows[0].business_unit, 'WS Armament Systems');
  assert.equal(payload.rows[0].project_id, 'P1');
});

test('SIF and pSIF use Databricks monthly totals without a SQL connection', async (t) => {
  connect(t);
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const statement = JSON.parse(init.body).statement;
    assert.match(statement, /FROM `integrated_operations_dev`\.`analytics`\.`safety_events`/);
    assert.match(statement, /TRY_CAST\(source\.`Date` AS DATE\)/);
    assert.match(statement, /source\.`sif_flag` = 0\s+AND source\.`potential_sif_flag` = 1/);
    assert.match(statement, /source\.`potential_sif_flag` = 0\s+AND source\.`near_miss_flag` = 1/);
    assert.doesNotMatch(statement, /TRY_CONVERT|\[/);
    return Response.json(result(safetyColumns, [['2026', '1', ' DS Weapon Systems ', ' Facility A ', '2', '3', '4']]));
  });
  const payload = await readSafetyEventMetricsData();
  const sif = getSafetyMetricPayload(payload, 'sif');
  const psif = getSafetyMetricPayload(payload, 'potentialSif');
  assert.equal(sif.source, 'databricks');
  assert.equal(sif.tableName, 'integrated_operations_dev.analytics.safety_events');
  assert.equal(sif.rows[0].actual_value, 2);
  assert.equal(psif.rows[0].actual_value, 3);
  assert.equal(sif.rows[0].division, 'DS Weapon Systems');
  assert.equal(sif.rows[0].site, 'Facility A');
  assert.equal(sif.rows[0].date, '2026-01-01');
  assert.equal(payload.metrics.nmfr, undefined);
});

test('NMFR combines Databricks near misses with the existing SQL roster denominator', async (t) => {
  connect(t);
  const before = rosterCalls.length;
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(result(safetyColumns, [[2026, 1, 'DS Weapon Systems', 'Facility A', 0, 0, 4]])));
  const payload = await readSafetyNmfrData();
  const nmfr = getSafetyMetricPayload(payload, 'nmfr');
  assert.equal(rosterCalls.length, before + 1);
  assert.equal(nmfr.source, 'databricks');
  assert.equal(nmfr.rosterTableName, 'RosterExtractFarm');
  assert.equal(nmfr.defenseSystemsEmployeeCount, 100);
  assert.equal(nmfr.rows[0].near_miss_count, 4);
  assert.equal(nmfr.rows[0].working_days, 22);
  assert.equal(nmfr.rows[0].actual_value, 45.45);
});

test('Databricks failures retain local OTD and safety fallbacks with a visible reason', async (t) => {
  connect(t);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ message: 'TABLE_NOT_FOUND' }, { status: 404 }));
  const otd = await readOtdData();
  assert.equal(otd.source, 'excel');
  assert.match(otd.fallbackReason, /TABLE_NOT_FOUND/);
  assert.equal(otd.rows[0].JAN, 5);
  const safety = await readSafetyEventMetricsData();
  assert.equal(safety.source, 'json');
  assert.match(safety.fallbackReason, /TABLE_NOT_FOUND/);
  // Overlapping event flags retain SIF > pSIF > Near Miss classification.
  assert.equal(safety.metrics.sif.rows[0].actual_value, 1);
  assert.equal(safety.metrics.potentialSif.rows[0].actual_value, 1);
});

test('Databricks transport polls running statements and rejects incomplete or failed results', async (t) => {
  connect(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => Response.json(++calls === 1
    ? { statement_id: 'test-statement', status: { state: 'RUNNING' } }
    : result(['value'], [['12']])));
  const args = { scope: 'test', tableName: 'test', query: 'SELECT 12' };
  assert.deepEqual(await executeDatabricksQuery(args), [{ value: '12' }]);
  assert.equal(calls, 2);
  t.mock.method(globalThis, 'fetch', async () => Response.json(result(['value'], [], {
    manifest: { total_row_count: 1, truncated: true }
  })));
  await assert.rejects(executeDatabricksQuery(args), /Incomplete Databricks result/);
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    status: { state: 'FAILED', error: { message: 'Permission denied' } }
  }));
  await assert.rejects(executeDatabricksQuery(args), /Permission denied/);
  delete process.env.DATABRICKS_TOKEN;
  await assert.rejects(executeDatabricksQuery(args), /Missing Databricks environment variables: DATABRICKS_TOKEN/);
});
