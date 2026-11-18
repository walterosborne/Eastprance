import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import { executeDatabricksQuery } from './databricksQuery.js';

const MONTH_COLUMNS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const OTD_TABLE_NAME = 'integrated_operations_dev.analytics.otd';
const OTD_TABLE_SQL = '`integrated_operations_dev`.`analytics`.`otd`';
const DEFAULT_OTD_YEAR = 2026;
function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeMeasureType(value) {
  const normalizedValue = String(value ?? '').trim();

  if (normalizedValue === 'Contract Commitment') {
    return 'Contract Commitment';
  }

  if (normalizedValue === 'Actual Delivered' || normalizedValue === 'Actuals Delivered') {
    return 'Actuals Delivered';
  }

  return normalizedValue;
}

function normalizeYear(value, fallbackYear = null) {
  const year = Number(value);
  return Number.isInteger(year) ? year : fallbackYear;
}

function normalizeOtdRow(row, fallbackYear = null) {
  const normalizedRow = {
    program: row.Program ?? '',
    division: row.Division ?? '',
    business_unit: row['Business Unit'] ?? '',
    project_id: row['Project ID'] ?? '',
    site: row.Site ?? '',
    type: row.Type ?? '',
    measure_type: normalizeMeasureType(row.Timeline ?? row['2026'] ?? ''),
    year: normalizeYear(row.Year, fallbackYear)
  };

  for (const month of MONTH_COLUMNS) {
    normalizedRow[month] = normalizeNumber(row[month]);
  }

  return normalizedRow;
}

export async function readOtdData() {
  const stopTimer = createTimer();

  try {
    const result = await executeDatabricksQuery({
      scope: 'otd',
      tableName: OTD_TABLE_NAME,
      query: `
      SELECT
        \`Timeline\`,
        \`Program\`,
        \`Division\`,
        \`Business Unit\`,
        \`Project ID\`,
        \`Site\`,
        \`Type\`,
        \`JAN\`,
        \`FEB\`,
        \`MAR\`,
        \`APR\`,
        \`MAY\`,
        \`JUN\`,
        \`JUL\`,
        \`AUG\`,
        \`SEP\`,
        \`OCT\`,
        \`NOV\`,
        \`DEC\`,
        \`Year\`
      FROM ${OTD_TABLE_SQL}
      ORDER BY \`Year\` ASC, \`Project ID\` ASC, \`Timeline\` ASC;

    `
    });
    const rows = result.map((row) => normalizeOtdRow(row, DEFAULT_OTD_YEAR));

    logDebug('otd', 'OTD Databricks query completed.', {
      tableName: OTD_TABLE_NAME,
      rowCount: rows.length,
      duration: formatDuration(stopTimer())
    });

    return {
      source: 'databricks',
      tableName: OTD_TABLE_NAME,
      rowCount: rows.length,
      rows
    };
  } catch (error) {
    logError('otd', 'OTD Databricks query failed.', error, {
      tableName: OTD_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}
