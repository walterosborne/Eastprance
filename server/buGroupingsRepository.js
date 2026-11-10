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

const BU_GROUPINGS_TABLE_NAME = 'qmi.bugroupings';
const BUSINESS_UNITS_TABLE_NAME = 'qmi.businessunits';
const BU_GROUPINGS_CACHE_TTL_MS = 5 * 60 * 1000;

const BU_FIELDS_BY_SCOPE = {
  'controllable-costs-new': ['business_unit'],
  'controllable-costs-hana': ['business_unit'],
  'controllable-costs-databricks': ['business_unit'],
  'controllable-costs-databricks-raw': ['business_unit'],
  'controllable-costs-databricks-new': ['business_unit'],
  otd: ['business_unit'],
  'customer-escapes': ['business_unit'],
  'labor-new': ['business_unit'],
  'labor-hana': ['business_unit']
};

let cachedBuGroupings = null;
let buGroupingsLoadPromise = null;

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLookupKey(value) {
  return normalizeText(value).toLowerCase();
}

function buildHierarchy(entries) {
  const groupsByKey = new Map();

  entries.forEach(({ original, group }) => {
    const groupKey = normalizeLookupKey(group);
    const existingGroup = groupsByKey.get(groupKey) ?? {
      group,
      originals: []
    };

    existingGroup.originals.push(original);
    groupsByKey.set(groupKey, existingGroup);
  });

  return [...groupsByKey.values()]
    .map((groupEntry) => ({
      ...groupEntry,
      originals: [...new Set(groupEntry.originals)]
        .sort((left, right) => left.localeCompare(right))
    }))
    .sort((left, right) => left.group.localeCompare(right.group));
}

async function loadBuGroupings() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig();

  if (missing.length > 0) {
    throw new Error(
      `Cannot load business unit groupings without database configuration: ${missing.join(', ')}`
    );
  }

  const pool = await getPool(config);
  const tableName = formatSqlIdentifier(BU_GROUPINGS_TABLE_NAME, config);
  const businessUnitsTableName = formatSqlIdentifier(BUSINESS_UNITS_TABLE_NAME, config);

  try {
    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(COALESCE(
          TRY_CONVERT(nvarchar(4000), source.[Original]),
          ''
        ))) AS [original],
        LTRIM(RTRIM(COALESCE(
          TRY_CONVERT(nvarchar(4000), businessUnit.[Name]),
          ''
        ))) AS [group]
      FROM ${tableName} AS source
      INNER JOIN ${businessUnitsTableName} AS businessUnit
        ON businessUnit.[Id] = source.[BusinessUnitId]
      WHERE NULLIF(LTRIM(RTRIM(COALESCE(
              TRY_CONVERT(nvarchar(4000), source.[Original]),
              ''
            ))), '') IS NOT NULL
        AND NULLIF(LTRIM(RTRIM(COALESCE(
              TRY_CONVERT(nvarchar(4000), businessUnit.[Name]),
              ''
            ))), '') IS NOT NULL;
    `);

    const lookup = new Map();
    const entries = [];
    let duplicateCount = 0;

    result.recordset.forEach((row) => {
      const original = normalizeText(row.original);
      const group = normalizeText(row.group);
      const key = normalizeLookupKey(original);

      if (!key || !group) {
        return;
      }

      const existingGroup = lookup.get(key);

      if (existingGroup) {
        duplicateCount += 1;

        if (normalizeLookupKey(existingGroup) !== normalizeLookupKey(group)) {
          throw new Error(
            'Business unit mappings contain conflicting real BUs for one Original value.'
          );
        }

        return;
      }

      lookup.set(key, group);
      entries.push({ original, group });
    });

    const groups = buildHierarchy(entries);
    const payload = {
      lookup,
      entries,
      groups,
      rowCount: result.recordset.length,
      mappedBusinessUnitCount: lookup.size,
      groupCount: groups.length,
      duplicateCount,
      loadedAt: Date.now()
    };

    logDebug('bu-groupings', 'Business unit groupings loaded.', {
      tableName: BU_GROUPINGS_TABLE_NAME,
      businessUnitTableName: BUSINESS_UNITS_TABLE_NAME,
      rowCount: payload.rowCount,
      mappedBusinessUnitCount: payload.mappedBusinessUnitCount,
      groupCount: payload.groupCount,
      duplicateCount,
      duration: formatDuration(stopTimer())
    });

    return payload;
  } catch (error) {
    logError('bu-groupings', 'Unable to load business unit groupings.', error, {
      tableName: BU_GROUPINGS_TABLE_NAME,
      businessUnitTableName: BUSINESS_UNITS_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}

async function getBuGroupings() {
  const cacheIsFresh = cachedBuGroupings
    && Date.now() - cachedBuGroupings.loadedAt < BU_GROUPINGS_CACHE_TTL_MS;

  if (cacheIsFresh) {
    return cachedBuGroupings;
  }

  if (!buGroupingsLoadPromise) {
    buGroupingsLoadPromise = loadBuGroupings()
      .then((payload) => {
        cachedBuGroupings = payload;
        return payload;
      })
      .finally(() => {
        buGroupingsLoadPromise = null;
      });
  }

  return buGroupingsLoadPromise;
}

export async function readBuGroupingTitles() {
  const payload = await getBuGroupings();

  return {
    source: 'mssql',
    tableName: BU_GROUPINGS_TABLE_NAME,
    businessUnitTableName: BUSINESS_UNITS_TABLE_NAME,
    rowCount: payload.rowCount,
    mappedBusinessUnitCount: payload.mappedBusinessUnitCount,
    groupCount: payload.groupCount,
    duplicateCount: payload.duplicateCount,
    groups: payload.groups
  };
}

export async function applyBuGroupingsToPayload(payload, scope) {
  const businessUnitFields = BU_FIELDS_BY_SCOPE[scope] ?? [];

  if (!payload || !Array.isArray(payload.rows) || businessUnitFields.length === 0) {
    return payload;
  }

  let lookup;
  try {
    ({ lookup } = await getBuGroupings());
  } catch (error) {
    logError('bu-groupings', 'BU groupings unavailable; retaining source BU labels.', error, { scope });
    return { ...payload, businessUnitGroupingWarning: 'BU groupings unavailable.' };
  }
  let mappedValueCount = 0;
  const unmatchedBusinessUnits = new Set();

  const rows = payload.rows.map((row) => {
    let groupedRow = row;
    let rememberedOriginal = normalizeText(row.__business_unit_original);

    businessUnitFields.forEach((fieldName) => {
      if (!Object.prototype.hasOwnProperty.call(row, fieldName)) {
        return;
      }

      const original = normalizeText(row[fieldName]);

      if (!original) {
        return;
      }

      if (groupedRow === row) {
        groupedRow = { ...row };
      }

      if (!rememberedOriginal) {
        rememberedOriginal = original;
        groupedRow.__business_unit_original = original;
      }

      const groupedBusinessUnit = lookup.get(normalizeLookupKey(original));

      if (!groupedBusinessUnit) {
        unmatchedBusinessUnits.add(original);
        return;
      }

      groupedRow[fieldName] = groupedBusinessUnit;
      groupedRow.__business_unit_group = groupedBusinessUnit;
      mappedValueCount += 1;
    });

    return groupedRow;
  });

  logDebug('bu-groupings', 'Applied business unit groupings to dataset.', {
    scope,
    rowCount: rows.length,
    mappedValueCount,
    unmatchedBusinessUnitCount: unmatchedBusinessUnits.size
  });

  return {
    ...payload,
    rows
  };
}
