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
import { CONTROLLABLE_COSTS_NEW_DBM_QUERY } from './dbmQueries/controllableCostsNewQuery.js';
import {
  formatSqlIdentifier,
  getConnectionConfig,
  getPool
} from './sqlConnection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTROLLABLE_COSTS_NEW_FILE_PATH = path.resolve(__dirname, '../data/cost.xlsx');
const COST_ELEMENT_KEY_TABLE_NAME = 'cost_element_key';
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

function normalizeCostElementIdentifier(value) {
  const normalizedValue = normalizeText(value);
  const numericMatch = /^(\d+)(?:\.0+)?$/.exec(normalizedValue);

  if (numericMatch) {
    try {
      return BigInt(numericMatch[1]).toString();
    } catch {
      // Fall through to text comparison for identifiers outside BigInt's accepted format.
    }
  }

  return normalizedValue.toUpperCase();
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

function normalizeMatchText(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeKeyControllability(value) {
  return normalizeMatchText(value) === 'controllable'
    ? 'Controllable'
    : 'Uncontrollable';
}

function getCostElementMatchRank(costRow, keyRow) {
  const costCategoryMatches =
    normalizeMatchText(keyRow.costCategory) === normalizeMatchText(costRow.cost_category);
  const descriptionMatches =
    normalizeMatchText(keyRow.costElementDescription)
      === normalizeMatchText(costRow.cost_element_description);

  if (costCategoryMatches && descriptionMatches) {
    return 0;
  }

  if (costCategoryMatches) {
    return 1;
  }

  if (descriptionMatches) {
    return 2;
  }

  return 3;
}

function resolveCostElementKey(costRow, costElementKeysByIdentifier) {
  const identifier = normalizeCostElementIdentifier(costRow.gl_account_cost_element);
  const candidates = costElementKeysByIdentifier.get(identifier) ?? [];

  return candidates.reduce((bestMatch, candidate) => {
    if (!bestMatch) {
      return candidate;
    }

    return getCostElementMatchRank(costRow, candidate)
      < getCostElementMatchRank(costRow, bestMatch)
      ? candidate
      : bestMatch;
  }, null);
}

async function readCostElementKeys() {
  const { config, missing } = getConnectionConfig();

  if (missing.length > 0) {
    throw new Error(
      `Cannot filter new controllable costs without database configuration: ${missing.join(', ')}`
    );
  }

  const pool = await getPool(config);
  const costElementKeyTableName = formatSqlIdentifier(COST_ELEMENT_KEY_TABLE_NAME, config);

  logDebug('controllable-costs-new', 'Loading cost element keys for the new cost dataset.', {
    tableName: costElementKeyTableName
  });

  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Cost Category] AS nvarchar(4000)), '')))
        AS [Cost Category],
      LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Cost Element] AS nvarchar(4000)), '')))
        AS [Cost Element],
      LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Cost Element Description] AS nvarchar(4000)), '')))
        AS [Cost Element Description],
      LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Controllable] AS nvarchar(255)), '')))
        AS [Controllable]
    FROM ${costElementKeyTableName} AS source
    WHERE NULLIF(
      LTRIM(RTRIM(COALESCE(TRY_CAST(source.[Cost Element] AS nvarchar(4000)), ''))),
      ''
    ) IS NOT NULL;
  `);
  const rows = result.recordset.map((row) => ({
    costCategory: normalizeText(row['Cost Category']),
    costElement: normalizeCostElementIdentifier(row['Cost Element']),
    costElementDescription: normalizeText(row['Cost Element Description']),
    controllable: normalizeKeyControllability(row.Controllable)
  }));
  const valuesByIdentifier = rows.reduce((lookup, row) => {
    const currentRows = lookup.get(row.costElement) ?? [];

    currentRows.push(row);
    lookup.set(row.costElement, currentRows);
    return lookup;
  }, new Map());

  logDebug('controllable-costs-new', 'Cost element keys loaded.', {
    tableName: costElementKeyTableName,
    costElementKeyRowCount: rows.length,
    costElementCount: valuesByIdentifier.size
  });

  return {
    tableName: costElementKeyTableName,
    rowCount: rows.length,
    valuesByIdentifier
  };
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
    controllable: null
  };
}

async function buildControllableCostsNewPipelineData(sourceRows, metadata) {
  const availableColumns = new Set(Object.keys(sourceRows[0] ?? {}).map(normalizeHeader));
  const missingColumns = REQUIRED_COLUMNS.filter(
    (columnName) => !availableColumns.has(columnName)
  );

  if (sourceRows.length > 0 && missingColumns.length > 0) {
    throw new Error(
      `${metadata.sourceLabel} is missing required columns: ${missingColumns.join(', ')}`
    );
  }

  const normalizedRows = sourceRows.map(normalizeControllableCostsNewRow).filter(Boolean);
  const costElementKeys = await readCostElementKeys();
  const rows = [];
  const excludedRows = [];
  const selectedKeyMatches = [];

  normalizedRows.forEach((row) => {
    const matchedKey = resolveCostElementKey(row, costElementKeys.valuesByIdentifier);

    if (!matchedKey) {
      excludedRows.push(row);
      return;
    }

    const classifiedRow = {
      ...row,
      controllable: matchedKey.controllable
    };

    rows.push(classifiedRow);
    selectedKeyMatches.push({
      row: classifiedRow,
      selectedKey: {
        costCategory: matchedKey.costCategory,
        costElement: matchedKey.costElement,
        costElementDescription: matchedKey.costElementDescription,
        controllable: matchedKey.controllable
      }
    });
  });

  return {
    source: metadata.source,
    fileName: metadata.fileName ?? null,
    sheetName: metadata.sheetName ?? null,
    queryFile: metadata.queryFile ?? null,
    tableName: metadata.tableName ?? null,
    sourceRows,
    normalizedRows,
    rows,
    excludedRows,
    selectedKeyMatches,
    costElementKeys
  };
}

export async function readControllableCostsNewExcelPipelineData() {
  await fs.access(CONTROLLABLE_COSTS_NEW_FILE_PATH);

  const workbook = XLSX.readFile(CONTROLLABLE_COSTS_NEW_FILE_PATH, { cellDates: false });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('The new controllable costs workbook does not contain a worksheet.');
  }

  const sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: null,
    raw: true
  });

  return buildControllableCostsNewPipelineData(sourceRows, {
    source: 'excel',
    sourceLabel: 'The new controllable costs workbook',
    fileName: path.basename(CONTROLLABLE_COSTS_NEW_FILE_PATH),
    sheetName
  });
}

async function readControllableCostsNewDbmPipelineData(config) {
  const pool = await getPool(config, 'dbm');

  logDebug('controllable-costs-new', 'Executing DBM controllable costs query.', {
    server: config.server,
    database: config.database,
    querySource: 'embedded-server-query'
  });

  const result = await pool.request().query(CONTROLLABLE_COSTS_NEW_DBM_QUERY);

  return buildControllableCostsNewPipelineData(result.recordset, {
    source: 'dbm-sql',
    sourceLabel: 'The DBM controllable costs query',
    tableName: 'src.rb_CVG_Transaction_Details_03'
  });
}

function buildControllableCostsNewPayload(pipeline, fallbackReason = null) {
  const {
    source,
    fileName,
    sheetName,
    queryFile,
    tableName,
    sourceRows,
    normalizedRows,
    rows,
    excludedRows,
    costElementKeys
  } = pipeline;
  const years = Array.from(new Set(rows.map((row) => row.year)).values()).sort(
    (left, right) => left - right
  );
  const totalCost = Number(rows.reduce((sum, row) => sum + row.cost, 0).toFixed(2));
  const controllableRowCount = rows.filter(
    (row) => row.controllable === 'Controllable'
  ).length;
  const uncontrollableRowCount = rows.length - controllableRowCount;

  return {
    source: fallbackReason ? 'excel-fallback' : source,
    fileName,
    sheetName,
    queryFile,
    tableName,
    fallbackReason,
    sourceRowCount: sourceRows.length,
    rowCount: rows.length,
    invalidRowCount: sourceRows.length - normalizedRows.length,
    excludedByCostElementKeyCount: excludedRows.length,
    costElementKeyTableName: costElementKeys.tableName,
    costElementKeyRowCount: costElementKeys.rowCount,
    validCostElementCount: costElementKeys.valuesByIdentifier.size,
    years,
    totalCost,
    controllableRowCount,
    uncontrollableRowCount,
    rows
  };
}

function logControllableCostsNewPayload(payload, stopTimer) {
  logDebug('controllable-costs-new', 'New controllable costs dataset loaded.', {
    source: payload.source,
    fallbackReason: payload.fallbackReason,
    fileName: payload.fileName,
    sheetName: payload.sheetName,
    queryFile: payload.queryFile,
    tableName: payload.tableName,
    sourceRowCount: payload.sourceRowCount,
    rowCount: payload.rowCount,
    invalidRowCount: payload.invalidRowCount,
    excludedByCostElementKeyCount: payload.excludedByCostElementKeyCount,
    costElementKeyRowCount: payload.costElementKeyRowCount,
    validCostElementCount: payload.validCostElementCount,
    costElementKeyTableName: payload.costElementKeyTableName,
    years: payload.years,
    totalCost: payload.totalCost,
    controllableRowCount: payload.controllableRowCount,
    uncontrollableRowCount: payload.uncontrollableRowCount,
    duration: formatDuration(stopTimer())
  });
}

async function readControllableCostsNewExcelFallback(fallbackReason, stopTimer) {
  logDebug('controllable-costs-new', 'Loading Excel fallback for new controllable costs.', {
    source: 'excel-fallback',
    filePath: CONTROLLABLE_COSTS_NEW_FILE_PATH,
    fallbackReason
  });

  try {
    const pipeline = await readControllableCostsNewExcelPipelineData();
    const payload = buildControllableCostsNewPayload(pipeline, fallbackReason);

    logControllableCostsNewPayload(payload, stopTimer);
    return payload;
  } catch (error) {
    const normalizedError = error?.code === 'ENOENT'
      ? new Error(`New controllable costs workbook not found at ${CONTROLLABLE_COSTS_NEW_FILE_PATH}.`)
      : error;

    logError(
      'controllable-costs-new',
      'Unable to load new controllable costs Excel fallback.',
      normalizedError,
      {
        filePath: CONTROLLABLE_COSTS_NEW_FILE_PATH,
        fallbackReason,
        duration: formatDuration(stopTimer())
      }
    );
    throw normalizedError;
  }
}

export async function readControllableCostsNewData() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig('dbm');

  if (missing.length > 0) {
    const fallbackReason = `Missing DBM environment variables: ${missing.join(', ')}`;

    logDebug('controllable-costs-new', 'DBM configuration is incomplete; using Excel fallback.', {
      source: 'excel-fallback',
      fallbackReason
    });
    return readControllableCostsNewExcelFallback(fallbackReason, stopTimer);
  }

  try {
    const pipeline = await readControllableCostsNewDbmPipelineData(config);
    const payload = buildControllableCostsNewPayload(pipeline);

    logControllableCostsNewPayload(payload, stopTimer);
    return payload;
  } catch (error) {
    const fallbackReason = 'DBM controllable costs query failed; Excel fallback used.';

    logError(
      'controllable-costs-new',
      'DBM controllable costs load failed; using Excel fallback.',
      error,
      {
        server: config.server,
        database: config.database,
        source: 'excel-fallback',
        fallbackReason
      }
    );
    return readControllableCostsNewExcelFallback(fallbackReason, stopTimer);
  }
}
