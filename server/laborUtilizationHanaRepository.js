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

const LABOR_UTILIZATION_HANA_TABLE_NAME = 'qmi.labor_utilization_hana';
const MAX_MONTHLY_LABOR_ROWS = 500000;
const MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIdentifier(value) {
  return normalizeText(value).toLowerCase();
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
  const row = {
    my_id: '',
    employee_name: '',
    forecasted_cc: '',
    pool: '',
    location_code: '',
    union_type: '',
    worker_type: '',
    worker_subtype: '',
    time_type: '',
    labor_category: laborCategory,
    measure: 'Hours',
    year,
    business_unit: '',
    division: '',
    site: '',
    department: '',
    total_year: 0
  };

  MONTH_KEYS.forEach((monthKey) => {
    row[monthKey] = null;
  });

  return row;
}

function getHanaLaborRowKey(row) {
  return [row.year, row.labor_category].join('|');
}

export function buildLaborUtilizationHanaRows(timesheetRows) {
  const aggregatedRows = new Map();
  const employeeIds = new Set();

  timesheetRows.forEach((sourceRow) => {
    const employeeId = normalizeIdentifier(sourceRow.employee_id);
    const year = normalizeInteger(sourceRow.year);
    const month = normalizeInteger(sourceRow.month);
    const enteredHours = normalizeNumber(sourceRow.entered_hours);
    const laborCategory = normalizeText(sourceRow.labor_category);

    if (
      !employeeId
      || !Number.isInteger(year)
      || !Number.isInteger(month)
      || month < 1
      || month > 12
      || !Number.isFinite(enteredHours)
      || !['Labor Direct', 'Labor Indirect'].includes(laborCategory)
    ) {
      return;
    }

    employeeIds.add(employeeId);

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
    employeeCount: employeeIds.size
  };
}

async function readHanaMonthlyHours(pool, connectionConfig) {
  const tableName = formatSqlIdentifier(LABOR_UTILIZATION_HANA_TABLE_NAME, connectionConfig);
  const result = await pool.request().query(`
    WITH normalized_labor AS (
      SELECT
        TRY_CONVERT(date, source.[Timesheet Date]) AS [timesheet_date],
        LTRIM(RTRIM(COALESCE(TRY_CONVERT(nvarchar(255), source.[Employee ID]), ''))) AS [employee_id],
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
    SELECT TOP (${MAX_MONTHLY_LABOR_ROWS})
      YEAR([timesheet_date]) AS [year],
      MONTH([timesheet_date]) AS [month],
      [employee_id],
      [labor_category],
      SUM([entered_hours]) AS [entered_hours]
    FROM normalized_labor
    WHERE [timesheet_date] IS NOT NULL
      AND [employee_id] <> ''
      AND [labor_category] IS NOT NULL
      AND [entered_hours] IS NOT NULL
    GROUP BY
      YEAR([timesheet_date]),
      MONTH([timesheet_date]),
      [employee_id],
      [labor_category]
    ORDER BY
      [year] DESC,
      [month] DESC,
      [employee_id] ASC,
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
    const pool = await getPool(config, 'default');
    const timesheetRows = await readHanaMonthlyHours(pool, config);
    const {
      rows,
      employeeCount
    } = buildLaborUtilizationHanaRows(timesheetRows);
    const years = [...new Set(rows.map((row) => row.year))].sort((left, right) => left - right);
    const payload = {
      source: 'mssql',
      tableName: LABOR_UTILIZATION_HANA_TABLE_NAME,
      rowCount: rows.length,
      sourceRowCount: timesheetRows.length,
      sourceRowLimit: MAX_MONTHLY_LABOR_ROWS,
      sourceRowLimitReached: timesheetRows.length >= MAX_MONTHLY_LABOR_ROWS,
      employeeCount,
      years,
      rows
    };

    logDebug('labor-hana', 'HANA labor utilization SQL query completed.', {
      source: payload.source,
      tableName: payload.tableName,
      rowCount: payload.rowCount,
      sourceRowCount: payload.sourceRowCount,
      sourceRowLimit: payload.sourceRowLimit,
      sourceRowLimitReached: payload.sourceRowLimitReached,
      employeeCount,
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
