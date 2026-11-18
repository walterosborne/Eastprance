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

const CONTROLLABLE_COSTS_TABLE_NAME = 'controllable_costs';
const COST_CATEGORY_KEY_TABLE_NAME = 'cost_category_key';
const COST_ELEMENT_KEY_TABLE_NAME = 'cost_element_key';
function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeControllable(value) {
  return String(value ?? '').trim().toLowerCase() === 'controllable'
    ? 'Controllable'
    : 'Uncontrollable';
}

function normalizeCostCategory(costCategoryValue, costElementValue) {
  const costCategory = String(costCategoryValue ?? '').trim();
  const costElement = String(costElementValue ?? '').trim();

  if (!costCategory && !costElement) {
    return 'Other';
  }

  return costCategory;
}

function normalizeControllableCostsRow(row) {
  return {
    cost_category: normalizeCostCategory(row['Cost Category'], row['Cost Element']),
    address: row.Address ?? '',
    cost_element: row['Cost Element'] ?? '',
    cost_element_description: row['Cost Element Description'] ?? '',
    cost: normalizeNumber(row.Cost),
    quarter: String(row.Quarter ?? '').trim().toUpperCase(),
    year: normalizeInteger(row.Year),
    controllable: normalizeControllable(row['Resolved Controllable'])
  };
}

export async function readControllableCostsData() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig();

  logDebug('controllable-costs', 'Starting controllable costs data load.', {
    hasConnectionConfig: missing.length === 0,
    tableName: CONTROLLABLE_COSTS_TABLE_NAME
  });

  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  try {
    const pool = await getPool(config);
    const controllableCostsTableName = formatSqlIdentifier(CONTROLLABLE_COSTS_TABLE_NAME, config);
    const costCategoryKeyTableName = formatSqlIdentifier(COST_CATEGORY_KEY_TABLE_NAME, config);
    const costElementKeyTableName = formatSqlIdentifier(COST_ELEMENT_KEY_TABLE_NAME, config);

    logDebug('controllable-costs', 'Executing controllable costs SQL query.', {
      controllableCostsTableName,
      costCategoryKeyTableName,
      costElementKeyTableName
    });

    const result = await pool.request().query(`
      WITH normalized_costs AS (
        SELECT
          LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Cost Category] AS nvarchar(4000)), ''))) AS [Cost Category],
          LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Address] AS nvarchar(4000)), ''))) AS [Address],
          LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Cost Element] AS nvarchar(4000)), ''))) AS [Cost Element],
          LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Cost Element Description] AS nvarchar(4000)), ''))) AS [Cost Element Description],
          TRY_CAST(source.[Cost] AS float) AS [Cost],
          UPPER(LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Quarter] AS nvarchar(100)), '')))) AS [Quarter],
          TRY_CAST(source.[Year] AS bigint) AS [Year]
        FROM ${controllableCostsTableName} AS source
      ),
      normalized_category_key AS (
        SELECT
          LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Cost Category] AS nvarchar(4000)), ''))) AS [Cost Category],
          LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Controllable] AS nvarchar(255)), ''))) AS [Controllable]
        FROM ${costCategoryKeyTableName} AS source
      ),
      normalized_element_key AS (
        SELECT
          LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Cost Category] AS nvarchar(4000)), ''))) AS [Cost Category],
          LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Cost Element] AS nvarchar(4000)), ''))) AS [Cost Element],
          LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Cost Element Description] AS nvarchar(4000)), ''))) AS [Cost Element Description],
          LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Controllable] AS nvarchar(255)), ''))) AS [Controllable]
        FROM ${costElementKeyTableName} AS source
      )
      SELECT
        costs.[Cost Category],
        costs.[Address],
        costs.[Cost Element],
        costs.[Cost Element Description],
        costs.[Cost],
        costs.[Quarter],
        costs.[Year],
        COALESCE(elementMatch.[Controllable], categoryMatch.[Controllable]) AS [Resolved Controllable]
      FROM normalized_costs AS costs
      OUTER APPLY (
        SELECT TOP 1
          elementKey.[Controllable]
        FROM normalized_element_key AS elementKey
        WHERE elementKey.[Cost Element] = costs.[Cost Element]
        ORDER BY
          CASE
            WHEN elementKey.[Cost Category] = costs.[Cost Category]
             AND elementKey.[Cost Element Description] = costs.[Cost Element Description] THEN 0
            WHEN elementKey.[Cost Category] = costs.[Cost Category] THEN 1
            WHEN elementKey.[Cost Element Description] = costs.[Cost Element Description] THEN 2
            ELSE 3
          END
      ) AS elementMatch
      LEFT JOIN normalized_category_key AS categoryMatch
        ON categoryMatch.[Cost Category] = costs.[Cost Category]
      -- Keep the full legacy facility-report population. Missing Cost Element
      -- values fall back to cost-category controllability via categoryMatch.
      ORDER BY
        costs.[Year] ASC,
        costs.[Quarter] ASC,
        costs.[Address] ASC,
        costs.[Cost Element Description] ASC;
    `);
    const rows = result.recordset.map(normalizeControllableCostsRow);

    logDebug('controllable-costs', 'Controllable costs SQL query completed.', {
      source: 'mssql',
      tableName: CONTROLLABLE_COSTS_TABLE_NAME,
      rowCount: rows.length,
      duration: formatDuration(stopTimer())
    });

    return {
      source: 'mssql',
      tableName: CONTROLLABLE_COSTS_TABLE_NAME,
      rowCount: rows.length,
      rows
    };
  } catch (error) {
    logError('controllable-costs', 'Controllable costs SQL query failed.', error, {
      tableName: CONTROLLABLE_COSTS_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });

    throw error;
  }
}
