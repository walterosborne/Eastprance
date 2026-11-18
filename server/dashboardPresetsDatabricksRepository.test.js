import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDashboardPresetsOverview, saveDashboardPreset } from './dashboardPresetsRepository.js';

function setConnection(t) {
  for (const [key, value] of Object.entries({
    DATABRICKS_HOST: 'databricks.example.test',
    DATABRICKS_TOKEN: 'test-token',
    DATABRICKS_SQL_WAREHOUSE_ID: 'test-warehouse'
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => previous === undefined ? delete process.env[key] : process.env[key] = previous);
  }
}

const user = { my_id: "A'1", network_id: 'test.user', name: 'Test User' };

test('preset reads and saves use named parameters and preserve the API shape', async (t) => {
  setConnection(t);
  const statements = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body);
    statements.push(body);
    if (body.statement.includes('MERGE INTO')) {
      return Response.json({ status: { state: 'SUCCEEDED' } });
    }
    assert.match(body.statement, /WHERE MyID = :myId/);
    assert.ok(!body.statement.includes(user.my_id));
    return Response.json({
      status: { state: 'SUCCEEDED' },
      manifest: {
        schema: { columns: ['PresetSlot', 'PresetName', 'PresetState', 'CreatedAt', 'UpdatedAt']
          .map((name) => ({ name })) },
        total_row_count: 1
      },
      result: { data_array: [['2', 'Saved', '{"view":"line"}', '2026-01-01', '2026-11-18']] }
    });
  });

  const overview = await readDashboardPresetsOverview(user);
  assert.equal(overview.storageAvailable, true);
  assert.deepEqual(overview.presets[0].state, { view: 'line' });
  const saved = await saveDashboardPreset(user, 2, "A's preset", { view: 'line' });
  assert.equal(saved.preset.slot, 2);
  const merge = statements.find((entry) => entry.statement.includes('MERGE INTO'));
  assert.match(merge.statement, /target.MyID = source.MyID AND target.PresetSlot = source.PresetSlot/);
  assert.ok(!merge.statement.includes("A's preset"));
  assert.deepEqual(merge.parameters.find((parameter) => parameter.name === 'myId'),
    { name: 'myId', value: "A'1", type: 'STRING' });
  assert.deepEqual(merge.parameters.find((parameter) => parameter.name === 'presetSlot'),
    { name: 'presetSlot', value: '2', type: 'BIGINT' });
  assert.equal(merge.parameters.find((parameter) => parameter.name === 'presetName').value,
    "A's preset");
});

test('preset failures are visible, and invalid slots never write', async (t) => {
  setConnection(t);
  const requests = t.mock.method(globalThis, 'fetch',
    async () => Response.json({ message: 'TABLE_OR_VIEW_NOT_FOUND' }, { status: 404 }));
  const overview = await readDashboardPresetsOverview(user);
  assert.equal(overview.storageAvailable, false);
  assert.match(overview.storageMessage, /not been migrated/);
  await assert.rejects(saveDashboardPreset(user, 1, 'Name', {}), /TABLE_OR_VIEW_NOT_FOUND/);
  const count = requests.mock.callCount();
  await assert.rejects(saveDashboardPreset(user, 4, 'Invalid', {}), /between 1 and 3/);
  assert.equal(requests.mock.callCount(), count);
});
