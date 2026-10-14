const COST_RESULT_TABLE_MARKERS = [
  'finance_dev.analytics.cost_vis_full',
  'finance_dev.analytics.dev_cv_transaction_details',
  '`finance_dev`.`analytics`.`cost_vis_full`',
  '`finance_dev`.`analytics`.`dev_cv_transaction_details`'
];
const RAW_COST_TABLE_MARKERS = [
  'finance_dev.analytics.dev_cv_transaction_details',
  '`finance_dev`.`analytics`.`dev_cv_transaction_details`'
];

const largeResultStatementIds = new Set();
const nativeFetch = globalThis.fetch.bind(globalThis);

function getRequestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input?.url || '';
}

function isDatabricksStatementEndpoint(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/api/2.0/sql/statements';
  } catch {
    return false;
  }
}

function getStatementIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    const match = /^\/api\/2\.0\/sql\/statements\/([^/]+)/.exec(parsed.pathname);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

function isLargeCostStatement(statement) {
  const sql = String(statement ?? '');
  return COST_RESULT_TABLE_MARKERS.some((marker) => sql.includes(marker));
}

function isRawCostStatement(statement) {
  const sql = String(statement ?? '');
  return RAW_COST_TABLE_MARKERS.some((marker) => sql.includes(marker));
}

function scopeRawCostStatementToCompletedMonths(statement) {
  const sql = String(statement ?? '');
  if (!isRawCostStatement(sql)) return sql;

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  // UTC month indexes are zero-based, so in October getUTCMonth() is 9,
  // which is exactly the previous completed calendar month number (September = 9).
  const lastCompletedMonth = now.getUTCMonth();

  // Include history from January 2025 through the previous completed month.
  // In January, the prior-year months remain eligible and the current year does not.
  return sql.replace(
    /WHERE year >= 2025\s+AND month BETWEEN 1 AND 12/,
    `WHERE year >= 2025
  AND month BETWEEN 1 AND 12
  AND (year < ${currentYear}
    OR (year = ${currentYear} AND month <= ${lastCompletedMonth}))`
  );
}

function cloneJsonResponse(response, payload) {
  const headers = new Headers(response.headers);

  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('content-type', 'application/json');

  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function downloadExternalRows(externalLinks) {
  const rows = [];

  for (const link of externalLinks) {
    if (!link?.external_link) continue;

    // Databricks external links are pre-signed cloud-storage URLs. They already
    // contain temporary credentials, so intentionally do not forward the
    // Databricks Authorization header when downloading them.
    const response = await nativeFetch(link.external_link);

    if (!response.ok) {
      throw new Error(
        `Databricks external result download failed with status ${response.status}.`
      );
    }

    const chunkRows = await response.json();

    if (!Array.isArray(chunkRows)) {
      throw new Error('Databricks external result chunk was not a JSON array.');
    }

    // Do not use rows.push(...chunkRows): a large result chunk can contain enough
    // rows to exceed JavaScript's argument/call-stack limit.
    for (const row of chunkRows) {
      rows.push(row);
    }
  }

  return rows;
}

async function resolveExternalLinks(payload) {
  const externalLinks = payload?.result?.external_links;

  if (!Array.isArray(externalLinks) || externalLinks.length === 0) {
    return payload;
  }

  const rows = await downloadExternalRows(externalLinks);
  const finalLink = externalLinks.at(-1) ?? {};

  return {
    ...payload,
    result: {
      ...payload.result,
      data_array: rows,
      next_chunk_index:
        payload.result?.next_chunk_index ?? finalLink.next_chunk_index ?? null,
      next_chunk_internal_link:
        payload.result?.next_chunk_internal_link
        ?? finalLink.next_chunk_internal_link
        ?? null,
      external_links: undefined
    }
  };
}

function parseRequestBody(body) {
  if (typeof body !== 'string' || !body) return null;

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function enableDatabricksExternalLinksForCostResults() {
  if (globalThis.__qmiDatabricksLargeResultFetchEnabled) return;

  globalThis.__qmiDatabricksLargeResultFetchEnabled = true;

  globalThis.fetch = async (input, init = {}) => {
    const url = getRequestUrl(input);
    const method = String(init?.method || 'GET').toUpperCase();
    const requestBody = parseRequestBody(init?.body);
    const isCostStatementPost =
      method === 'POST'
      && isDatabricksStatementEndpoint(url)
      && requestBody
      && isLargeCostStatement(requestBody.statement);
    const statementId = getStatementIdFromUrl(url);
    const isTrackedStatementRequest =
      method === 'GET'
      && statementId
      && largeResultStatementIds.has(statementId);

    if (!isCostStatementPost && !isTrackedStatementRequest) {
      return nativeFetch(input, init);
    }

    let nextInit = init;

    if (isCostStatementPost) {
      nextInit = {
        ...init,
        body: JSON.stringify({
          ...requestBody,
          statement: scopeRawCostStatementToCompletedMonths(requestBody.statement),
          disposition: 'EXTERNAL_LINKS',
          format: 'JSON_ARRAY'
        })
      };
    }

    const response = await nativeFetch(input, nextInit);
    const payload = await readJsonResponse(response);

    if (!payload) {
      return cloneJsonResponse(response, {});
    }

    if (isCostStatementPost && payload.statement_id) {
      largeResultStatementIds.add(payload.statement_id);
    }

    const resolvedPayload = await resolveExternalLinks(payload);

    return cloneJsonResponse(response, resolvedPayload);
  };
}
