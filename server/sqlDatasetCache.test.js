import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCachedSqlDataset,
  registerSqlDatasetCache,
  warmAllSqlDatasetCaches
} from './sqlDatasetCache.js';

test('a failed refresh does not serve an older card payload', async () => {
  let online = true;
  registerSqlDatasetCache('test-no-fallback', async () => {
    if (!online) throw new Error('Live source unavailable');
    return { source: 'databricks', rowCount: 1, rows: [{ value: 1 }] };
  });

  const first = await getCachedSqlDataset('test-no-fallback');
  assert.equal(first.rows[0].value, 1);

  online = false;
  await warmAllSqlDatasetCaches('test refresh');
  await assert.rejects(getCachedSqlDataset('test-no-fallback'), /Live source unavailable/);
  await assert.rejects(
    getCachedSqlDataset('test-no-fallback', { refresh: true }),
    /Live source unavailable/
  );
});
