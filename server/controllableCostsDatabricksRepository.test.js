import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const cwi = 'DS C2 & Weapons Integration';
const sds = 'DS Strategic Deterrent Systems';
await mock.module('./sqlConnection.js', {
  namedExports: {
    getConnectionConfig: () => ({ config: {}, missing: [] }),
    formatSqlIdentifier: (name) => name,
    getPool: async () => ({
      request: () => ({
        query: async (sql) => {
          if (sql.includes('ranked_hierarchy')) return { recordset: [
            { cost_center: 'CWI1', division: cwi, business_unit: 'CWI BU' },
            { cost_center: 'SDS1', division: sds, business_unit: 'SDS BU' },
            { cost_center: 'TDA87FC0', division: sds, business_unit: 'SDS BU' }
          ] };
          if (sql.includes('costcenterkey')) return { recordset: [
            { cost_center: 'CWI1', facility: 'Facility A' },
            { cost_center: 'SDS1', facility: 'Facility B' }
          ] };
          if (sql.includes('cost_element_key')) return { recordset: [
            { cost_element: '4300591', controllable: 'Controllable' }
          ] };
          return { recordset: [] };
        }
      })
    })
  }
});

const {
  readControllableCostsDatabricksNewData,
  readControllableCostsDatabricksRawData
} = await import('./controllableCostsDatabricksRepository.js');

const columns = ['year', 'month', 'cost_center', 'gl_account_cost_element', 'cost_element_description', 'cost'];
const row = (center, account, cost) => [2025, 1, center, account, 'Rent', cost];
const result = (rows, extra = {}) => ({
  statement_id: 'cost-test',
  status: { state: 'SUCCEEDED' },
  manifest: { schema: { columns: columns.map((name) => ({ name })) } },
  result: { data_array: rows, ...extra }
});

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

test('new ledger preserves credits, QMI scope, central SDS facilities and chunked results', async (t) => {
  setConnection(t);
  let statement;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    if (init.method === 'POST') {
      statement = JSON.parse(init.body).statement;
      return Response.json(result([
        row('CWI1', '0004300591', 100),
        row('SDS1', '4300591', 200),
        row('TDA87FC0', '4300591', 50),
        row('CWI1', '4300625', 999), // SDS-only account must not enter CWI.
        row('UNKNOWN', '4300591', 999)
      ], { next_chunk_internal_link: '/api/2.0/sql/statements/cost-test/result/chunks/1' }));
    }
    return Response.json({ data_array: [row('CWI1', '4300591', -25)] });
  });
  const payload = await readControllableCostsDatabricksNewData();
  assert.match(statement, /FROM `raw_landing_dev`.`sql_central_integration`.`src_lfc_transaction_details_s3`/);
  assert.match(statement, /UPPER\(TRIM\(CAST\(RCNTR AS STRING\)\)\) AS cost_center/);
  assert.match(statement, /TRY_CAST\(KSL AS DOUBLE\) AS cost/);
  assert.doesNotMatch(statement, /DOC_NET_VALUE|ABS\(/);
  assert.equal(payload.tableName, 'raw_landing_dev.sql_central_integration.src_lfc_transaction_details_s3');
  assert.equal(payload.amountField, 'KSL');
  assert.equal(payload.sourceKind, 'new');
  assert.equal(payload.totalCost, 325);
  assert.equal(payload.rows.find((r) => r.facility === 'Facility A').cost, 75);
  assert.equal(payload.rows.find((r) => r.facility === 'Strategic Deterrent Facility/Operations').cost, 50);
  assert.ok(payload.rows.every((r) => r.controllable === 'Controllable'));
  assert.equal(payload.excludedBySqlScopeRowCount, 1);
  assert.equal(payload.hierarchyUnmatchedRowCount, 1);
});

test('existing raw card retains its original table and amount field', async (t) => {
  setConnection(t);
  let statement;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    statement = JSON.parse(init.body).statement;
    return Response.json(result([row('CWI1', '4300591', -12)]));
  });
  const payload = await readControllableCostsDatabricksRawData();
  assert.match(statement, /FROM `finance_dev`.`analytics`.`dev_cv_transaction_details`/);
  assert.match(statement, /TRY_CAST\(DOC_NET_VALUE AS DOUBLE\) AS cost/);
  assert.equal(payload.amountField, 'DOC_NET_VALUE');
  assert.equal(payload.totalCost, -12);
});

test('new ledger fails explicitly when the source cannot be queried', async (t) => {
  setConnection(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'TABLE_NOT_FOUND' }, { status: 404 }));
  await assert.rejects(readControllableCostsDatabricksNewData(), /TABLE_NOT_FOUND/);
});

test('new ledger supports external result links and completed-month scoping', async (t) => {
  setConnection(t);
  const originalFetch = globalThis.fetch;
  let statement;
  globalThis.fetch = async (url, init) => {
    if (url === 'https://storage.example.test/result') {
      assert.equal(init?.headers?.Authorization, undefined);
      return Response.json([row('CWI1', '4300591', -7)]);
    }
    const body = JSON.parse(init.body);
    statement = body.statement;
    assert.equal(body.disposition, 'EXTERNAL_LINKS');
    return Response.json({
      ...result([]),
      manifest: { schema: { columns: columns.map((name) => ({ name })) }, total_row_count: 1 },
      result: { external_links: [{ external_link: 'https://storage.example.test/result' }] }
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    delete globalThis.__qmiDatabricksLargeResultFetchEnabled;
  });
  const { enableDatabricksExternalLinksForCostResults } = await import('./databricksExternalLinksFetch.js');
  enableDatabricksExternalLinksForCostResults();
  const payload = await readControllableCostsDatabricksNewData();
  const now = new Date();
  assert.ok(statement.includes(`year < ${now.getUTCFullYear()}`));
  assert.ok(statement.includes(`month <= ${now.getUTCMonth()}`));
  assert.equal(payload.totalCost, -7);
});
