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

const WORKBOOK_MONTH_COLUMNS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NORMALIZED_MONTH_COLUMNS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const LABOR_UTILIZATION_TABLE_NAME = 'labor_utilization';
function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLaborUtilizationRow(row) {
  const normalizedRow = {
    my_id: row.MyID ?? '',
    employee_name: row['Employee Name'] ?? '',
    forecasted_cc: row['Forecasted CC'] ?? '',
    pool: row.Pool ?? '',
    location_code: row['Location Code'] ?? '',
    union_type: row['Union Type'] ?? '',
    worker_type: row['Worker Type'] ?? '',
    worker_subtype: row['Worker Subtype'] ?? '',
    time_type: row['Time Type'] ?? '',
    labor_category: row['Labor Category'] ?? '',
    measure: row.Measure ?? '',
    total_2026: normalizeNumber(row['2026'])
  };

  WORKBOOK_MONTH_COLUMNS.forEach((month, index) => {
    normalizedRow[NORMALIZED_MONTH_COLUMNS[index]] = normalizeNumber(row[month]);
  });

  return normalizedRow;
}

export async function readLaborUtilizationData() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig();

  logDebug('labor', 'Starting labor utilization data load.', {
    hasConnectionConfig: missing.length === 0,
    tableName: LABOR_UTILIZATION_TABLE_NAME
  });

  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  try {
    const pool = await getPool(config);
    const tableName = formatSqlIdentifier(LABOR_UTILIZATION_TABLE_NAME, config);

    logDebug('labor', 'Executing labor utilization SQL query.', {
      tableName
    });

    const result = await pool.request().query(`
      SELECT
        '' AS [MyID],
        '' AS [Employee Name],
        source.[Forecasted CC],
        source.[Pool],
        source.[Location Code],
        source.[Union Type],
        source.[Worker Type],
        '' AS [Worker Subtype],
        source.[Time Type],
        source.[Labor Category],
        source.[Measure],
        SUM(COALESCE(source.[Jan], 0)) AS [Jan],
        SUM(COALESCE(source.[Feb], 0)) AS [Feb],
        SUM(COALESCE(source.[Mar], 0)) AS [Mar],
        SUM(COALESCE(source.[Apr], 0)) AS [Apr],
        SUM(COALESCE(source.[May], 0)) AS [May],
        SUM(COALESCE(source.[Jun], 0)) AS [Jun],
        SUM(COALESCE(source.[Jul], 0)) AS [Jul],
        SUM(COALESCE(source.[Aug], 0)) AS [Aug],
        SUM(COALESCE(source.[Sep], 0)) AS [Sep],
        SUM(COALESCE(source.[Oct], 0)) AS [Oct],
        SUM(COALESCE(source.[Nov], 0)) AS [Nov],
        SUM(COALESCE(source.[Dec], 0)) AS [Dec],
        SUM(
          COALESCE(source.[Jan], 0) +
          COALESCE(source.[Feb], 0) +
          COALESCE(source.[Mar], 0) +
          COALESCE(source.[Apr], 0) +
          COALESCE(source.[May], 0) +
          COALESCE(source.[Jun], 0) +
          COALESCE(source.[Jul], 0) +
          COALESCE(source.[Aug], 0) +
          COALESCE(source.[Sep], 0) +
          COALESCE(source.[Oct], 0) +
          COALESCE(source.[Nov], 0) +
          COALESCE(source.[Dec], 0)
        ) AS [2026]
      FROM ${tableName}
      AS source
      GROUP BY
        source.[Forecasted CC],
        source.[Pool],
        source.[Location Code],
        source.[Union Type],
        source.[Worker Type],
        source.[Time Type],
        source.[Labor Category],
        source.[Measure]
      ORDER BY
        source.[Forecasted CC] ASC,
        source.[Pool] ASC,
        source.[Labor Category] ASC,
        source.[Union Type] ASC,
        source.[Worker Type] ASC,
        source.[Time Type] ASC;
    `);
    const rows = result.recordset.map(normalizeLaborUtilizationRow);

    logDebug('labor', 'Labor utilization SQL query completed.', {
      source: 'mssql',
      tableName: LABOR_UTILIZATION_TABLE_NAME,
      rowCount: rows.length,
      duration: formatDuration(stopTimer())
    });

    return {
      source: 'mssql',
      tableName: LABOR_UTILIZATION_TABLE_NAME,
      rowCount: rows.length,
      rows
    };
  } catch (error) {
    logError('labor', 'Labor utilization SQL query failed.', error, {
      tableName: LABOR_UTILIZATION_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });

    throw error;
  }
}
