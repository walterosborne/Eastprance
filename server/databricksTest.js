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

function networkFailureMessage(error, url) {
  const cause = error?.cause;
  const code = cause?.code || cause?.errno || error?.code || '';
  const detail = cause?.message || error?.message || String(error);

  const hints = [];
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    hints.push('DNS could not resolve the Databricks hostname. Re-copy Server hostname from Connection details.');
  }
  if (
    String(code).includes('CERT') ||
    String(code).includes('TLS') ||
    /certificate|self[- ]signed|unable to verify/i.test(detail)
  ) {
    hints.push('TLS certificate validation failed. A corporate CA may need to be supplied to Node with NODE_EXTRA_CA_CERTS.');
  }
  if (['ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
    hints.push('The HTTPS connection could not be established. Check VPN/firewall/proxy access to Databricks on port 443.');
  }

  const lines = [
    `Unable to reach Databricks endpoint: ${url}`,
    `Network error${code ? ` (${code})` : ''}: ${detail}`
  ];

  if (hints.length > 0) {
    lines.push(...hints.map((hint) => `Hint: ${hint}`));
  } else {
    lines.push('Hint: This failed before Databricks returned an HTTP response, so the PAT and warehouse have not been validated yet.');
  }

  return new Error(lines.join('\n'), { cause: error });
}

async function databricksRequest({ host, token }, path, options = {}) {
  const url = `https://${host}${path}`;
  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw networkFailureMessage(error, url);
  }

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
