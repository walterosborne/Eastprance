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
const ROSTER_TABLE_NAME = 'RosterExtractFarm';
const MAX_MONTHLY_LABOR_ROWS = 500000;
const MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const UNKNOWN_ORG_VALUE = 'Unknown';

const ROSTER_FIELD_CANDIDATES = {
  my_id: ['MyID', 'My ID'],
  network_id: ['NetworkID', 'Network ID'],
  employee_name: ['FullName', 'Full Name', 'Employee Name', 'RosterName'],
  business_unit: ['BusUnitLvl2NoCode', 'Business Unit', 'BusinessUnit'],
  division: ['Division', 'DivisionName', 'BusUnitLvl3NoCode'],
  site: ['Site', 'SiteName', 'Facility', 'FacilityName', 'Location'],
  department: ['Department', 'DepartmentName', 'Pool', 'OrgUnitName'],
  forecasted_cc: [
    'Forecasted CC',
    'ForecastedCC',
    'Facility',
    'FacilityName',
    'Site',
    'SiteName',
    'BusUnitLvl2NoCode'
  ],
  pool: ['Pool', 'Department', 'DepartmentName', 'OrgUnitName', 'BusUnitLvl3NoCode'],
  location_code: ['Location Code', 'LocationCode', 'SiteCode', 'Location', 'Site'],
  union_type: ['Union Type', 'UnionType', 'UnionStatus', 'Union'],
  worker_type: ['Worker Type', 'WorkerType', 'EmployeeType'],
  worker_subtype: ['Worker Subtype', 'WorkerSubtype', 'EmployeeSubtype'],
  time_type: ['Time Type', 'TimeType', 'FullPartTime', 'FTEStatus']
};

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

function normalizeColumnKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function quoteSqlSegment(value) {
  return `[${String(value).replace(/]/g, ']]')}]`;
}

function getAvailableRosterField(columnNames, candidates) {
  const availableColumns = new Map(
    columnNames.map((columnName) => [normalizeColumnKey(columnName), columnName])
  );

  for (const candidate of candidates) {
    const columnName = availableColumns.get(normalizeColumnKey(candidate));

    if (columnName) {
      return columnName;
    }
  }

  return null;
}

function buildRosterSelectExpression(alias, columnName) {
  return columnName
    ? `LTRIM(RTRIM(COALESCE(TRY_CONVERT(nvarchar(4000), ${quoteSqlSegment(columnName)}), ''))) AS ${quoteSqlSegment(alias)}`
    : `CAST('' AS nvarchar(1)) AS ${quoteSqlSegment(alias)}`;
}

function normalizeRosterRow(row) {
  return Object.fromEntries(
    Object.keys(ROSTER_FIELD_CANDIDATES).map((fieldName) => [fieldName, normalizeText(row[fieldName])])
  );
}

function getRosterRowScore(row) {
  return Object.values(row).filter(Boolean).length;
}

function buildRosterIndex(rosterRows) {
  const rosterByEmployeeId = new Map();

  rosterRows.forEach((rawRow) => {
    const row = normalizeRosterRow(rawRow);

    [row.my_id, row.network_id].forEach((identifier) => {
      const normalizedIdentifier = normalizeIdentifier(identifier);

      if (!normalizedIdentifier) {
        return;
      }

      const currentRow = rosterByEmployeeId.get(normalizedIdentifier);

      if (!currentRow || getRosterRowScore(row) > getRosterRowScore(currentRow)) {
        rosterByEmployeeId.set(normalizedIdentifier, row);
      }
    });
  });

  return rosterByEmployeeId;
}

function getRosterOrgValue(rosterRow, fieldName, fallbacks = []) {
  const value = normalizeText(rosterRow?.[fieldName]);

  if (value) {
    return value;
  }

  for (const fallbackField of fallbacks) {
    const fallbackValue = normalizeText(rosterRow?.[fallbackField]);

    if (fallbackValue) {
      return fallbackValue;
    }
  }

  return UNKNOWN_ORG_VALUE;
}

function createHanaLaborRow(sourceRow, rosterRow) {
  const year = normalizeInteger(sourceRow.year);
  const laborCategory = normalizeText(sourceRow.labor_category);
  const row = {
    my_id: '',
    employee_name: '',
    forecasted_cc: getRosterOrgValue(rosterRow, 'forecasted_cc', ['site', 'business_unit']),
    pool: getRosterOrgValue(rosterRow, 'pool', ['department', 'division']),
    location_code: getRosterOrgValue(rosterRow, 'location_code', ['site']),
    union_type: getRosterOrgValue(rosterRow, 'union_type'),
    worker_type: getRosterOrgValue(rosterRow, 'worker_type'),
    worker_subtype: getRosterOrgValue(rosterRow, 'worker_subtype'),
    time_type: getRosterOrgValue(rosterRow, 'time_type'),
    labor_category: laborCategory,
    measure: 'Hours',
    year,
    business_unit: getRosterOrgValue(rosterRow, 'business_unit'),
    division: getRosterOrgValue(rosterRow, 'division', ['business_unit']),
    site: getRosterOrgValue(rosterRow, 'site', ['forecasted_cc']),
    department: getRosterOrgValue(rosterRow, 'department', ['pool']),
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
    row.forecasted_cc,
    row.pool,
    row.location_code,
    row.union_type,
    row.worker_type,
    row.worker_subtype,
    row.time_type,
    row.labor_category,
    row.business_unit,
    row.division,
    row.site,
    row.department
  ].join('|');
}

export function buildLaborUtilizationHanaRows(timesheetRows, rosterRows) {
  const rosterByEmployeeId = buildRosterIndex(rosterRows);
  const aggregatedRows = new Map();
  const matchedEmployeeIds = new Set();
  const unmatchedEmployeeIds = new Set();

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

    const rosterRow = rosterByEmployeeId.get(employeeId);

    if (rosterRow) {
      matchedEmployeeIds.add(employeeId);
    } else {
      unmatchedEmployeeIds.add(employeeId);
    }

    const normalizedSourceRow = {
      ...sourceRow,
      year,
      labor_category: laborCategory
    };
    const candidateRow = createHanaLaborRow(normalizedSourceRow, rosterRow);
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
    matchedEmployeeCount: matchedEmployeeIds.size,
    unmatchedEmployeeCount: unmatchedEmployeeIds.size
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

async function readRosterOrgRows(pool, rosterConfig) {
  const tableName = formatSqlIdentifier(ROSTER_TABLE_NAME, rosterConfig);
  const metadataResult = await pool
    .request()
    .input('tableSchema', rosterConfig.schema || 'dbo')
    .input('tableName', ROSTER_TABLE_NAME)
    .query(`
      SELECT [COLUMN_NAME]
      FROM [INFORMATION_SCHEMA].[COLUMNS]
      WHERE [TABLE_SCHEMA] = @tableSchema
        AND [TABLE_NAME] = @tableName;
    `);
  const columnNames = metadataResult.recordset.map((row) => row.COLUMN_NAME);
  const selectedFields = Object.fromEntries(
    Object.entries(ROSTER_FIELD_CANDIDATES).map(([fieldName, candidates]) => [
      fieldName,
      getAvailableRosterField(columnNames, candidates)
    ])
  );

  if (!selectedFields.my_id && !selectedFields.network_id) {
    throw new Error(`${ROSTER_TABLE_NAME} does not contain a recognizable MyID or NetworkID column.`);
  }

  const selectExpressions = Object.entries(selectedFields).map(([fieldName, columnName]) =>
    buildRosterSelectExpression(fieldName, columnName)
  );
  const identifierConditions = [selectedFields.my_id, selectedFields.network_id]
    .filter(Boolean)
    .map((columnName) => `NULLIF(LTRIM(RTRIM(COALESCE(TRY_CONVERT(nvarchar(255), ${quoteSqlSegment(columnName)}), ''))), '') IS NOT NULL`);
  const result = await pool.request().query(`
    SELECT
      ${selectExpressions.join(',\n      ')}
    FROM ${tableName}
    WHERE ${identifierConditions.join('\n      OR ')};
  `);

  return result.recordset;
}

export async function readLaborUtilizationHanaData() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig();
  const {
    config: rosterConfig,
    missing: rosterMissing,
    source: rosterConnectionSource
  } = getConnectionConfig('roster');

  logDebug('labor-hana', 'Starting HANA labor utilization data load.', {
    hasConnectionConfig: missing.length === 0,
    hasRosterConnectionConfig: rosterMissing.length === 0,
    tableName: LABOR_UTILIZATION_HANA_TABLE_NAME,
    rosterTableName: ROSTER_TABLE_NAME,
    rosterConnectionSource
  });

  if (missing.length > 0 || rosterMissing.length > 0) {
    throw new Error(
      `Missing database environment variables: ${[...missing, ...rosterMissing].join(', ')}`
    );
  }

  try {
    const [pool, rosterPool] = await Promise.all([
      getPool(config, 'default'),
      getPool(rosterConfig, 'roster')
    ]);
    const [timesheetRows, rosterRows] = await Promise.all([
      readHanaMonthlyHours(pool, config),
      readRosterOrgRows(rosterPool, rosterConfig)
    ]);
    const {
      rows,
      matchedEmployeeCount,
      unmatchedEmployeeCount
    } = buildLaborUtilizationHanaRows(timesheetRows, rosterRows);
    const years = [...new Set(rows.map((row) => row.year))].sort((left, right) => left - right);
    const payload = {
      source: 'mssql',
      tableName: LABOR_UTILIZATION_HANA_TABLE_NAME,
      rosterTableName: ROSTER_TABLE_NAME,
      rowCount: rows.length,
      sourceRowCount: timesheetRows.length,
      sourceRowLimit: MAX_MONTHLY_LABOR_ROWS,
      sourceRowLimitReached: timesheetRows.length >= MAX_MONTHLY_LABOR_ROWS,
      matchedEmployeeCount,
      unmatchedEmployeeCount,
      years,
      rows
    };

    logDebug('labor-hana', 'HANA labor utilization SQL queries completed.', {
      source: payload.source,
      tableName: payload.tableName,
      rosterTableName: payload.rosterTableName,
      rosterConnectionSource,
      rowCount: payload.rowCount,
      sourceRowCount: payload.sourceRowCount,
      sourceRowLimit: payload.sourceRowLimit,
      sourceRowLimitReached: payload.sourceRowLimitReached,
      matchedEmployeeCount,
      unmatchedEmployeeCount,
      years,
      duration: formatDuration(stopTimer())
    });

    return payload;
  } catch (error) {
    logError('labor-hana', 'HANA labor utilization SQL queries failed.', error, {
      tableName: LABOR_UTILIZATION_HANA_TABLE_NAME,
      rosterTableName: ROSTER_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}
