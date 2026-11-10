import { logDebug } from './debugLogger.js';

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 180000;
const TERMINAL_FAILURE_STATES = new Set(['FAILED', 'CANCELED', 'CLOSED']);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function requiredDatabricksEnvironment() {
  const host = normalizeText(process.env.DATABRICKS_HOST);
  const token = normalizeText(process.env.DATABRICKS_TOKEN);
  const warehouseId = normalizeText(process.env.DATABRICKS_SQL_WAREHOUSE_ID);
  const missing = [];

  if (!host) missing.push('DATABRICKS_HOST');
  if (!token) missing.push('DATABRICKS_TOKEN');
  if (!warehouseId) missing.push('DATABRICKS_SQL_WAREHOUSE_ID');

  if (missing.length > 0) {
    throw new Error(`Missing Databricks environment variables: ${missing.join(', ')}`);
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
    hints.push('DNS could not resolve the Databricks hostname.');
  }

  if (
    String(code).includes('CERT')
    || String(code).includes('TLS')
    || /certificate|self[- ]signed|unable to verify/i.test(detail)
  ) {
    hints.push('TLS certificate validation failed; the corporate CA may need to be provided to Node.');
  }

  if (['ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
    hints.push('The HTTPS connection could not be established; check VPN/firewall access to Databricks.');
  }

  return new Error(
    [
      `Unable to reach Databricks endpoint: ${url}`,
      `Network error${code ? ` (${code})` : ''}: ${detail}`,
      ...hints.map((hint) => `Hint: ${hint}`)
    ].join('\n'),
    { cause: error }
  );
}

async function databricksRequest(connection, pathOrUrl, options = {}) {
  const url = /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : `https://${connection.host}${pathOrUrl}`;
  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${connection.token}`,
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

    await sleep(POLL_INTERVAL_MS);
    response = await databricksRequest(
      connection,
      `/api/2.0/sql/statements/${encodeURIComponent(response.statement_id)}`
    );
  }

  return response;
}

function formatRows(columns, data) {
  return data.map((row) => {
    const formatted = {};

    row.forEach((value, index) => {
      formatted[columns[index]?.name || `column_${index + 1}`] = value;
    });

    return formatted;
  });
}

async function collectStatementRows(connection, response) {
  const columns = response?.manifest?.schema?.columns || [];
  const rows = [...(response?.result?.data_array || [])];
  let nextChunkLink = response?.result?.next_chunk_internal_link || null;

  while (nextChunkLink) {
    const chunk = await databricksRequest(connection, nextChunkLink);
    const chunkResult = chunk?.result ?? chunk;

    for (const row of chunkResult?.data_array || []) {
      rows.push(row);
    }
    nextChunkLink = chunkResult?.next_chunk_internal_link || null;
  }

  const expectedRowCount = response?.manifest?.total_row_count;
  if (response?.manifest?.truncated
    || (expectedRowCount != null && rows.length !== Number(expectedRowCount))) {
    throw new Error(
      `Incomplete Databricks result: received ${rows.length} of ${expectedRowCount ?? 'unknown'} rows.`
    );
  }

  return formatRows(columns, rows);
}

export async function executeDatabricksQuery({ scope, tableName, query }) {
  const connection = requiredDatabricksEnvironment();

  logDebug(scope, 'Executing Databricks query.', {
    tableName,
    warehouseId: connection.warehouseId
  });

  const initialResponse = await databricksRequest(connection, '/api/2.0/sql/statements', {
    method: 'POST',
    body: JSON.stringify({
      warehouse_id: connection.warehouseId,
      statement: query,
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

  return collectStatementRows(connection, response);
}

