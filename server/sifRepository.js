import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
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

const SIF_KPI_ID = 5;
const POTENTIAL_SIF_KPI_ID = 6;
const NMFR_KPI_ID = 4;
const INCIDENT_ORG_UNIT_NAME = 'Defense';
const DEFENSE_SYSTEMS_BUS_UNIT = 'Defense Systems';
const SAFETY_EVENTS_TABLE_NAME = 'westmarch_safety_events';
const ROSTER_TABLE_NAME = 'RosterExtractFarm';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sifFilePath = path.resolve(__dirname, '../data/sif_data.json');
const localRosterFilePath = path.resolve(__dirname, '../data/local_roster.json');

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

function getYearMonthFromDateValue(value) {
  if (value === null || value === undefined || value === '') {
    return {
      year: null,
      month: null
    };
  }

  const parsedDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return {
      year: null,
      month: null
    };
  }

  return {
    year: parsedDate.getUTCFullYear(),
    month: parsedDate.getUTCMonth() + 1
  };
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

function buildMetricPayloadsFromMonthlyCounts(monthlyCounts, employeeCount) {
  const orderedMonths = [...monthlyCounts].sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year;
    }

    return left.month - right.month;
  });

  const sifRows = [];
  const potentialSifRows = [];
  const nmfrRows = [];

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
    nmfrRows.push(
      createMetricRow('nmfr', row.year, row.month, calculateNmfr(nearMissCount, employeeCount, workingDays), {
        division: row.division,
        site: row.site,
        near_miss_count: nearMissCount,
        employee_count: employeeCount,
        working_days: workingDays
      })
    );
  });

  return {
    sif: {
      kpiId: SIF_KPI_ID,
      rowCount: sifRows.length,
      rows: sifRows
    },
    potentialSif: {
      kpiId: POTENTIAL_SIF_KPI_ID,
      rowCount: potentialSifRows.length,
      rows: potentialSifRows
    },
    nmfr: {
      kpiId: NMFR_KPI_ID,
      rowCount: nmfrRows.length,
      rows: nmfrRows
    }
  };
}

function normalizeLegacySifRow(row) {
  return {
    ...row,
    kpi_id: normalizeNumber(row.kpi_id),
    kpi_name: normalizeText(row.kpi_name),
    kpi_upper: normalizeText(row.kpi_upper),
    org_unit_type: normalizeText(row.org_unit_type),
    org_unit_name: normalizeText(row.org_unit_name),
    division: normalizeText(row.division ?? row.Division),
    site: normalizeText(row.site ?? row.Site),
    date: row.date ?? '',
    actual_value: normalizeNumber(row.actual_value),
    near_miss_count: normalizeNumber(row.near_miss_count),
    employee_count: normalizeNumber(row.employee_count),
    working_days: normalizeNumber(row.working_days)
  };
}

function normalizeSafetyEventRow(row) {
  const dateParts = getYearMonthFromDateValue(row.date ?? row.Date);

  return {
    year: dateParts.year ?? normalizeInteger(row.year ?? row.Year),
    month: dateParts.month ?? normalizeInteger(row.month ?? row.Month),
    division: normalizeText(row.division ?? row.Division),
    site: normalizeText(row.site ?? row.Site),
    near_miss: normalizeInteger(row.near_miss ?? row['Near Miss'] ?? row.nearMiss),
    potential_sif: normalizeInteger(row.potential_sif ?? row.pSIF ?? row.psif),
    sif: normalizeInteger(row.sif ?? row.SIF)
  };
}

function classifySafetyEvent(row) {
  if (row.sif === 1) {
    return 'sif';
  }

  if (row.potential_sif === 1) {
    return 'potentialSif';
  }

  if (row.near_miss === 1) {
    return 'nearMiss';
  }

  return null;
}

function aggregateSafetyEventRows(rows) {
  const monthlyCounts = new Map();

  rows.forEach((row) => {
    const normalizedRow = normalizeSafetyEventRow(row);

    if (
      !Number.isInteger(normalizedRow.year) ||
      !Number.isInteger(normalizedRow.month) ||
      normalizedRow.month < 1 ||
      normalizedRow.month > 12
    ) {
      return;
    }

    const metricKey = classifySafetyEvent(normalizedRow);

    if (!metricKey) {
      return;
    }

    const bucketKey = [
      normalizedRow.year,
      padMonth(normalizedRow.month),
      normalizedRow.division,
      normalizedRow.site
    ].join('|');
    const bucket = monthlyCounts.get(bucketKey) ?? {
      year: normalizedRow.year,
      month: normalizedRow.month,
      division: normalizedRow.division,
      site: normalizedRow.site,
      sif_count: 0,
      potential_sif_count: 0,
      near_miss_count: 0
    };

    if (metricKey === 'sif') {
      bucket.sif_count += 1;
    } else if (metricKey === 'potentialSif') {
      bucket.potential_sif_count += 1;
    } else if (metricKey === 'nearMiss') {
      bucket.near_miss_count += 1;
    }

    monthlyCounts.set(bucketKey, bucket);
  });

  return [...monthlyCounts.values()];
}

function normalizeLocalRosterRow(row) {
  return {
    my_id: normalizeText(row.my_id ?? row.MyID ?? row.myid ?? row['My ID']),
    bus_unit_lvl_2_no_code: normalizeText(
      row.bus_unit_lvl_2_no_code
      ?? row.BusUnitLvl2NoCode
      ?? row.busunitlvl2nocode
    )
  };
}

async function readLocalDefenseSystemsEmployeeCount() {
  try {
    const fileContents = await fs.readFile(localRosterFilePath, 'utf8');
    const parsedValue = JSON.parse(fileContents);
    const rows = Array.isArray(parsedValue) ? parsedValue : parsedValue?.rows;

    if (!Array.isArray(rows)) {
      return 0;
    }

    const normalizedRows = rows.map(normalizeLocalRosterRow);
    const hasBusUnitField = normalizedRows.some((row) => row.bus_unit_lvl_2_no_code);
    const matchingRows = hasBusUnitField
      ? normalizedRows.filter(
        (row) => row.bus_unit_lvl_2_no_code.toLowerCase() === DEFENSE_SYSTEMS_BUS_UNIT.toLowerCase()
      )
      : normalizedRows;

    return new Set(matchingRows.map((row) => row.my_id).filter(Boolean)).size;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0;
    }

    throw error;
  }
}

function buildLegacySafetyMetricsPayload(rows, metadata = {}) {
  const filteredRows = rows.filter(
    (row) => normalizeText(row.org_unit_name) === INCIDENT_ORG_UNIT_NAME
  );

  return {
    ...metadata,
    rowCount: filteredRows.length,
    metrics: {
      sif: {
        kpiId: SIF_KPI_ID,
        rowCount: filteredRows.filter((row) => row.kpi_id === SIF_KPI_ID).length,
        rows: filteredRows.filter((row) => row.kpi_id === SIF_KPI_ID)
      },
      potentialSif: {
        kpiId: POTENTIAL_SIF_KPI_ID,
        rowCount: filteredRows.filter((row) => row.kpi_id === POTENTIAL_SIF_KPI_ID).length,
        rows: filteredRows.filter((row) => row.kpi_id === POTENTIAL_SIF_KPI_ID)
      },
      nmfr: {
        kpiId: NMFR_KPI_ID,
        rowCount: filteredRows.filter((row) => row.kpi_id === NMFR_KPI_ID).length,
        rows: filteredRows.filter((row) => row.kpi_id === NMFR_KPI_ID)
      }
    }
  };
}

async function readFallbackSafetyMetricsData(reason) {
  const stopTimer = createTimer();

  logDebug('safety', 'Loading safety fallback file.', {
    filePath: sifFilePath,
    reason
  });

  await fs.access(sifFilePath);

  const rawFile = await fs.readFile(sifFilePath, 'utf8');
  const parsedValue = JSON.parse(rawFile);
  const rows = Array.isArray(parsedValue) ? parsedValue : parsedValue?.rows;

  if (!Array.isArray(rows)) {
    throw new Error('Safety fallback file did not contain an array of rows.');
  }

  const isLegacyShape = rows.some((row) => row?.kpi_id != null || row?.kpiId != null);
  let payload;

  if (isLegacyShape) {
    payload = buildLegacySafetyMetricsPayload(rows.map(normalizeLegacySifRow), {
      source: 'json',
      fileName: path.basename(sifFilePath),
      fallbackReason: reason
    });
  } else {
    const defenseSystemsEmployeeCount = await readLocalDefenseSystemsEmployeeCount();
    const monthlyCounts = aggregateSafetyEventRows(rows);

    payload = {
      source: 'json',
      fileName: path.basename(sifFilePath),
      fallbackReason: reason,
      defenseSystemsEmployeeCount,
      rowCount: monthlyCounts.length,
      metrics: buildMetricPayloadsFromMonthlyCounts(monthlyCounts, defenseSystemsEmployeeCount)
    };
  }

  logDebug('safety', 'Safety fallback data loaded.', {
    source: payload.source,
    fileName: payload.fileName,
    rowCount: payload.rowCount,
    duration: formatDuration(stopTimer())
  });

  return payload;
}

async function readSafetyEmployeeCount(pool) {
  const rosterTableName = formatSqlIdentifier(ROSTER_TABLE_NAME);
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

async function readSafetyMonthlyCounts(pool) {
  const tableName = formatSqlIdentifier(SAFETY_EVENTS_TABLE_NAME);
  const result = await pool.request().query(`
    WITH parsed_events AS (
      SELECT
        TRY_CONVERT(date, source.[Date]) AS [event_date],
        LTRIM(RTRIM(COALESCE(source.[Division], ''))) AS [division],
        LTRIM(RTRIM(COALESCE(source.[Site], ''))) AS [site],
        COALESCE(TRY_CAST(source.[SIF] AS int), 0) AS [sif_flag],
        COALESCE(TRY_CAST(source.[pSIF] AS int), 0) AS [potential_sif_flag],
        COALESCE(TRY_CAST(source.[Near Miss] AS int), 0) AS [near_miss_flag]
      FROM ${tableName} AS source
    ),
    classified_events AS (
      SELECT
        YEAR(source.[event_date]) AS [year],
        MONTH(source.[event_date]) AS [month],
        source.[division] AS [division],
        source.[site] AS [site],
        CASE
          WHEN source.[sif_flag] = 1 THEN 1
          ELSE 0
        END AS [sif_count],
        CASE
          WHEN source.[sif_flag] = 0
            AND source.[potential_sif_flag] = 1 THEN 1
          ELSE 0
        END AS [potential_sif_count],
        CASE
          WHEN source.[sif_flag] = 0
            AND source.[potential_sif_flag] = 0
            AND source.[near_miss_flag] = 1 THEN 1
          ELSE 0
        END AS [near_miss_count]
      FROM parsed_events AS source
      WHERE source.[event_date] IS NOT NULL
    )
    SELECT
      [year],
      [month],
      [division],
      [site],
      SUM([sif_count]) AS [sif_count],
      SUM([potential_sif_count]) AS [potential_sif_count],
      SUM([near_miss_count]) AS [near_miss_count]
    FROM classified_events
    WHERE [year] IS NOT NULL
      AND [month] BETWEEN 1 AND 12
    GROUP BY
      [year],
      [month],
      [division],
      [site]
    HAVING
      SUM([sif_count]) + SUM([potential_sif_count]) + SUM([near_miss_count]) > 0
    ORDER BY
      [year] ASC,
      [month] ASC,
      [division] ASC,
      [site] ASC;
  `);

  return result.recordset.map((row) => ({
    year: normalizeInteger(row.year),
    month: normalizeInteger(row.month),
    division: normalizeText(row.division),
    site: normalizeText(row.site),
    sif_count: normalizeInteger(row.sif_count) ?? 0,
    potential_sif_count: normalizeInteger(row.potential_sif_count) ?? 0,
    near_miss_count: normalizeInteger(row.near_miss_count) ?? 0
  }));
}

export async function readSafetyMetricsData() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig();

  logDebug('safety', 'Starting safety metrics data load.', {
    hasConnectionConfig: missing.length === 0,
    tableName: SAFETY_EVENTS_TABLE_NAME,
    rosterTableName: ROSTER_TABLE_NAME
  });

  if (missing.length > 0) {
    logDebug('safety', 'Safety metrics data load is missing SQL configuration; using fallback.', {
      missing
    });

    return readFallbackSafetyMetricsData(
      `Missing database environment variables: ${missing.join(', ')}`
    );
  }

  try {
    const pool = await getPool(config);

    logDebug('safety', 'Executing safety SQL queries.', {
      tableName: SAFETY_EVENTS_TABLE_NAME,
      rosterTableName: ROSTER_TABLE_NAME
    });

    const [monthlyCounts, defenseSystemsEmployeeCount] = await Promise.all([
      readSafetyMonthlyCounts(pool),
      readSafetyEmployeeCount(pool)
    ]);

    if (defenseSystemsEmployeeCount <= 0) {
      throw new Error(
        `No ${DEFENSE_SYSTEMS_BUS_UNIT} employees were found in ${ROSTER_TABLE_NAME}.`
      );
    }

    const payload = {
      source: 'mssql',
      tableName: SAFETY_EVENTS_TABLE_NAME,
      rosterTableName: ROSTER_TABLE_NAME,
      defenseSystemsEmployeeCount,
      rowCount: monthlyCounts.length,
      metrics: buildMetricPayloadsFromMonthlyCounts(monthlyCounts, defenseSystemsEmployeeCount)
    };

    logDebug('safety', 'Safety SQL queries completed.', {
      source: payload.source,
      tableName: payload.tableName,
      rosterTableName: payload.rosterTableName,
      rowCount: payload.rowCount,
      defenseSystemsEmployeeCount,
      duration: formatDuration(stopTimer())
    });

    return payload;
  } catch (error) {
    logError('safety', 'Safety SQL query failed; using fallback data.', error, {
      tableName: SAFETY_EVENTS_TABLE_NAME,
      rosterTableName: ROSTER_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });

    return readFallbackSafetyMetricsData(`Database read failed: ${error.message}`);
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
    fileName: safetyMetricsPayload.fileName,
    fallbackReason: safetyMetricsPayload.fallbackReason,
    defenseSystemsEmployeeCount: safetyMetricsPayload.defenseSystemsEmployeeCount,
    rowCount: metricPayload.rowCount,
    kpiId: metricPayload.kpiId,
    orgUnitName: INCIDENT_ORG_UNIT_NAME,
    rows: metricPayload.rows
  };
}
