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
const LABOR_UTILIZATION_NEW_FILE_PATH = path.resolve(
  __dirname,
  '../data/labor_utilization_new.xlsx'
);
const REQUIRED_COLUMNS = [
  'year',
  'month',
  'division',
  'business_unit',
  'facility',
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

export function normalizeLaborUtilizationNewRow(row) {
  const source = getNormalizedSourceRow(row);
  const year = normalizeNumber(source.year);
  const month = normalizeNumber(source.month);
  const enteredHours = normalizeNumber(source.entered_hours);

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
    facility: normalizeText(source.facility),
    labor_category: normalizeText(source.labor_category),
    entered_hours: enteredHours
  };
}

export async function readLaborUtilizationNewData() {
  const stopTimer = createTimer();

  logDebug('labor-new', 'Loading new labor utilization workbook.', {
    filePath: LABOR_UTILIZATION_NEW_FILE_PATH
  });

  try {
    await fs.access(LABOR_UTILIZATION_NEW_FILE_PATH);

    const workbook = XLSX.readFile(LABOR_UTILIZATION_NEW_FILE_PATH, { cellDates: false });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error('The new labor utilization workbook does not contain a worksheet.');
    }

    const worksheet = workbook.Sheets[sheetName];
    const sourceRows = XLSX.utils.sheet_to_json(worksheet, {
      defval: null,
      raw: true
    });
    const availableColumns = new Set(
      Object.keys(sourceRows[0] ?? {}).map(normalizeHeader)
    );
    const missingColumns = REQUIRED_COLUMNS.filter(
      (columnName) => !availableColumns.has(columnName)
    );

    if (sourceRows.length > 0 && missingColumns.length > 0) {
      throw new Error(
        `The new labor utilization workbook is missing required columns: ${missingColumns.join(', ')}`
      );
    }

    const rows = sourceRows
      .map(normalizeLaborUtilizationNewRow)
      .filter(Boolean);
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
    const payload = {
      source: 'excel',
      fileName: path.basename(LABOR_UTILIZATION_NEW_FILE_PATH),
      sheetName,
      sourceRowCount: sourceRows.length,
      rowCount: rows.length,
      invalidRowCount: sourceRows.length - rows.length,
      years,
      totalEnteredHours,
      laborCategoryCounts: categoryCounts,
      rows
    };

    logDebug('labor-new', 'New labor utilization workbook loaded.', {
      fileName: payload.fileName,
      sheetName,
      sourceRowCount: payload.sourceRowCount,
      rowCount: payload.rowCount,
      invalidRowCount: payload.invalidRowCount,
      years,
      totalEnteredHours,
      directRowCount: categoryCounts.direct,
      indirectRowCount: categoryCounts.indirect,
      otherRowCount: categoryCounts.other,
      duration: formatDuration(stopTimer())
    });

    return payload;
  } catch (error) {
    const normalizedError = error?.code === 'ENOENT'
      ? new Error(
        `New labor utilization workbook not found at ${LABOR_UTILIZATION_NEW_FILE_PATH}.`
      )
      : error;

    logError('labor-new', 'Unable to load new labor utilization workbook.', normalizedError, {
      filePath: LABOR_UTILIZATION_NEW_FILE_PATH,
      duration: formatDuration(stopTimer())
    });
    throw normalizedError;
  }
}
