import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { getNextRefreshDate } from '../sqlDatasetCache.js';

const laborSnapshot = 'integrated_operations_dev.analytics.templabor1124';
const source = { updated: '2026-11-24T17:02:01.1234567', row_count: '42' };
let saved, reads, extracts, statements, lockResult, released;
function reset(properties, signatures = [source, source]) {
  saved = properties;
  reads = [...signatures];
  extracts = 0;
  statements = [];
  lockResult = 0;
  released = false;
}
await mock.module('mssql', { defaultExport: {
  Transaction: class { async begin() {} async rollback() { released = true; } },
  Request: class { async query() { return { recordset: [{ result: lockResult }] }; } }
} });
await mock.module('../sqlConnection.js', { namedExports: {
  getConnectionConfig: () => ({ config: {}, missing: [] }),
  getPool: async () => ({ request: () => ({ query: async () => ({ recordset: [reads.shift()] }) }) })
} });
await mock.module('../laborUtilizationNewRepository.js', { namedExports: {
  laborSnapshot, extractJoinedLaborRows: async () => { extracts++; return [{ entered_hours: 1.25 }]; }
} });
await mock.module('../databricksQuery.js', { namedExports: {
  executeDatabricksQuery: async ({ query }) => {
    statements.push(query);
    if (query.startsWith('SHOW TABLES')) return saved === null ? [] : [{ tableName: 'templabor1124' }];
    if (query.startsWith('SHOW TBLPROPERTIES')) return Object.entries(saved).map(([key, value]) => ({ key, value }));
    if (query.startsWith('SELECT COUNT(*)')) return [{ n: 1, hours: 1.25 }];
    return [];
  }
} });
const { refreshLaborSnapshot } = await import('../laborSnapshotRefresh.js');
const signature = { 'qmi.laborDate': source.updated, 'qmi.laborRows': '42' };
const published = () => statements.some(query => query.startsWith('CREATE OR REPLACE'));

test('daily check skips the full extract only for a matching published signature', async () => {
  reset(signature);
  await refreshLaborSnapshot();
  assert.equal(extracts, 0);
  assert.ok(!published() && released);
  for (const previous of [null, {}, { ...signature, 'qmi.laborRows': '41' },
    { ...signature, 'qmi.laborDate': '2026-11-24T17:02:01.1234566' }]) {
    reset(previous);
    await refreshLaborSnapshot();
    assert.equal(extracts, 1);
    assert.ok(published() && released);
    assert.match(statements.find(s => s.startsWith('CREATE OR REPLACE')), /labor_update_date[\s\S]+labor_row_count[\s\S]+last_updated/);
  }
});
test('mid-extract changes keep the old snapshot and discard the staging table', async () => {
  reset({}, [source, { ...source, row_count: '43' }]);
  await assert.rejects(refreshLaborSnapshot(), /changed during the extract/);
  assert.ok(!published() && released);
  assert.match(statements.at(-1), /^DROP TABLE/);
});
test('concurrent publisher skips and the manual command can force a refresh', async () => {
  reset(signature);
  lockResult = -1;
  await refreshLaborSnapshot();
  assert.ok(released && extracts === 0 && statements.length === 0);
  reset(signature);
  await refreshLaborSnapshot({ force: true });
  assert.ok(published() && released);
});
test('3 AM Eastern follows both DST transitions', () => {
  for (const [now, next] of [
    ['2026-03-07T12:00:00Z', '2026-03-08T07:00:00.000Z'],
    ['2026-10-31T12:00:00Z', '2026-11-01T08:00:00.000Z'],
    ['2026-11-25T07:59:00Z', '2026-11-25T08:00:00.000Z']
  ]) assert.equal(getNextRefreshDate(new Date(now), 'America/New_York', 3, 0).toISOString(), next);
});
