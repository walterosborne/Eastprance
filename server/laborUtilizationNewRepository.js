import { getLaborRosterConfig, readLaborRosterLookup, joinLaborFacilities } from './laborRosterDatabricksRepository.js';
import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import { normalizeCostCenter } from './costCenterFacilityKey.js';
import { LABOR_UTILIZATION_NEW_DBM_QUERY } from './dbmQueries/laborUtilizationNewQuery.js';
import { getConnectionConfig, getPool } from './sqlConnection.js';

const REQUIRED_COLUMNS = [
  'year',
  'month',
  'division',
  'business_unit',
  'labor_category',
  'entered_hours'
];

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getNormalizedSourceRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );
}

function classifyLaborCategory(value) {
  const normalizedCategory = normalizeText(value).toLowerCase();

  if (normalizedCategory.includes('indirect')) {
    return 'indirect';
  }

  if (normalizedCategory.includes('direct')) {
    return 'direct';
  }

  return 'other';
}

export function normalizeLaborUtilizationNewRow(row, useRosterFacilities = true) {
  const source = getNormalizedSourceRow(row);
  const year = normalizeNumber(source.year);
  const month = normalizeNumber(source.month);
  const enteredHours = normalizeNumber(source.entered_hours);
  const costCenter = normalizeCostCenter(source.cost_center);
  const facility = useRosterFacilities ? normalizeText(source.facility) : '';

  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || month < 1
    || month > 12
    || enteredHours === null
  ) {
    return null;
  }

  return {
    year,
    month,
    division: normalizeText(source.division),
    business_unit: normalizeText(source.business_unit),
    cost_center: costCenter,
    facility: facility || 'Unmapped',
    facility_state: facility ? normalizeText(source.facility_state) : '',
    labor_category: normalizeText(source.labor_category),
    entered_hours: enteredHours
  };
}

function validateSourceColumns(sourceRows, sourceLabel, requireCostCenter = false) {
  const availableColumns = new Set(
    Object.keys(sourceRows[0] ?? {}).map(normalizeHeader)
  );
  const requiredColumns = requireCostCenter
    ? [...REQUIRED_COLUMNS, 'cost_center', 'facility', 'facility_state']
    : REQUIRED_COLUMNS;
  const missingColumns = requiredColumns.filter(
    (columnName) => !availableColumns.has(columnName)
  );

  if (sourceRows.length > 0 && missingColumns.length > 0) {
    throw new Error(
      `${sourceLabel} is missing required columns: ${missingColumns.join(', ')}`
    );
  }
}

function buildLaborUtilizationPayload(sourceRows, metadata) {
  validateSourceColumns(sourceRows, metadata.sourceLabel, metadata.requireCostCenter);

  const useRosterFacilities = metadata.source === 'dbm-sql';
  const rows = sourceRows
    .map((row) => normalizeLaborUtilizationNewRow(row, useRosterFacilities))
    .filter(Boolean);
  const mappedRows = rows.filter((row) => row.facility !== 'Unmapped');
  const statesByCity = new Map();

  for (const { facility, facility_state } of mappedRows) {
    if (!facility_state) continue;
    const cityKey = facility.toLowerCase();
    const states = statesByCity.get(cityKey) ?? new Set();
    states.add(facility_state.toUpperCase());
    statesByCity.set(cityKey, states);
  }

  for (const row of mappedRows) {
    if (row.facility_state && statesByCity.get(row.facility.toLowerCase())?.size > 1) {
      row.facility = `${row.facility}, ${row.facility_state}`;
    }
  }
  const years = Array.from(new Set(rows.map((row) => row.year))).sort(
    (left, right) => left - right
  );
  const categoryCounts = rows.reduce(
    (counts, row) => {
      counts[classifyLaborCategory(row.labor_category)] += 1;
      return counts;
    },
    { direct: 0, indirect: 0, other: 0 }
  );
  const totalEnteredHours = Number(
    rows.reduce((sum, row) => sum + row.entered_hours, 0).toFixed(2)
  );

  return {
    source: metadata.source,
    fileName: metadata.fileName ?? null,
    sheetName: metadata.sheetName ?? null,
    queryFile: metadata.queryFile ?? null,
    sourceRowCount: sourceRows.length,
    rowCount: rows.length,
    invalidRowCount: sourceRows.length - rows.length,
    years,
    totalEnteredHours,
    laborCategoryCounts: categoryCounts,
    facilityMapping: {
      source: useRosterFacilities ? 'databricks' : null,
      sheetName: null,
      mappedCostCenterCount: new Set(mappedRows.map((row) => row.cost_center).filter(Boolean)).size,
      eligibleRowCount: rows.length,
      mappedRowCount: mappedRows.length,
      unmappedRowCount: rows.length - mappedRows.length,
      error: null
    },
    rows
  };
}

async function readLaborUtilizationNewDbmData(config, rosterConfig) {
  const stopTimer = createTimer();
  const pool = await getPool(config, 'dbm');

  logDebug('labor-new', 'Executing DBM labor utilization query.', {
    server: config.server,
    database: config.database,
    querySource: 'embedded-server-query'
  });

  // Approved use of the Databricks fiscal roster: labor facility attribution only.
  // Join after DBM preserves MyID and month, then remove employee IDs from the payload.
  const result = await pool.request().query(LABOR_UTILIZATION_NEW_DBM_QUERY);
  const rosterLookup = await readLaborRosterLookup(rosterConfig, result.recordset);
  const joinedRows = joinLaborFacilities(result.recordset, rosterLookup);
  const payload = buildLaborUtilizationPayload(joinedRows, {
    source: 'dbm-sql',
    sourceLabel: 'DBM labor joined to the Databricks roster',
    requireCostCenter: true
  });

  logDebug('labor-new', 'New labor utilization loaded from DBM SQL.', {
    source: payload.source,
    server: config.server,
    database: config.database,
    queryFile: payload.queryFile,
    sourceRowCount: payload.sourceRowCount,
    rowCount: payload.rowCount,
    invalidRowCount: payload.invalidRowCount,
    years: payload.years,
    totalEnteredHours: payload.totalEnteredHours,
    laborCategoryCounts: payload.laborCategoryCounts,
    facilityMapping: payload.facilityMapping,
    duration: formatDuration(stopTimer())
  });

  return payload;
}

export async function readLaborUtilizationNewData() {
  const rosterConfig = getLaborRosterConfig();
  const { config, missing } = getConnectionConfig('dbm');

  if (missing.length > 0) {
    throw new Error(`Missing DBM environment variables: ${missing.join(', ')}`);
  }

  try {
    return await readLaborUtilizationNewDbmData(config, rosterConfig);
  } catch (error) {
    logError('labor-new', 'DBM labor utilization load failed.', error, {
      server: config.server,
      database: config.database
    });
    throw error;
  }
}
