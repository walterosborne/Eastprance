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

const CONTROLLABLE_COSTS_HANA_TABLE_NAME = 'qmi.controllable_costs_hana';
const MIN_DOCUMENT_DATE_EXCLUSIVE = '2023-12-31';

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

function normalizeDate(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const normalizedValue = normalizeText(value);
  const isoDateMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoDateMatch) {
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  }

  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString().slice(0, 10);
}

export function normalizeControllableCostsHanaRow(row) {
  const date = normalizeDate(row.date ?? row['Date of Document']);
  const parsedDate = date ? new Date(`${date}T00:00:00.000Z`) : new Date('');
  const derivedYear = Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getUTCFullYear();
  const derivedQuarter = Number.isNaN(parsedDate.getTime())
    ? ''
    : `Q${Math.floor(parsedDate.getUTCMonth() / 3) + 1}`;

  return {
    date,
    year: normalizeInteger(row.year ?? row.Year) ?? derivedYear,
    quarter: normalizeText(row.quarter ?? row.Quarter).toUpperCase() || derivedQuarter,
    cost: normalizeNumber(row.cost ?? row['Amount in Global Currency']),
    sector: normalizeText(row.sector ?? row.Sector),
    division: normalizeText(row.division ?? row.Division),
    business_unit: normalizeText(row.business_unit ?? row['Business Unit'])
  };
}

export async function readControllableCostsHanaData() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig();

  logDebug('controllable-costs-hana', 'Starting HANA controllable costs data load.', {
    hasConnectionConfig: missing.length === 0,
    tableName: CONTROLLABLE_COSTS_HANA_TABLE_NAME,
    minDocumentDateExclusive: MIN_DOCUMENT_DATE_EXCLUSIVE
  });

  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  try {
    const pool = await getPool(config, 'default');
    const tableName = formatSqlIdentifier(CONTROLLABLE_COSTS_HANA_TABLE_NAME, config);

    logDebug('controllable-costs-hana', 'Executing HANA controllable costs SQL query.', {
      tableName
    });

    const result = await pool.request().query(`
      WITH normalized_costs AS (
        SELECT
          TRY_CONVERT(date, source.[Date of Document]) AS [document_date],
          TRY_CONVERT(float, source.[Amount in Global Currency]) AS [cost],
          LTRIM(RTRIM(COALESCE(TRY_CONVERT(nvarchar(4000), source.[Sector]), ''))) AS [sector],
          LTRIM(RTRIM(COALESCE(TRY_CONVERT(nvarchar(4000), source.[Division]), ''))) AS [division],
          LTRIM(RTRIM(COALESCE(TRY_CONVERT(nvarchar(4000), source.[Business Unit]), ''))) AS [business_unit]
        FROM ${tableName} AS source
      )
      SELECT
        [document_date] AS [date],
        YEAR([document_date]) AS [year],
        CONCAT('Q', DATEPART(quarter, [document_date])) AS [quarter],
        [sector],
        [division],
        [business_unit],
        SUM([cost]) AS [cost]
      FROM normalized_costs
      WHERE [document_date] IS NOT NULL
        AND [document_date] > CONVERT(date, '${MIN_DOCUMENT_DATE_EXCLUSIVE}', 23)
        AND [cost] IS NOT NULL
      GROUP BY
        [document_date],
        [sector],
        [division],
        [business_unit]
      ORDER BY
        [document_date] ASC,
        [sector] ASC,
        [division] ASC,
        [business_unit] ASC;
    `);
    const rows = result.recordset
      .map(normalizeControllableCostsHanaRow)
      .filter((row) => row.date && Number.isFinite(row.cost));
    const payload = {
      source: 'mssql',
      tableName: CONTROLLABLE_COSTS_HANA_TABLE_NAME,
      rowCount: rows.length,
      rows
    };

    logDebug('controllable-costs-hana', 'HANA controllable costs SQL query completed.', {
      source: payload.source,
      tableName: payload.tableName,
      rowCount: payload.rowCount,
      duration: formatDuration(stopTimer())
    });

    return payload;
  } catch (error) {
    logError('controllable-costs-hana', 'HANA controllable costs SQL query failed.', error, {
      tableName: CONTROLLABLE_COSTS_HANA_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}
