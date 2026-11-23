import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

test('Databricks facility grouping preserves aliases, original labels and shared caching', async (t) => {
  const settings = {
    DATABRICKS_HOST: 'lookup.example.test',
    DATABRICKS_TOKEN: 'test-token',
    DATABRICKS_SQL_WAREHOUSE_ID: 'test-warehouse'
  };
  for (const [name, value] of Object.entries(settings)) {
    const before = process.env[name];
    process.env[name] = value;
    t.after(() => before === undefined ? delete process.env[name] : process.env[name] = before);
  }
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls += 1;
    const query = JSON.parse(init.body).statement;
    assert.match(query, /FROM `integrated_operations_dev`\.`analytics`\.`facilitygroupings`/);
    assert.doesNotMatch(query, /TRY_CONVERT|nvarchar|\[qmi\]/);
    return Response.json({
      status: { state: 'SUCCEEDED' },
      manifest: {
        schema: { columns: [{ name: 'original' }, { name: 'group' }] },
        total_row_count: 2
      },
      result: { data_array: [['Old Site', 'Grouped Site'], ['Other Site', 'Grouped Site']] }
    });
  });
  const { applyFacilityGroupingsToPayload, readFacilityGroupingHierarchy } =
    await import('../facilityGroupingsRepository.js');
  const source = { rows: [{ facility: ' old  SITE ', value: 7 }, { facility: 'Unmapped', value: 3 }] };
  const before = structuredClone(source);
  const [mapped, hierarchy] = await Promise.all([
    applyFacilityGroupingsToPayload(source, 'labor-new'),
    readFacilityGroupingHierarchy()
  ]);
  assert.equal(calls, 1);
  assert.equal(hierarchy.source, 'databricks');
  assert.equal(hierarchy.tableName, 'integrated_operations_dev.analytics.facilitygroupings');
  assert.equal(mapped.rows[0].facility, 'Grouped Site');
  assert.equal(mapped.rows[0].__facility_original, 'old SITE');
  assert.equal(mapped.rows[0].value, 7);
  assert.equal(mapped.rows[1].facility, 'Unmapped');
  assert.deepEqual(source, before);
});

test('server setup excludes disabled labor datasets from startup, refresh and routes', async () => {
  const source = await fs.readFile(new URL('../index.js', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"];\n/gm)];
  const context = {};
  for (const [, binding] of imports) {
    const names = binding.replace(/[{}]/g, '').split(',').map((name) => name.trim()).filter(Boolean);
    for (const name of names) context[name] = () => {};
  }
  const loaders = new Map();
  const routes = [];
  const app = { use() {}, get(route) { routes.push(...[route].flat()); }, put() {} };
  Object.assign(context, {
    express: Object.assign(() => app, { json: () => () => {} }),
    path, fileURLToPath,
    process: { env: { NODE_ENV: 'test' } },
    registerSqlDatasetCache: (name, loader) => loaders.set(name, loader),
    readLaborUtilizationData: () => assert.fail('legacy labor loader ran'),
    readLaborDatabricksData: () => assert.fail('disabled Databricks labor loader ran')
  });
  // Evaluate the real registrations with stubs; never listen or connect to a database.
  const setup = source.slice(0, source.indexOf('const { port, bindHost, connectHost }'))
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(new URL('../index.js', import.meta.url).href));
  vm.runInNewContext(setup, context);
  assert.equal(loaders.has('labor'), false);
  assert.equal(loaders.has('labor-databricks'), false);
  for (const loader of loaders.values()) await loader();
  for (const route of ['/api/labor-utilization', '/labor-diagnostics', '/api/labor-diagnostics']) {
    assert.equal(routes.includes(route), false, route);
  }
  assert.ok(routes.includes('/api/labor-utilization-new'));
  assert.equal(routes.includes('/api/labor-databricks'), false);
});
