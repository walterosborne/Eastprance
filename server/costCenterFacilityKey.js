import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { createTimer, formatDuration, logDebug, logError } from './debugLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const COST_CENTER_FACILITY_KEY_PATH = path.resolve(
  __dirname,
  '../data/costcenterkey.xlsx'
);

let cachedFacilityKey = null;

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeCostCenter(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeSourceRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );
}

function buildFacilityKey(sourceRows) {
  const normalizedRows = sourceRows
    .map(normalizeSourceRow)
    .map((row) => ({
      costCenter: normalizeCostCenter(row.cost_center),
      address: normalizeText(row.address),
      city: normalizeText(row.city),
      state: normalizeText(row.state)
    }))
    .filter((row) => row.costCenter);
  const statesByCity = new Map();

  normalizedRows.forEach(({ city, state }) => {
    if (!city || !state) {
      return;
    }

    const cityKey = city.toLowerCase();
    const states = statesByCity.get(cityKey) ?? new Set();
    states.add(state.toUpperCase());
    statesByCity.set(cityKey, states);
  });

  const lookup = new Map();
  let duplicateCostCenterCount = 0;

  normalizedRows.forEach((row) => {
    const existingMapping = lookup.get(row.costCenter);

    if (existingMapping) {
      duplicateCostCenterCount += 1;

      if (existingMapping.city || !row.city) {
        return;
      }
    }

    const cityAppearsInMultipleStates = (statesByCity.get(row.city.toLowerCase())?.size ?? 0) > 1;
    const facility = cityAppearsInMultipleStates && row.state
      ? `${row.city}, ${row.state}`
      : row.city;

    lookup.set(row.costCenter, {
      facility: facility || 'Unmapped',
      city: row.city,
      state: row.state,
      address: row.address
    });
  });

  return {
    lookup,
    sourceRowCount: sourceRows.length,
    mappedCostCenterCount: lookup.size,
    duplicateCostCenterCount
  };
}

export async function readCostCenterFacilityKey() {
  const stopTimer = createTimer();

  try {
    const fileStats = await fs.stat(COST_CENTER_FACILITY_KEY_PATH);

    if (cachedFacilityKey?.modifiedTimeMs === fileStats.mtimeMs) {
      return cachedFacilityKey;
    }

    const workbook = XLSX.readFile(COST_CENTER_FACILITY_KEY_PATH, { cellDates: false });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error('The cost-center facility key workbook does not contain a worksheet.');
    }

    const sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: null,
      raw: true
    });
    const availableColumns = new Set(
      Object.keys(sourceRows[0] ?? {}).map(normalizeHeader)
    );
    const requiredColumns = ['cost_center', 'address', 'city', 'state'];
    const missingColumns = requiredColumns.filter(
      (columnName) => !availableColumns.has(columnName)
    );

    if (sourceRows.length > 0 && missingColumns.length > 0) {
      throw new Error(
        `Cost-center facility key is missing required columns: ${missingColumns.join(', ')}`
      );
    }

    const facilityKey = buildFacilityKey(sourceRows);
    cachedFacilityKey = {
      ...facilityKey,
      fileName: path.basename(COST_CENTER_FACILITY_KEY_PATH),
      sheetName,
      modifiedTimeMs: fileStats.mtimeMs
    };

    logDebug('cost-center-key', 'Cost-center facility key loaded.', {
      filePath: COST_CENTER_FACILITY_KEY_PATH,
      sheetName,
      sourceRowCount: facilityKey.sourceRowCount,
      mappedCostCenterCount: facilityKey.mappedCostCenterCount,
      duplicateCostCenterCount: facilityKey.duplicateCostCenterCount,
      duration: formatDuration(stopTimer())
    });

    return cachedFacilityKey;
  } catch (error) {
    logError('cost-center-key', 'Cost-center facility key failed to load.', error, {
      filePath: COST_CENTER_FACILITY_KEY_PATH,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}
