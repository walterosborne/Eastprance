import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTROLLABLE_COSTS_NEW_FILE_PATH = path.resolve(__dirname, '../data/cost.xlsx');
const REQUIRED_COLUMNS = [
  'year',
  'month',
  'division',
  'business_unit',
  'facility',
  'cost_category',
  'gl_account_cost_element',
  'cost_element_description',
  'cost'
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

function normalizeControllability(costType, costCategory) {
  const classification = `${normalizeText(costType)} ${normalizeText(costCategory)}`.toLowerCase();
  const compactClassification = classification.replace(/[^a-z]/g, '');

  if (
    compactClassification.includes('uncontrollable')
    || compactClassification.includes('noncontrollable')
  ) {
    return 'Uncontrollable';
  }

  // The new extract has no resolved status column, so unmatched rows remain in the primary series.
  return 'Controllable';
}

export function normalizeControllableCostsNewRow(row) {
  const source = getNormalizedSourceRow(row);
  const year = normalizeNumber(source.year);
  const month = normalizeNumber(source.month);
  const cost = normalizeNumber(source.cost);
  const costCategory = normalizeText(source.cost_category) || 'Other';
  const costElement = normalizeText(source.gl_account_cost_element);

  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || month < 1
    || month > 12
    || cost === null
  ) {
    return null;
  }

  return {
    year,
    month,
    date: `${year}-${String(month).padStart(2, '0')}-01`,
    quarter: `Q${Math.floor((month - 1) / 3) + 1}`,
    division: normalizeText(source.division),
    business_unit: normalizeText(source.business_unit),
    facility: normalizeText(source.facility) || 'Unmapped',
    address: normalizeText(source.facility) || 'Unmapped',
    cost_center: normalizeText(source.cost_center),
    cost_category: costCategory,
    cost_element: costElement,
    gl_account_cost_element: costElement,
    cost_element_description: normalizeText(source.cost_element_description),
    cost_type: normalizeText(source.cost_type),
    facility_type: normalizeText(source.facility_type),
    cost,
    controllable: normalizeControllability(source.cost_type, costCategory)
  };
}

export async function readControllableCostsNewData() {
  const stopTimer = createTimer();

  logDebug('controllable-costs-new', 'Loading new controllable costs workbook.', {
    filePath: CONTROLLABLE_COSTS_NEW_FILE_PATH
  });

  try {
    await fs.access(CONTROLLABLE_COSTS_NEW_FILE_PATH);

    const workbook = XLSX.readFile(CONTROLLABLE_COSTS_NEW_FILE_PATH, { cellDates: false });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error('The new controllable costs workbook does not contain a worksheet.');
    }

    const worksheet = workbook.Sheets[sheetName];
    const sourceRows = XLSX.utils.sheet_to_json(worksheet, {
      defval: null,
      raw: true
    });
    const availableColumns = new Set(Object.keys(sourceRows[0] ?? {}).map(normalizeHeader));
    const missingColumns = REQUIRED_COLUMNS.filter(
      (columnName) => !availableColumns.has(columnName)
    );

    if (sourceRows.length > 0 && missingColumns.length > 0) {
      throw new Error(
        `The new controllable costs workbook is missing required columns: ${missingColumns.join(', ')}`
      );
    }

    const rows = sourceRows.map(normalizeControllableCostsNewRow).filter(Boolean);
    const years = Array.from(new Set(rows.map((row) => row.year)).values()).sort(
      (left, right) => left - right
    );
    const totalCost = Number(rows.reduce((sum, row) => sum + row.cost, 0).toFixed(2));
    const controllableRowCount = rows.filter(
      (row) => row.controllable === 'Controllable'
    ).length;
    const uncontrollableRowCount = rows.length - controllableRowCount;
    const payload = {
      source: 'excel',
      fileName: path.basename(CONTROLLABLE_COSTS_NEW_FILE_PATH),
      sheetName,
      sourceRowCount: sourceRows.length,
      rowCount: rows.length,
      invalidRowCount: sourceRows.length - rows.length,
      years,
      totalCost,
      controllableRowCount,
      uncontrollableRowCount,
      rows
    };

    logDebug('controllable-costs-new', 'New controllable costs workbook loaded.', {
      fileName: payload.fileName,
      sheetName,
      sourceRowCount: payload.sourceRowCount,
      rowCount: payload.rowCount,
      invalidRowCount: payload.invalidRowCount,
      years,
      totalCost,
      controllableRowCount,
      uncontrollableRowCount,
      duration: formatDuration(stopTimer())
    });

    return payload;
  } catch (error) {
    const normalizedError = error?.code === 'ENOENT'
      ? new Error(`New controllable costs workbook not found at ${CONTROLLABLE_COSTS_NEW_FILE_PATH}.`)
      : error;

    logError(
      'controllable-costs-new',
      'Unable to load new controllable costs workbook.',
      normalizedError,
      {
        filePath: CONTROLLABLE_COSTS_NEW_FILE_PATH,
        duration: formatDuration(stopTimer())
      }
    );
    throw normalizedError;
  }
}
