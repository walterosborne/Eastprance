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
import {
  formatSqlIdentifier,
  getConnectionConfig,
  getPool
} from './sqlConnection.js';

const CONTROLLABLE_COSTS_TABLE_NAME = 'westmarch_controllable_costs';
const COST_CATEGORY_KEY_TABLE_NAME = 'westmarch_cost_category_key';
const COST_ELEMENT_KEY_TABLE_NAME = 'westmarch_cost_element_key';
const WORKBOOK_SHEET_NAMES = {
  costs: 'Controllable Costs',
  categoryKey: 'Cost Category Key',
  elementKey: 'Cost Element Key'
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controllableCostsFilePath = path.resolve(__dirname, '../data/controllable_costs.xlsx');

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeControllable(value) {
  return String(value ?? '').trim().toLowerCase() === 'controllable'
    ? 'Controllable'
    : 'Uncontrollable';
}

function normalizeControllableCostsRow(row) {
  return {
    cost_category: row['Cost Category'] ?? '',
    address: row.Address ?? '',
    cost_element: row['Cost Element'] ?? '',
    cost_element_description: row['Cost Element Description'] ?? '',
    cost: normalizeNumber(row.Cost),
    quarter: String(row.Quarter ?? '').trim().toUpperCase(),
    year: normalizeInteger(row.Year),
    controllable: normalizeControllable(row['Resolved Controllable'])
  };
}

function getElementMatchRank(costRow, elementKeyRow) {
  if (
    elementKeyRow['Cost Category'] === costRow['Cost Category'] &&
    elementKeyRow['Cost Element Description'] === costRow['Cost Element Description']
  ) {
    return 0;
  }

  if (elementKeyRow['Cost Category'] === costRow['Cost Category']) {
    return 1;
  }

  if (elementKeyRow['Cost Element Description'] === costRow['Cost Element Description']) {
    return 2;
  }

  return 3;
}

function resolveControllableStatus(costRow, elementKeyRows, categoryKeyRows) {
  const matchingElementRows = elementKeyRows
    .filter((row) => row['Cost Element'] === costRow['Cost Element'])
    .sort((left, right) => getElementMatchRank(costRow, left) - getElementMatchRank(costRow, right));

  if (matchingElementRows.length > 0) {
    return normalizeControllable(matchingElementRows[0].Controllable);
  }

  const categoryMatch = categoryKeyRows.find(
    (row) => row['Cost Category'] === costRow['Cost Category']
  );

  return normalizeControllable(categoryMatch?.Controllable);
}

async function readFallbackControllableCostsData(reason) {
  const stopTimer = createTimer();

  logDebug('controllable-costs', 'Loading controllable costs fallback file.', {
    filePath: controllableCostsFilePath,
    reason
  });

  await fs.access(controllableCostsFilePath);

  const workbook = XLSX.readFile(controllableCostsFilePath, { cellDates: false });
  const costsWorksheet = workbook.Sheets[WORKBOOK_SHEET_NAMES.costs];
  const categoryKeyWorksheet = workbook.Sheets[WORKBOOK_SHEET_NAMES.categoryKey];
  const elementKeyWorksheet = workbook.Sheets[WORKBOOK_SHEET_NAMES.elementKey];

  const costRows = XLSX.utils.sheet_to_json(costsWorksheet, { defval: null, raw: true });
  const categoryKeyRows = XLSX.utils.sheet_to_json(categoryKeyWorksheet, { defval: null, raw: true });
  const elementKeyRows = XLSX.utils.sheet_to_json(elementKeyWorksheet, { defval: null, raw: true });
  const rows = costRows.map((row) =>
    normalizeControllableCostsRow({
      ...row,
      'Resolved Controllable': resolveControllableStatus(row, elementKeyRows, categoryKeyRows)
    })
  );

  const payload = {
    source: 'excel',
    fileName: path.basename(controllableCostsFilePath),
    rowCount: rows.length,
    fallbackReason: reason,
    rows
  };

  logDebug('controllable-costs', 'Controllable costs fallback file loaded.', {
    source: 'excel',
    fileName: payload.fileName,
    rowCount: rows.length,
    duration: formatDuration(stopTimer())
  });

  return payload;
}

export async function readControllableCostsData() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig();

  logDebug('controllable-costs', 'Starting controllable costs data load.', {
    hasConnectionConfig: missing.length === 0,
    tableName: CONTROLLABLE_COSTS_TABLE_NAME
  });

  if (missing.length > 0) {
    logDebug(
      'controllable-costs',
      'Controllable costs data load is missing SQL configuration; using fallback.',
      { missing }
    );

    return readFallbackControllableCostsData(
      `Missing database environment variables: ${missing.join(', ')}`
    );
  }

  try {
    const pool = await getPool(config);
    const controllableCostsTableName = formatSqlIdentifier(CONTROLLABLE_COSTS_TABLE_NAME);
    const costCategoryKeyTableName = formatSqlIdentifier(COST_CATEGORY_KEY_TABLE_NAME);
    const costElementKeyTableName = formatSqlIdentifier(COST_ELEMENT_KEY_TABLE_NAME);

    logDebug('controllable-costs', 'Executing controllable costs SQL query.', {
      controllableCostsTableName,
      costCategoryKeyTableName,
      costElementKeyTableName
    });

    const result = await pool.request().query(`
      SELECT
        costs.[Cost Category],
        costs.[Address],
        costs.[Cost Element],
        costs.[Cost Element Description],
        costs.[Cost],
        costs.[Quarter],
        costs.[Year],
        COALESCE(elementMatch.[Controllable], categoryMatch.[Controllable]) AS [Resolved Controllable]
      FROM ${controllableCostsTableName} AS costs
      OUTER APPLY (
        SELECT TOP 1
          elementKey.[Controllable]
        FROM ${costElementKeyTableName} AS elementKey
        WHERE elementKey.[Cost Element] = costs.[Cost Element]
        ORDER BY
          CASE
            WHEN elementKey.[Cost Category] = costs.[Cost Category]
             AND elementKey.[Cost Element Description] = costs.[Cost Element Description] THEN 0
            WHEN elementKey.[Cost Category] = costs.[Cost Category] THEN 1
            WHEN elementKey.[Cost Element Description] = costs.[Cost Element Description] THEN 2
            ELSE 3
          END
      ) AS elementMatch
      LEFT JOIN ${costCategoryKeyTableName} AS categoryMatch
        ON categoryMatch.[Cost Category] = costs.[Cost Category]
      ORDER BY
        costs.[Year] ASC,
        costs.[Quarter] ASC,
        costs.[Address] ASC,
        costs.[Cost Element Description] ASC;
    `);
    const rows = result.recordset.map(normalizeControllableCostsRow);

    logDebug('controllable-costs', 'Controllable costs SQL query completed.', {
      source: 'mssql',
      tableName: CONTROLLABLE_COSTS_TABLE_NAME,
      rowCount: rows.length,
      duration: formatDuration(stopTimer())
    });

    return {
      source: 'mssql',
      tableName: CONTROLLABLE_COSTS_TABLE_NAME,
      rowCount: rows.length,
      rows
    };
  } catch (error) {
    logError('controllable-costs', 'Controllable costs SQL query failed; using fallback data.', error, {
      tableName: CONTROLLABLE_COSTS_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });

    return readFallbackControllableCostsData(`Database read failed: ${error.message}`);
  }
}
