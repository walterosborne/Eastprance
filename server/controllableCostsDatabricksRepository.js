import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import {
  formatSqlIdentifier,
  getConnectionConfig,
  getPool
} from './sqlConnection.js';

const DATABRICKS_PROCESSED_TABLE_NAME = 'finance_dev.analytics.cost_vis_full';
const DATABRICKS_PROCESSED_TABLE_SQL = '`finance_dev`.`analytics`.`cost_vis_full`';
const DATABRICKS_RAW_TABLE_NAME = 'finance_dev.analytics.dev_cv_transaction_details';
const DATABRICKS_RAW_TABLE_SQL = '`finance_dev`.`analytics`.`dev_cv_transaction_details`';
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 180000;
const TERMINAL_FAILURE_STATES = new Set(['FAILED', 'CANCELED', 'CLOSED']);

const CWI_DIVISION = 'DS C2 & Weapons Integration';
const SDS_DIVISION = 'DS Strategic Deterrent Systems';
const SDS_CENTRAL_COST_CENTERS = new Set([
  'TDA87FC0',
  'TDA87FO0',
  'TDB84FAC',
  'TDB84FCO',
  'TDA87FL0',
  'TDA10H1C'
]);

const CWI_GL_ACCOUNTS = new Set([
  8320037,
  4300591, 4300887, 4301077,
  4301048, 4301050, 4301231,
  4300626,
  4300852, 4300630,
  4300884, 4300699, 4300702, 4300704, 4300705,
  4300701, 4300700, 4300671, 4300643, 4300305,
  4300669, 4300698, 4300680, 4300395,
  4300703, 4300666, 4300807, 4300652,
  4301102, 4301013, 4301104, 4300628, 4301101, 4301103
]);

const SDS_GL_ACCOUNTS = new Set([
  8320037,
  4300591, 4300625, 4300887, 4301077,
  4301048, 4301049, 4301050, 4301231,
  4300626,
  4300852, 4300630, 8320479,
  4300884, 4300699, 4300702, 4300704, 4300705,
  4300701, 4300700, 4300671, 4300643, 4300305,
  4300669, 4300698, 4300680,
  4300703, 4300805, 4300666, 4300807,
  4301102, 4301013, 4301104, 4300628
]);

// Databricks pre-filter uses the union so the warehouse does not return unrelated
// G/Ls. The raw source is then filtered again after the QMI hierarchy join so the
// CWI and SDS populations exactly match the SQL extract's division-specific rules.
const DATABRICKS_GL_FILTER_SQL = `
  AND (
    gl_account_number BETWEEN 4100000 AND 4109999
    OR gl_account_number IN (
      8320037,
      4300305, 4300395, 4300591, 4300625, 4300626, 4300628, 4300630,
      4300643, 4300652, 4300666, 4300669, 4300671, 4300680, 4300698,
      4300699, 4300700, 4300701, 4300702, 4300703, 4300704, 4300705,
      4300805, 4300807, 4300852, 4300884, 4300887, 4301013, 4301048,
      4301049, 4301050, 4301077, 4301101, 4301102, 4301103, 4301104,
      4301231, 8320479
    )
  )`;

const DATABRICKS_PROCESSED_COST_QUERY = `
WITH normalized AS (
  SELECT
    TRY_CAST(Fiscal_Year AS INT) AS year,
    TRY_CAST(Posting_Period AS INT) AS month,
    UPPER(TRIM(CAST(new_Cost_Center AS STRING))) AS cost_center,
    CASE
      WHEN REGEXP_REPLACE(TRIM(CAST(GL_Account AS STRING)), '^0+', '') = '' THEN '0'
      ELSE REGEXP_REPLACE(TRIM(CAST(GL_Account AS STRING)), '^0+', '')
    END AS gl_account_cost_element,
    TRY_CAST(
      CASE
        WHEN REGEXP_REPLACE(TRIM(CAST(GL_Account AS STRING)), '^0+', '') = '' THEN '0'
        ELSE REGEXP_REPLACE(TRIM(CAST(GL_Account AS STRING)), '^0+', '')
      END AS BIGINT
    ) AS gl_account_number,
    TRIM(CAST(Cost_Category AS STRING)) AS cost_category,
    TRIM(CAST(ACCT_NAME AS STRING)) AS cost_element_description,
    TRY_CAST(DOC_NET_VALUE AS DOUBLE) AS cost
  FROM ${DATABRICKS_PROCESSED_TABLE_SQL}
  WHERE CC_Bus_Unit_Lvl_2 LIKE '%Defense Systems%'
)
SELECT
  year,
  month,
  cost_center,
  gl_account_cost_element,
  cost_category,
  MAX(cost_element_description) AS cost_element_description,
  SUM(cost) AS cost
FROM normalized
WHERE year >= 2025
  AND month BETWEEN 1 AND 12
  AND cost_center IS NOT NULL
  AND cost_center <> ''
  AND cost IS NOT NULL
  ${DATABRICKS_GL_FILTER_SQL}
GROUP BY
  year,
  month,
  cost_center,
  gl_account_cost_element,
  cost_category
ORDER BY
  year,
  month,
  cost_center,
  gl_account_cost_element,
  cost_category
`;

const DATABRICKS_RAW_COST_QUERY = `
WITH normalized AS (
  SELECT
    TRY_CAST(GJAHR AS INT) AS year,
    TRY_CAST(POPER AS INT) AS month,
    UPPER(TRIM(CAST(RCNTR AS STRING))) AS cost_center,
    CASE
      WHEN REGEXP_REPLACE(TRIM(CAST(RACCT AS STRING)), '^0+', '') = '' THEN '0'
      ELSE REGEXP_REPLACE(TRIM(CAST(RACCT AS STRING)), '^0+', '')
    END AS gl_account_cost_element,
    TRY_CAST(
      CASE
        WHEN REGEXP_REPLACE(TRIM(CAST(RACCT AS STRING)), '^0+', '') = '' THEN '0'
        ELSE REGEXP_REPLACE(TRIM(CAST(RACCT AS STRING)), '^0+', '')
      END AS BIGINT
    ) AS gl_account_number,
    TRIM(CAST(GL_TXT50 AS STRING)) AS cost_element_description,
    TRY_CAST(DOC_NET_VALUE AS DOUBLE) AS cost
  FROM ${DATABRICKS_RAW_TABLE_SQL}
)
SELECT
  year,
  month,
  cost_center,
  gl_account_cost_element,
  MAX(cost_element_description) AS cost_element_description,
  SUM(cost) AS cost
FROM normalized
WHERE year >= 2025
  AND month BETWEEN 1 AND 12
  AND cost_center IS NOT NULL
  AND cost_center <> ''
  AND cost IS NOT NULL
  ${DATABRICKS_GL_FILTER_SQL}
GROUP BY
  year,
  month,
  cost_center,
  gl_account_cost_element
ORDER BY
  year,
  month,
  cost_center,
  gl_account_cost_element
`;

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeInteger(value) {
  const numericValue = normalizeNumber(value);
  return Number.isInteger(numericValue) ? numericValue : null;
}

function normalizeCostCenter(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeCostElementIdentifier(value) {
  const normalizedValue = normalizeText(value);
  const numericMatch = /^(\d+)(?:\.0+)?$/.exec(normalizedValue);

  if (numericMatch) {
    try {
      return BigInt(numericMatch[1]).toString();
    } catch {
      // Fall through for nonstandard identifiers.
    }
  }

  return normalizedValue.toUpperCase();
}

function normalizeMatchText(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeKeyControllability(value) {
  const normalizedValue = normalizeMatchText(value);

  if (normalizedValue === 'controllable') return 'Controllable';
  if (normalizedValue === 'uncontrollable') return 'Uncontrollable';
  return 'Unclassified';
}

function getNumericGlAccount(value) {
  const normalizedValue = normalizeCostElementIdentifier(value);
  const numericValue = Number(normalizedValue);
  return Number.isInteger(numericValue) ? numericValue : null;
}

function isLaborGl(glAccount) {
  return glAccount >= 4100000 && glAccount <= 4109999;
}

function isAllowedRawGlForDivision(division, glAccount) {
  if (!Number.isInteger(glAccount)) return false;
  if (isLaborGl(glAccount)) return division === CWI_DIVISION || division === SDS_DIVISION;
  if (division === CWI_DIVISION) return CWI_GL_ACCOUNTS.has(glAccount);
  if (division === SDS_DIVISION) return SDS_GL_ACCOUNTS.has(glAccount);
  return false;
}

function getRawCostCategory(division, glAccount) {
  if (!isAllowedRawGlForDivision(division, glAccount)) return '';

  if (isLaborGl(glAccount) || glAccount === 8320037) return '1 Labor';

  if (division === CWI_DIVISION) {
    if ([4300591, 4300887, 4301077].includes(glAccount)) return '2 Rent - Land & Building';
    if ([4301048, 4301050, 4301231].includes(glAccount)) return '3 Depreciation & LHI';
    if (glAccount === 4300626) return '4 Property Taxes';
    if ([4300852, 4300630].includes(glAccount)) return '5 Insurance';
    if ([
      4300884, 4300699, 4300702, 4300704, 4300705, 4300701, 4300700,
      4300671, 4300643, 4300305, 4300669, 4300698, 4300680, 4300395
    ].includes(glAccount)) return '6 Maintenance & Repairs';
    if ([4300703, 4300666, 4300807, 4300652].includes(glAccount)) return '7 Services';
    if ([4301102, 4301013, 4301104, 4300628, 4301101, 4301103].includes(glAccount)) {
      return '8 Utilities';
    }
  }

  if (division === SDS_DIVISION) {
    if ([4300591, 4300625, 4300887, 4301077].includes(glAccount)) {
      return '2 Rent - Land & Building';
    }
    if ([4301048, 4301049, 4301050, 4301231].includes(glAccount)) {
      return '3 Depreciation & LHI';
    }
    if (glAccount === 4300626) return '4 Property Taxes';
    if ([4300852, 4300630, 8320479].includes(glAccount)) return '5 Insurance';
    if ([
      4300884, 4300699, 4300702, 4300704, 4300705, 4300701, 4300700,
      4300671, 4300643, 4300305, 4300669, 4300698, 4300680
    ].includes(glAccount)) return '6 Maintenance & Repairs';
    if ([4300703, 4300805, 4300666, 4300807].includes(glAccount)) return '7 Services';
    if ([4301102, 4301013, 4301104, 4300628].includes(glAccount)) return '8 Utilities';
  }

  return '';
}

function getCostElementMatchRank(costRow, keyRow) {
  const costCategoryMatches =
    normalizeMatchText(keyRow.costCategory) === normalizeMatchText(costRow.cost_category);
  const descriptionMatches =
    normalizeMatchText(keyRow.costElementDescription)
      === normalizeMatchText(costRow.cost_element_description);

  if (costCategoryMatches && descriptionMatches) return 0;
  if (costCategoryMatches) return 1;
  if (descriptionMatches) return 2;
  return 3;
}

function resolveCostElementKey(costRow, costElementKeysByIdentifier) {
  const identifier = normalizeCostElementIdentifier(costRow.gl_account_cost_element);
  const candidates = costElementKeysByIdentifier.get(identifier) ?? [];

  return candidates.reduce((bestMatch, candidate) => {
    if (!bestMatch) return candidate;

    return getCostElementMatchRank(costRow, candidate)
      < getCostElementMatchRank(costRow, bestMatch)
      ? candidate
      : bestMatch;
  }, null);
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
      `Incomplete Databricks cost result: received ${rows.length} of ${expectedRowCount ?? 'unknown'} rows.`
    );
  }

  return formatRows(columns, rows);
}

async function executeDatabricksCostQuery({ scope, tableName, query }) {
  const connection = requiredDatabricksEnvironment();

  logDebug(scope, 'Executing Databricks cost query.', {
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

async function readDbmDimensionLookups() {
  const { config, missing } = getConnectionConfig('dbm');

  if (missing.length > 0) {
    throw new Error(`Missing SAP/DBM database environment variables: ${missing.join(', ')}`);
  }

  const pool = await getPool(config, 'dbm');
  const [hierarchyResult, facilityResult] = await Promise.all([
    pool.request().query(`
      WITH ranked_hierarchy AS (
        SELECT
          UPPER(LTRIM(RTRIM(COST_CENTER))) AS cost_center,
          NULLIF(LTRIM(RTRIM(LEV03_DESC)), '') AS division,
          NULLIF(LTRIM(RTRIM(LEV04_DESC)), '') AS business_unit,
          ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
          ) AS rn
        FROM [DTO_Business_Management].[rpt].[rb_load_cost_center_hierarchy]
        WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
          AND NULLIF(LTRIM(RTRIM(COST_CENTER)), '') IS NOT NULL
      )
      SELECT cost_center, division, business_unit
      FROM ranked_hierarchy
      WHERE rn = 1;
    `),
    pool.request().query(`
      SELECT
        UPPER(LTRIM(RTRIM([Cost Center]))) AS cost_center,
        MAX(NULLIF(LTRIM(RTRIM([Address])), '')) AS facility,
        MAX(NULLIF(LTRIM(RTRIM([City])), '')) AS facility_city,
        MAX(NULLIF(LTRIM(RTRIM([State])), '')) AS facility_state
      FROM [ecosystem_source].[qmi].[costcenterkey]
      WHERE NULLIF(LTRIM(RTRIM([Cost Center])), '') IS NOT NULL
      GROUP BY UPPER(LTRIM(RTRIM([Cost Center])));
    `)
  ]);

  return {
    hierarchyByCostCenter: new Map(
      hierarchyResult.recordset.map((row) => [
        normalizeCostCenter(row.cost_center),
        {
          division: normalizeText(row.division),
          businessUnit: normalizeText(row.business_unit)
        }
      ])
    ),
    facilityByCostCenter: new Map(
      facilityResult.recordset.map((row) => [
        normalizeCostCenter(row.cost_center),
        {
          facility: normalizeText(row.facility),
          city: normalizeText(row.facility_city),
          state: normalizeText(row.facility_state)
        }
      ])
    )
  };
}

async function readControllabilityLookups() {
  const { config, missing } = getConnectionConfig();

  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  const pool = await getPool(config, 'default');
  const costElementKeyTableName = formatSqlIdentifier('cost_element_key', config);
  const costCategoryKeyTableName = formatSqlIdentifier('cost_category_key', config);
  const [elementResult, categoryResult] = await Promise.all([
    pool.request().query(`
      SELECT
        LTRIM(RTRIM(COALESCE(TRY_CAST([Cost Category] AS nvarchar(4000)), ''))) AS cost_category,
        LTRIM(RTRIM(COALESCE(TRY_CAST([Cost Element] AS nvarchar(4000)), ''))) AS cost_element,
        LTRIM(RTRIM(COALESCE(TRY_CAST([Cost Element Description] AS nvarchar(4000)), ''))) AS cost_element_description,
        LTRIM(RTRIM(COALESCE(TRY_CAST([Controllable] AS nvarchar(255)), ''))) AS controllable
      FROM ${costElementKeyTableName}
      WHERE NULLIF(
        LTRIM(RTRIM(COALESCE(TRY_CAST([Cost Element] AS nvarchar(4000)), ''))),
        ''
      ) IS NOT NULL;
    `),
    pool.request().query(`
      SELECT
        LTRIM(RTRIM(COALESCE(TRY_CAST([Cost Category] AS nvarchar(4000)), ''))) AS cost_category,
        LTRIM(RTRIM(COALESCE(TRY_CAST([Controllable] AS nvarchar(255)), ''))) AS controllable
      FROM ${costCategoryKeyTableName};
    `)
  ]);

  const valuesByIdentifier = new Map();

  elementResult.recordset.forEach((row) => {
    const normalizedRow = {
      costCategory: normalizeText(row.cost_category),
      costElement: normalizeCostElementIdentifier(row.cost_element),
      costElementDescription: normalizeText(row.cost_element_description),
      controllable: normalizeKeyControllability(row.controllable)
    };
    const rows = valuesByIdentifier.get(normalizedRow.costElement) ?? [];

    rows.push(normalizedRow);
    valuesByIdentifier.set(normalizedRow.costElement, rows);
  });

  return {
    valuesByIdentifier,
    controllabilityByCategory: new Map(
      categoryResult.recordset.map((row) => [
        normalizeMatchText(row.cost_category),
        normalizeKeyControllability(row.controllable)
      ])
    )
  };
}

function aggregateComparisonRows(rows) {
  const buckets = new Map();

  rows.forEach((row) => {
    const key = [
      row.year,
      row.month,
      row.division,
      row.business_unit,
      row.facility,
      row.facility_city,
      row.facility_state,
      row.cost_category,
      row.controllable
    ].join('\u001f');
    const existing = buckets.get(key);

    if (existing) {
      existing.cost += row.cost;
      return;
    }

    buckets.set(key, { ...row });
  });

  return [...buckets.values()]
    .map((row) => ({
      ...row,
      cost: Number(row.cost.toFixed(2))
    }))
    .sort((left, right) => (
      left.year - right.year
      || left.month - right.month
      || left.division.localeCompare(right.division)
      || left.business_unit.localeCompare(right.business_unit)
      || left.facility.localeCompare(right.facility)
      || left.cost_category.localeCompare(right.cost_category)
      || left.controllable.localeCompare(right.controllable)
    ));
}

function resolveControllability(sourceRow, costCategory, glAccount, controllability) {
  const normalizedCostRow = {
    cost_category: costCategory,
    cost_element_description: normalizeText(sourceRow.cost_element_description),
    gl_account_cost_element: glAccount
  };
  const matchedKey = resolveCostElementKey(
    normalizedCostRow,
    controllability.valuesByIdentifier
  );
  const categoryControllability = controllability.controllabilityByCategory.get(
    normalizeMatchText(costCategory)
  );

  return matchedKey?.controllable && matchedKey.controllable !== 'Unclassified'
    ? matchedKey.controllable
    : (categoryControllability ?? 'Unclassified');
}

function buildMappedPayload({
  sourceRows,
  dimensions,
  controllability,
  tableName,
  sourceKind,
  sourceFilter,
  exactSqlExtractScope
}) {
  const mappedRows = [];
  let invalidSourceRowCount = 0;
  let hierarchyUnmatchedRowCount = 0;
  let excludedBySqlScopeRowCount = 0;
  let facilityMappedRowCount = 0;
  let facilityUnmappedRowCount = 0;
  let unclassifiedSourceRowCount = 0;

  sourceRows.forEach((sourceRow) => {
    const year = normalizeInteger(sourceRow.year);
    const month = normalizeInteger(sourceRow.month);
    const cost = normalizeNumber(sourceRow.cost);
    const costCenter = normalizeCostCenter(sourceRow.cost_center);
    const glAccount = normalizeCostElementIdentifier(sourceRow.gl_account_cost_element);
    const numericGlAccount = getNumericGlAccount(glAccount);

    if (
      !Number.isInteger(year)
      || !Number.isInteger(month)
      || month < 1
      || month > 12
      || cost === null
      || !costCenter
      || !Number.isInteger(numericGlAccount)
    ) {
      invalidSourceRowCount += 1;
      return;
    }

    const hierarchy = dimensions.hierarchyByCostCenter.get(costCenter);

    if (!hierarchy) {
      hierarchyUnmatchedRowCount += 1;
      return;
    }

    let costCategory = normalizeText(sourceRow.cost_category);
    let facilityMapping = dimensions.facilityByCostCenter.get(costCenter);
    let facility = facilityMapping?.facility || `Unmapped (CC ${costCenter})`;
    let facilityCity = facilityMapping?.city || '';
    let facilityState = facilityMapping?.state || '';

    if (exactSqlExtractScope) {
      costCategory = getRawCostCategory(hierarchy.division, numericGlAccount);

      if (!costCategory) {
        excludedBySqlScopeRowCount += 1;
        return;
      }

      const isSyntheticSdsFacility =
        hierarchy.division === SDS_DIVISION && SDS_CENTRAL_COST_CENTERS.has(costCenter);

      // Mirror create_qmi_controllable_costs_new_extract.sql: require a normal
      // cost-center-key facility, except for the six central SDS cost centers.
      if (!facilityMapping?.facility && !isSyntheticSdsFacility) {
        excludedBySqlScopeRowCount += 1;
        return;
      }

      if (isSyntheticSdsFacility) {
        facility = 'Strategic Deterrent Facility/Operations';
        facilityCity = '';
        facilityState = '';
        facilityMapping = null;
      }
    } else if (!costCategory) {
      costCategory = 'Other';
    }

    const controllable = resolveControllability(
      sourceRow,
      costCategory,
      glAccount,
      controllability
    );

    if (facilityMapping?.facility) {
      facilityMappedRowCount += 1;
    } else {
      facilityUnmappedRowCount += 1;
    }

    if (controllable === 'Unclassified') unclassifiedSourceRowCount += 1;

    mappedRows.push({
      date: `${year}-${String(month).padStart(2, '0')}-01`,
      year,
      month,
      quarter: `Q${Math.floor((month - 1) / 3) + 1}`,
      sector: 'Defense Systems',
      division: hierarchy.division,
      business_unit: hierarchy.businessUnit,
      facility,
      address: facility,
      facility_city: facilityCity,
      facility_state: facilityState,
      cost_category: costCategory,
      controllable,
      cost
    });
  });

  const rows = aggregateComparisonRows(mappedRows);
  const years = [...new Set(rows.map((row) => row.year))].sort((left, right) => left - right);

  return {
    source: 'databricks',
    sourceKind,
    tableName,
    sourceFilter,
    glAccountFilter: exactSqlExtractScope
      ? 'Exact division-specific G/L population from create_qmi_controllable_costs_new_extract.sql'
      : 'Union of G/L accounts used by create_qmi_controllable_costs_new_extract.sql',
    amountField: 'DOC_NET_VALUE',
    sourceRowCount: sourceRows.length,
    invalidSourceRowCount,
    hierarchyMatchedRowCount: mappedRows.length,
    hierarchyUnmatchedRowCount,
    excludedBySqlScopeRowCount,
    facilityMappedSourceRowCount: facilityMappedRowCount,
    facilityUnmappedSourceRowCount: facilityUnmappedRowCount,
    unclassifiedSourceRowCount,
    rowCount: rows.length,
    totalCost: Number(rows.reduce((sum, row) => sum + row.cost, 0).toFixed(2)),
    years,
    rows
  };
}

async function readDatabricksCostDataset({
  scope,
  tableName,
  query,
  sourceKind,
  sourceFilter,
  exactSqlExtractScope = false
}) {
  const stopTimer = createTimer();

  logDebug(scope, `Starting Databricks ${sourceKind} controllable costs load.`, {
    tableName
  });

  try {
    const [sourceRows, dimensions, controllability] = await Promise.all([
      executeDatabricksCostQuery({ scope, tableName, query }),
      readDbmDimensionLookups(),
      readControllabilityLookups()
    ]);
    const payload = buildMappedPayload({
      sourceRows,
      dimensions,
      controllability,
      tableName,
      sourceKind,
      sourceFilter,
      exactSqlExtractScope
    });

    logDebug(scope, `Databricks ${sourceKind} controllable costs load completed.`, {
      tableName: payload.tableName,
      sourceRowCount: payload.sourceRowCount,
      rowCount: payload.rowCount,
      years: payload.years,
      hierarchyUnmatchedRowCount: payload.hierarchyUnmatchedRowCount,
      excludedBySqlScopeRowCount: payload.excludedBySqlScopeRowCount,
      facilityUnmappedSourceRowCount: payload.facilityUnmappedSourceRowCount,
      unclassifiedSourceRowCount: payload.unclassifiedSourceRowCount,
      totalCost: payload.totalCost,
      duration: formatDuration(stopTimer())
    });

    return payload;
  } catch (error) {
    logError(scope, `Databricks ${sourceKind} controllable costs load failed.`, error, {
      tableName,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}

// Processed comparison: the other group's finished cost_vis_full table.
export async function readControllableCostsDatabricksData() {
  return readDatabricksCostDataset({
    scope: 'controllable-costs-databricks',
    tableName: DATABRICKS_PROCESSED_TABLE_NAME,
    query: DATABRICKS_PROCESSED_COST_QUERY,
    sourceKind: 'processed',
    sourceFilter: "CC_Bus_Unit_Lvl_2 LIKE '%Defense Systems%'",
    exactSqlExtractScope: false
  });
}

// Raw comparison: Databricks' CV transaction-details table, with QMI applying
// the same hierarchy, facility, division-specific G/L, category, and
// controllability rules used by the SQL Server controllable-cost extract.
export async function readControllableCostsDatabricksRawData() {
  return readDatabricksCostDataset({
    scope: 'controllable-costs-databricks-raw',
    tableName: DATABRICKS_RAW_TABLE_NAME,
    query: DATABRICKS_RAW_COST_QUERY,
    sourceKind: 'raw',
    sourceFilter: `${CWI_DIVISION}; ${SDS_DIVISION} via QMI cost-center hierarchy`,
    exactSqlExtractScope: true
  });
}
