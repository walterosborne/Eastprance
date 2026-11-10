import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { buildBuDivisionEntries, canonicalizeBuGroupSelections, makeBuEntryChildToken } from '../client/src/buGroupingUtils.js';
import { businessUnitFilterMatches, makeBusinessUnitChildToken, makeBusinessUnitDivisionToken, makeBusinessUnitOtherToken } from '../client/src/hierarchyFilterUtils.js';

let queryCount = 0;
let mappings = [
  { original: 'WS Old Name', group: 'Proper BU' },
  { original: 'WS Other Name', group: 'Proper BU' },
  { original: 'SDS BU', group: 'Strategic BU' }
];
await mock.module('./sqlConnection.js', {
  namedExports: {
    getConnectionConfig: () => ({ config: {}, missing: [] }),
    formatSqlIdentifier: (name) => {
      assert.ok(['qmi.bugroupings', 'qmi.businessunits'].includes(name));
      return name.split('.').map((part) => `[${part}]`).join('.');
    },
    getPool: async () => ({
      request: () => ({
        query: async (statement) => {
          queryCount += 1;
          assert.match(statement, /FROM \[qmi\]\.\[bugroupings\]/);
          assert.match(statement, /source\.\[Original\]/);
          assert.match(statement, /INNER JOIN \[qmi\]\.\[businessunits\] AS businessUnit/);
          assert.match(statement, /businessUnit\.\[Id\] = source\.\[BusinessUnitId\]/);
          assert.match(statement, /businessUnit\.\[Name\]/);
          assert.doesNotMatch(statement, /source\.\[Group\]/);
          return { recordset: mappings };
        }
      })
    })
  }
});

test('BU mappings merge names across cards without mutating cached datasets or measures', async () => {
  const { applyBuGroupingsToPayload, readBuGroupingTitles } = await import('./buGroupingsRepository.js');
  const payload = { rows: [
    { division: 'Weapon Systems', business_unit: '  ws old NAME ', value: 10 },
    { division: 'Weapon Systems', business_unit: 'WS Other Name', value: 20 },
    { division: 'Strategic Deterrent Systems', business_unit: 'SDS BU', value: 30 },
    { division: 'Weapon Systems', business_unit: 'Unlisted', value: 40 }
  ] };
  const before = structuredClone(payload);
  const scopes = ['otd', 'customer-escapes', 'controllable-costs-new', 'controllable-costs-hana',
    'controllable-costs-databricks', 'controllable-costs-databricks-raw',
    'controllable-costs-databricks-new', 'labor-new', 'labor-hana'];
  const results = await Promise.all(scopes.map((scope) => applyBuGroupingsToPayload(payload, scope)));
  assert.equal(queryCount, 1, 'concurrent mappings share one cached SQL read');
  for (const result of results) {
    assert.deepEqual(result.rows.map((r) => r.business_unit), ['Proper BU', 'Proper BU', 'Strategic BU', 'Unlisted']);
    assert.equal(result.rows[0].__business_unit_original, 'ws old NAME');
    assert.deepEqual(result.rows.map((r) => r.__business_unit_mapped), [true, true, true, false]);
    const selected = result.rows.filter((r) => businessUnitFilterMatches('Proper BU', r.division, r.business_unit));
    assert.equal(selected.length, 2);
    assert.equal(selected.reduce((sum, r) => sum + r.value, 0), 30);
  }
  assert.deepEqual(payload, before);
  assert.equal(await applyBuGroupingsToPayload(payload, 'sif'), payload);
  const titles = await readBuGroupingTitles();
  assert.equal(titles.tableName, 'qmi.bugroupings');
  assert.equal(titles.businessUnitTableName, 'qmi.businessunits');
  assert.deepEqual(titles.groups.map((g) => g.group), ['Proper BU', 'Strategic BU']);
});

test('divisions expose mapped titles and Other only when mapped and unmapped BUs coexist', () => {
  const hierarchy = [
    { division: 'Mixed', mappedBusinessUnits: ['Proper BU', 'Proper BU'], unmappedBusinessUnits: ['Unknown A', 'Unknown B', ''] },
    { division: 'Unmapped', mappedBusinessUnits: [], unmappedBusinessUnits: ['Unknown C', 'Unknown D'] },
    { division: 'Mapped', mappedBusinessUnits: ['Strategic BU'], unmappedBusinessUnits: [] }
  ];
  const entries = buildBuDivisionEntries(hierarchy);
  const mixed = entries.find((e) => e.parent === 'Mixed');
  const unmapped = entries.find((e) => e.parent === 'Unmapped');
  const mapped = entries.find((e) => e.parent === 'Mapped');
  assert.deepEqual(mixed.children, ['Proper BU', 'Other']);
  assert.equal(mixed.label, 'Mixed');
  assert.equal(unmapped.label, 'Unmapped (All)');
  assert.deepEqual(unmapped.children, []);
  assert.deepEqual(mapped.children, ['Strategic BU']);
  assert.equal(mapped.label, 'Mapped');
  const other = makeBuEntryChildToken(mixed, 'Other');
  assert.equal(other, makeBusinessUnitOtherToken('Mixed'));
  for (const name of ['Unknown A', 'Unknown B', '']) {
    assert.equal(businessUnitFilterMatches(other, 'Mixed', name, false), true);
  }
  assert.equal(businessUnitFilterMatches(other, 'Mixed', 'Proper BU', true), false);
  assert.equal(businessUnitFilterMatches(other, 'Unmapped', 'Unknown C', false), false);
  const all = makeBusinessUnitDivisionToken('Unmapped');
  assert.equal(businessUnitFilterMatches(all, 'Unmapped', 'Unknown C', false), true);
  assert.equal(businessUnitFilterMatches(all, 'Unmapped', 'Unknown D', false), true);
  const proper = makeBuEntryChildToken(mixed, 'Proper BU');
  assert.equal(businessUnitFilterMatches(proper, 'Mixed', 'Proper BU', true), true);
  assert.equal(businessUnitFilterMatches(proper, 'Different division', 'Proper BU', true), false);
  assert.equal(businessUnitFilterMatches(proper, 'Mixed', 'Proper BU', false), false);
});

test('saved BU choices migrate to scoped groups, Other, or the whole unmapped division', () => {
  const groups = [{ group: 'Proper BU', originals: ['WS Old Name', 'WS Other Name'] }];
  const hierarchy = [
    { division: 'Weapon Systems', mappedBusinessUnits: ['Proper BU'], unmappedBusinessUnits: ['Unlisted'] },
    { division: 'Strategic', mappedBusinessUnits: [], unmappedBusinessUnits: ['Legacy SDS'] }
  ];
  assert.deepEqual(canonicalizeBuGroupSelections([
    makeBusinessUnitChildToken('Weapon Systems', 'WS Old Name'),
    makeBusinessUnitChildToken('Weapon Systems', 'WS Other Name')
  ], groups, hierarchy), [makeBusinessUnitChildToken('Weapon Systems', 'Proper BU')]);
  assert.deepEqual(canonicalizeBuGroupSelections(['Unlisted'], groups, hierarchy),
    [makeBusinessUnitOtherToken('Weapon Systems')]);
  assert.deepEqual(canonicalizeBuGroupSelections(['Legacy SDS'], groups, hierarchy),
    [makeBusinessUnitDivisionToken('Strategic')]);
  const selection = makeBusinessUnitDivisionToken('Weapon Systems');
  assert.deepEqual(canonicalizeBuGroupSelections([selection], groups, hierarchy), [selection]);
});

test('blank BU values are retained and marked as unmapped', async () => {
  const { applyBuGroupingsToPayload } = await import('./buGroupingsRepository.js');
  const payload = await applyBuGroupingsToPayload({
    rows: [{ business_unit: '' }, { business_unit: null }]
  }, 'otd');
  assert.deepEqual(payload.rows.map((r) => r.__business_unit_mapped), [false, false]);
  assert.deepEqual(payload.rows.map((r) => r.business_unit), ['', null]);
});

test('conflicting mappings do not silently select the wrong BU or break source datasets', async () => {
  mappings = [{ original: 'BU', group: 'One' }, { original: 'bu', group: 'Two' }];
  const { readBuGroupingTitles, applyBuGroupingsToPayload } =
    await import('./buGroupingsRepository.js?conflict-test');
  await assert.rejects(readBuGroupingTitles(), /conflicting real BUs/);
  const source = { rows: [{ business_unit: 'BU', value: 10 }] };
  const payload = await applyBuGroupingsToPayload(source, 'otd');
  assert.equal(payload.rows, source.rows);
  assert.equal(payload.businessUnitGroupingWarning, 'BU groupings unavailable.');
});
