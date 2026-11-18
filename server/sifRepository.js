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

import { executeDatabricksQuery } from './databricksQuery.js';

const SIF_KPI_ID = 5;
const POTENTIAL_SIF_KPI_ID = 6;
const NMFR_KPI_ID = 4;
const INCIDENT_ORG_UNIT_NAME = 'Defense';
const DEFENSE_SYSTEMS_BUS_UNIT = 'Defense Systems';
const SAFETY_EVENTS_TABLE_NAME = 'integrated_operations_dev.analytics.safety_events';
const SAFETY_EVENTS_TABLE_SQL = '`integrated_operations_dev`.`analytics`.`safety_events`';
const ROSTER_TABLE_NAME = 'RosterExtractFarm';
const METRIC_DEFINITIONS = {
  sif: {
    kpiId: SIF_KPI_ID,
    kpiName: 'Significant Injuries or Fatalities (SIF)',
    kpiUpper: 'SIF INCIDENTS'
  },
  potentialSif: {
    kpiId: POTENTIAL_SIF_KPI_ID,
    kpiName: 'Potential Significant Injuries or Fatalities (pSIF)',
    kpiUpper: 'POTENTIAL SIF INCIDENTS'
  },
  nmfr: {
    kpiId: NMFR_KPI_ID,
    kpiName: 'Near Miss Frequency Rate (NMFR)',
    kpiUpper: 'NEAR MISS FREQUENCY RATE'
  }
};

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

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function padMonth(month) {
  return String(month).padStart(2, '0');
}

function formatMonthStartDate(year, month) {
  return `${year}-${padMonth(month)}-01`;
}

function getWorkingDaysInMonth(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let workingDayCount = 0;

  for (let day = 1; day <= lastDay; day += 1) {
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDayCount += 1;
    }
  }

  return workingDayCount;
}

function calculateNmfr(nearMissCount, employeeCount, workingDays) {
  if (!Number.isFinite(employeeCount) || employeeCount <= 0) {
    return 0;
  }

  if (!Number.isFinite(workingDays) || workingDays <= 0) {
    return 0;
  }

  return Number(((200000 * nearMissCount) / (employeeCount * 8 * workingDays)).toFixed(2));
}

function createMetricRow(metricKey, year, month, actualValue, extras = {}) {
  const metricDefinition = METRIC_DEFINITIONS[metricKey];

  return {
    kpi_id: metricDefinition.kpiId,
    kpi_name: metricDefinition.kpiName,
    kpi_upper: metricDefinition.kpiUpper,
    org_unit_type: 'Bus unit',
    org_unit_name: INCIDENT_ORG_UNIT_NAME,
    date: formatMonthStartDate(year, month),
    actual_value: actualValue,
    year,
    month,
    ...extras
  };
}

function buildMetricPayloadsFromMonthlyCounts(monthlyCounts, employeeCount = null) {
  const orderedMonths = [...monthlyCounts].sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year;
    }

    return left.month - right.month;
  });

  const sifRows = [];
  const potentialSifRows = [];
  const nmfrRows = employeeCount == null ? null : [];

  orderedMonths.forEach((row) => {
    const workingDays = getWorkingDaysInMonth(row.year, row.month);
    const sifCount = Number(row.sif_count ?? 0);
    const potentialSifCount = Number(row.potential_sif_count ?? 0);
    const nearMissCount = Number(row.near_miss_count ?? 0);

    sifRows.push(
      createMetricRow('sif', row.year, row.month, sifCount, {
        division: row.division,
        site: row.site,
        event_count: sifCount
      })
    );
    potentialSifRows.push(
      createMetricRow('potentialSif', row.year, row.month, potentialSifCount, {
        division: row.division,
        site: row.site,
        event_count: potentialSifCount
      })
    );
    if (nmfrRows) {
      nmfrRows.push(
        createMetricRow(
          'nmfr',
          row.year,
          row.month,
          calculateNmfr(nearMissCount, employeeCount, workingDays),
          {
            division: row.division,
            site: row.site,
            near_miss_count: nearMissCount,
            employee_count: employeeCount,
            working_days: workingDays
          }
        )
      );
    }
  });

  const metrics = {
    sif: {
      kpiId: SIF_KPI_ID,
      rowCount: sifRows.length,
      rows: sifRows
    },
    potentialSif: {
      kpiId: POTENTIAL_SIF_KPI_ID,
      rowCount: potentialSifRows.length,
      rows: potentialSifRows
    }
  };

  if (nmfrRows) {
    metrics.nmfr = {
      kpiId: NMFR_KPI_ID,
      rowCount: nmfrRows.length,
      rows: nmfrRows
    };
  }

  return metrics;
}

async function readSafetyEmployeeCount(pool) {
  const { config: rosterConfig } = getConnectionConfig('roster');
  const rosterTableName = formatSqlIdentifier(ROSTER_TABLE_NAME, rosterConfig);
  const result = await pool
    .request()
    .input('busUnitLvl2NoCode', DEFENSE_SYSTEMS_BUS_UNIT)
    .query(`
      SELECT
        COUNT(DISTINCT NULLIF(LTRIM(RTRIM(COALESCE([MyID], ''))), '')) AS [employee_count]
      FROM ${rosterTableName}
      WHERE [BusUnitLvl2NoCode] = @busUnitLvl2NoCode;
    `);

  return normalizeInteger(result.recordset[0]?.employee_count) ?? 0;
}

async function readSafetyMonthlyCounts() {
  const result = await executeDatabricksQuery({
    scope: 'safety',
    tableName: SAFETY_EVENTS_TABLE_NAME,
    query: `
    WITH parsed_events AS (
      SELECT
        TRY_CAST(source.\`Date\` AS DATE) AS \`event_date\`,
        TRIM(COALESCE(source.\`Division\`, '')) AS \`division\`,
        TRIM(COALESCE(source.\`Site\`, '')) AS \`site\`,
        COALESCE(TRY_CAST(source.\`SIF\` AS int), 0) AS \`sif_flag\`,
        COALESCE(TRY_CAST(source.\`pSIF\` AS int), 0) AS \`potential_sif_flag\`,
        COALESCE(TRY_CAST(source.\`Near Miss\` AS int), 0) AS \`near_miss_flag\`
      FROM ${SAFETY_EVENTS_TABLE_SQL} AS source
    ),
    classified_events AS (
      SELECT
        YEAR(source.\`event_date\`) AS \`year\`,
        MONTH(source.\`event_date\`) AS \`month\`,
        source.\`division\` AS \`division\`,
        source.\`site\` AS \`site\`,
        CASE
          WHEN source.\`sif_flag\` = 1 THEN 1
          ELSE 0
        END AS \`sif_count\`,
        CASE
          WHEN source.\`sif_flag\` = 0
            AND source.\`potential_sif_flag\` = 1 THEN 1
          ELSE 0
        END AS \`potential_sif_count\`,
        CASE
          WHEN source.\`sif_flag\` = 0
            AND source.\`potential_sif_flag\` = 0
            AND source.\`near_miss_flag\` = 1 THEN 1
          ELSE 0
        END AS \`near_miss_count\`
      FROM parsed_events AS source
      WHERE source.\`event_date\` IS NOT NULL
    )
    SELECT
      \`year\`,
      \`month\`,
      \`division\`,
      \`site\`,
      SUM(\`sif_count\`) AS \`sif_count\`,
      SUM(\`potential_sif_count\`) AS \`potential_sif_count\`,
      SUM(\`near_miss_count\`) AS \`near_miss_count\`
    FROM classified_events
    WHERE \`year\` IS NOT NULL
      AND \`month\` BETWEEN 1 AND 12
    GROUP BY
      \`year\`,
      \`month\`,
      \`division\`,
      \`site\`
    HAVING
      SUM(\`sif_count\`) + SUM(\`potential_sif_count\`) + SUM(\`near_miss_count\`) > 0
    ORDER BY
      \`year\` ASC,
      \`month\` ASC,
      \`division\` ASC,
      \`site\` ASC;
  `
  });

  return result.map((row) => ({
    year: normalizeInteger(row.year),
    month: normalizeInteger(row.month),
    division: normalizeText(row.division),
    site: normalizeText(row.site),
    sif_count: normalizeInteger(row.sif_count) ?? 0,
    potential_sif_count: normalizeInteger(row.potential_sif_count) ?? 0,
    near_miss_count: normalizeInteger(row.near_miss_count) ?? 0
  }));
}

export async function readSafetyEventMetricsData() {
  const stopTimer = createTimer();

  try {
    const monthlyCounts = await readSafetyMonthlyCounts();
    const payload = {
      source: 'databricks',
      tableName: SAFETY_EVENTS_TABLE_NAME,
      rowCount: monthlyCounts.length,
      metrics: buildMetricPayloadsFromMonthlyCounts(monthlyCounts)
    };
    logDebug('safety', 'Safety incident Databricks query completed.', {
      tableName: payload.tableName,
      rowCount: payload.rowCount,
      duration: formatDuration(stopTimer())
    });
    return payload;
  } catch (error) {
    logError('safety', 'Safety incident Databricks query failed.', error, {
      tableName: SAFETY_EVENTS_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}

export async function readSafetyNmfrData() {
  const stopTimer = createTimer();
  const {
    config: rosterConfig,
    missing: rosterMissing,
    source: rosterConnectionSource
  } = getConnectionConfig('roster');

  logDebug('safety', 'Starting safety NMFR data load.', {
    hasRosterConnectionConfig: rosterMissing.length === 0,
    tableName: SAFETY_EVENTS_TABLE_NAME,
    rosterTableName: ROSTER_TABLE_NAME,
    rosterConnectionSource
  });

  if (rosterMissing.length > 0) {
    throw new Error(`Missing roster database environment variables: ${rosterMissing.join(', ')}`);
  }

  try {
    const rosterPool = await getPool(rosterConfig, 'roster');

    logDebug('safety', 'Loading safety events from Databricks and NMFR roster from SQL Server.', {
      tableName: SAFETY_EVENTS_TABLE_NAME,
      rosterTableName: ROSTER_TABLE_NAME,
      rosterConnectionSource
    });

    const [monthlyCounts, defenseSystemsEmployeeCount] = await Promise.all([
      readSafetyMonthlyCounts(),
      readSafetyEmployeeCount(rosterPool)
    ]);

    if (defenseSystemsEmployeeCount <= 0) {
      throw new Error(
        `No ${DEFENSE_SYSTEMS_BUS_UNIT} employees were found in ${ROSTER_TABLE_NAME}.`
      );
    }

    const payload = {
      source: 'databricks',
      tableName: SAFETY_EVENTS_TABLE_NAME,
      rosterTableName: ROSTER_TABLE_NAME,
      defenseSystemsEmployeeCount,
      rowCount: monthlyCounts.length,
      metrics: buildMetricPayloadsFromMonthlyCounts(monthlyCounts, defenseSystemsEmployeeCount)
    };

    logDebug('safety', 'Safety NMFR data load completed.', {
      source: payload.source,
      tableName: payload.tableName,
      rosterTableName: payload.rosterTableName,
      rosterConnectionSource,
      rowCount: payload.rowCount,
      defenseSystemsEmployeeCount,
      duration: formatDuration(stopTimer())
    });

    return payload;
  } catch (error) {
    logError('safety', 'Safety NMFR data load failed.', error, {
      tableName: SAFETY_EVENTS_TABLE_NAME,
      rosterTableName: ROSTER_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });

    throw error;
  }
}

export function getSafetyMetricPayload(safetyMetricsPayload, metricKey) {
  const metricPayload = safetyMetricsPayload.metrics?.[metricKey];

  if (!metricPayload) {
    throw new Error(`Unknown safety metric key: ${metricKey}`);
  }

  return {
    source: safetyMetricsPayload.source,
    tableName: safetyMetricsPayload.tableName,
    rosterTableName: safetyMetricsPayload.rosterTableName,
    defenseSystemsEmployeeCount: safetyMetricsPayload.defenseSystemsEmployeeCount,
    rowCount: metricPayload.rowCount,
    kpiId: metricPayload.kpiId,
    orgUnitName: INCIDENT_ORG_UNIT_NAME,
    rows: metricPayload.rows
  };
}
