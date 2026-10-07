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

const LABOR_UTILIZATION_HANA_TABLE_NAME = 'qmi.labor_agg';
const HANA_QUERY_TIMEOUT_MS = 90000;
const MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeInteger(value) {
  const number = normalizeNumber(value);
  return Number.isInteger(number) ? number : null;
}

function createHanaLaborRow(sourceRow) {
  const year = normalizeInteger(sourceRow.year);
  const laborCategory = normalizeText(sourceRow.labor_category);
  const division = normalizeText(sourceRow.division);
  const businessUnit = normalizeText(sourceRow.business_unit);
  const facility = normalizeText(sourceRow.facility);
  const row = {
    my_id: '',
    employee_name: '',
    forecasted_cc: facility,
    pool: businessUnit,
    location_code: '',
    union_type: '',
    worker_type: '',
    worker_subtype: '',
    time_type: '',
    labor_category: laborCategory,
    measure: 'Hours',
    year,
    business_unit: businessUnit,
    division,
    site: facility,
    department: '',
    total_year: 0
  };

  MONTH_KEYS.forEach((monthKey) => {
    row[monthKey] = null;
  });

  return row;
}

function getHanaLaborRowKey(row) {
  return [
    row.year,
    row.division,
    row.business_unit,
    row.forecasted_cc,
    row.labor_category
  ].join('|');
}

export function buildLaborUtilizationHanaRows(aggregateRows) {
  const aggregatedRows = new Map();
  const organizationKeys = new Set();

  aggregateRows.forEach((sourceRow) => {
    const year = normalizeInteger(sourceRow.year);
    const month = normalizeInteger(sourceRow.month);
    const enteredHours = normalizeNumber(sourceRow.entered_hours);
    const laborCategory = normalizeText(sourceRow.labor_category);

    if (
      !Number.isInteger(year)
      || !Number.isInteger(month)
      || month < 1
      || month > 12
      || !Number.isFinite(enteredHours)
      || !['Labor Direct', 'Labor Indirect'].includes(laborCategory)
    ) {
      return;
    }

    organizationKeys.add([
      normalizeText(sourceRow.division),
      normalizeText(sourceRow.business_unit),
      normalizeText(sourceRow.facility)
    ].join('|'));

    const normalizedSourceRow = {
      ...sourceRow,
      year,
      labor_category: laborCategory
    };
    const candidateRow = createHanaLaborRow(normalizedSourceRow);
    const rowKey = getHanaLaborRowKey(candidateRow);
    const row = aggregatedRows.get(rowKey) ?? candidateRow;
    const monthKey = MONTH_KEYS[month - 1];

    row[monthKey] = Number(row[monthKey] ?? 0) + enteredHours;
    row.total_year += enteredHours;
    aggregatedRows.set(rowKey, row);
  });

  const rows = [...aggregatedRows.values()]
    .map((row) => ({
      ...row,
      total_year: Number(row.total_year.toFixed(2)),
      total_2026: row.year === 2026 ? Number(row.total_year.toFixed(2)) : null,
      ...Object.fromEntries(
        MONTH_KEYS.map((monthKey) => [
          monthKey,
          row[monthKey] == null ? null : Number(row[monthKey].toFixed(2))
        ])
      )
    }))
    .sort((left, right) => (
      left.year - right.year
      || left.forecasted_cc.localeCompare(right.forecasted_cc)
      || left.pool.localeCompare(right.pool)
      || left.labor_category.localeCompare(right.labor_category)
    ));

  return {
    rows,
    organizationCount: organizationKeys.size
  };
}

async function readHanaMonthlyHours(pool, connectionConfig) {
  const tableName = formatSqlIdentifier(LABOR_UTILIZATION_HANA_TABLE_NAME, connectionConfig);
  const result = await pool.request().query(`
    WITH normalized_labor AS (
      SELECT
        TRY_CONVERT(int, source.[Year]) AS [year],
        TRY_CONVERT(int, source.[Month]) AS [month],
        LTRIM(RTRIM(COALESCE(TRY_CONVERT(nvarchar(4000), source.[Division]), ''))) AS [division],
        LTRIM(RTRIM(COALESCE(TRY_CONVERT(nvarchar(4000), source.[Business Unit]), ''))) AS [business_unit],
        LTRIM(RTRIM(COALESCE(TRY_CONVERT(nvarchar(4000), source.[Facility]), ''))) AS [facility],
        CASE
          WHEN LOWER(COALESCE(TRY_CONVERT(nvarchar(4000), source.[Labor Type]), '')) LIKE '%indirect%'
            THEN 'Labor Indirect'
          WHEN LOWER(COALESCE(TRY_CONVERT(nvarchar(4000), source.[Labor Type]), '')) LIKE '%direct%'
            THEN 'Labor Direct'
          ELSE NULL
        END AS [labor_category],
        TRY_CONVERT(float, source.[Entered Hours]) AS [entered_hours]
      FROM ${tableName} AS source
    )
    SELECT
      [year],
      [month],
      [division],
      [business_unit],
      [facility],
      [labor_category],
      SUM([entered_hours]) AS [entered_hours]
    FROM normalized_labor
    WHERE [year] IS NOT NULL
      AND [month] BETWEEN 1 AND 12
      AND [labor_category] IS NOT NULL
      AND [entered_hours] IS NOT NULL
    GROUP BY
      [year],
      [month],
      [division],
      [business_unit],
      [facility],
      [labor_category]
    ORDER BY
      [year] DESC,
      [month] DESC,
      [division] ASC,
      [business_unit] ASC,
      [facility] ASC,
      [labor_category] ASC;
  `);

  return result.recordset;
}

export async function readLaborUtilizationHanaData() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig();

  logDebug('labor-hana', 'Starting HANA labor utilization data load.', {
    hasConnectionConfig: missing.length === 0,
    tableName: LABOR_UTILIZATION_HANA_TABLE_NAME
  });

  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  try {
    const pool = await getPool(
      { ...config, requestTimeout: HANA_QUERY_TIMEOUT_MS },
      'labor-hana'
    );
    const aggregateRows = await readHanaMonthlyHours(pool, config);
    const {
      rows,
      organizationCount
    } = buildLaborUtilizationHanaRows(aggregateRows);
    const years = [...new Set(rows.map((row) => row.year))].sort((left, right) => left - right);
    const payload = {
      source: 'mssql',
      tableName: LABOR_UTILIZATION_HANA_TABLE_NAME,
      rowCount: rows.length,
      sourceRowCount: aggregateRows.length,
      organizationCount,
      years,
      rows
    };

    logDebug('labor-hana', 'HANA labor utilization SQL query completed.', {
      source: payload.source,
      tableName: payload.tableName,
      rowCount: payload.rowCount,
      sourceRowCount: payload.sourceRowCount,
      organizationCount,
      years,
      duration: formatDuration(stopTimer())
    });

    return payload;
  } catch (error) {
    logError('labor-hana', 'HANA labor utilization SQL query failed.', error, {
      tableName: LABOR_UTILIZATION_HANA_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}
