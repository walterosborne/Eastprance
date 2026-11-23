import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import XLSX from 'xlsx';

const rows = [
  ['DS Alpha', 'ALPHA', 1], ['Alpha', 'DS Alpha', 2], ['DS Alpha', 'Beta', 400],
  ['DS Alpha', null, 300], ['DS Beta', 'BETA', 1], [null, null, 42]
].map(([division, roster, entered_hours], i) => ({
  division, roster, entered_hours, year: 2026, month: 9, my_id: String(i)
}));

await mock.module('../sqlConnection.js', { namedExports: {
  getConnectionConfig: () => ({ config: {}, missing: [] }),
  getPool: async () => ({ request: () => ({ query: async () => ({ recordset: rows }) }) })
} });
await mock.module('../laborRosterDatabricksRepository.js', { namedExports: {
  getLaborRosterConfig: () => ({}),
  readLaborRosterLookup: async () => Object.assign(new Map(), {
    divisions: new Map(rows.map(row => [row.my_id, row.roster]))
  }),
  lookupMonthlyLaborFacility: (row, lookup) => lookup.get(row.my_id)
} });
const { renderLaborRosterComparison } = await import('../diagnostics/laborRosterComparison.js');

test('new roster download counts every hierarchy row once, including rows without a roster division', async () => {
  const html = await renderLaborRosterComparison();
  const encoded = html.match(/download="labor-facility-new\.xlsx" href="[^"]*?base64,([^"]+)"/)[1];
  const book = XLSX.read(encoded, { type: 'base64', cellNF: true });
  assert(book.SheetNames.includes('division comparison'));
  const sheet = book.Sheets['Division agreement'];
  const [headers, ...data] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  assert.equal(headers.at(-1), 'Same division %');
  assert.deepEqual(data, [
    ['ALPHA', 4, 2, 1, 0.5], ['BETA', 1, 1, 0, 1], ['(Unknown)', 1, 0, 1, null]
  ]);
  assert.equal(sheet.E2.z, '0.00%');
});
