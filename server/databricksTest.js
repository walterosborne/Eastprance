import { loadEnvironment } from './loadEnvironment.js';

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 90000;
const TERMINAL_FAILURE_STATES = new Set(['FAILED', 'CANCELED', 'CLOSED']);

function requiredEnvironment() {
  const host = String(process.env.DATABRICKS_HOST || '').trim();
  const token = String(process.env.DATABRICKS_TOKEN || '').trim();
  const warehouseId = String(process.env.DATABRICKS_SQL_WAREHOUSE_ID || '').trim();

  const missing = [];
  if (!host) missing.push('DATABRICKS_HOST');
  if (!token) missing.push('DATABRICKS_TOKEN');
  if (!warehouseId) missing.push('DATABRICKS_SQL_WAREHOUSE_ID');

  if (missing.length > 0) {
    throw new Error(
      `Missing Databricks environment variable${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`
    );
  }

  return {
    host: host.replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
    token,
    warehouseId
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function databricksRequest({ host, token }, path, options = {}) {
  const response = await fetch(`https://${host}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let body = {};

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }

  if (!response.ok) {
    const detail = body?.message || body?.error?.message || response.statusText || 'Unknown Databricks error';
    throw new Error(`Databricks request failed (${response.status}): ${detail}`);
  }

  return body;
}

async function waitForStatement(connection, statementResponse) {
  let response = statementResponse;
  const startedAt = Date.now();

  while (response?.status?.state === 'PENDING' || response?.status?.state === 'RUNNING') {
    if (!response.statement_id) {
      throw new Error('Databricks returned a pending statement without a statement_id.');
    }

    if (Date.now() - startedAt >= MAX_WAIT_MS) {
      throw new Error(`Timed out waiting for Databricks statement ${response.statement_id}.`);
    }

    console.log(`[databricks] Statement state: ${response.status.state}. Waiting...`);
    await sleep(POLL_INTERVAL_MS);
    response = await databricksRequest(
      connection,
      `/api/2.0/sql/statements/${encodeURIComponent(response.statement_id)}`
    );
  }

  return response;
}

function formatRows(response) {
  const columns = response?.manifest?.schema?.columns || [];
  const data = response?.result?.data_array || [];

  return data.map((row) => {
    const formatted = {};
    row.forEach((value, index) => {
      formatted[columns[index]?.name || `column_${index + 1}`] = value;
    });
    return formatted;
  });
}

async function main() {
  await loadEnvironment();
  const connection = requiredEnvironment();

  console.log(`[databricks] Connecting to ${connection.host}...`);
  console.log(`[databricks] SQL warehouse: ${connection.warehouseId}`);
  console.log('[databricks] Running connection test query: SELECT 1 AS databricks_connection_test');

  const initialResponse = await databricksRequest(connection, '/api/2.0/sql/statements', {
    method: 'POST',
    body: JSON.stringify({
      warehouse_id: connection.warehouseId,
      statement: 'SELECT 1 AS databricks_connection_test',
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
      wait_timeout: '10s',
      on_wait_timeout: 'CONTINUE'
    })
  });

  const response = await waitForStatement(connection, initialResponse);
  const state = response?.status?.state;

  if (TERMINAL_FAILURE_STATES.has(state)) {
    const detail = response?.status?.error?.message || 'No additional error detail returned.';
    throw new Error(`Databricks statement ended in ${state}: ${detail}`);
  }

  if (state !== 'SUCCEEDED') {
    throw new Error(`Unexpected Databricks statement state: ${state || 'UNKNOWN'}`);
  }

  console.log('[databricks] Connected successfully. Query result:');
  const rows = formatRows(response);

  if (rows.length > 0) {
    console.table(rows);
  } else {
    console.log('[databricks] Query succeeded but returned no rows.');
  }

  console.log('[databricks] Test complete.');
}

main().catch((error) => {
  console.error('[databricks] Connection test failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
