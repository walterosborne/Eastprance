import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import { executeDatabricksQuery } from './databricksQuery.js';

const BU_GROUPINGS_TABLE_NAME = 'integrated_operations_dev.analytics.bugroupings';
const BUSINESS_UNITS_TABLE_NAME = 'integrated_operations_dev.analytics.businessunits';
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
  'labor-databricks': ['business_unit'],
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
  try {
    const rows = await executeDatabricksQuery({
      scope: 'bu-groupings',
      tableName: BU_GROUPINGS_TABLE_NAME,
      query: `
        SELECT
          TRIM(COALESCE(CAST(source.\`Original\` AS STRING), '')) AS original,
          TRIM(COALESCE(CAST(businessUnit.\`Name\` AS STRING), '')) AS \`group\`,
          0 AS is_canonical
        FROM \`integrated_operations_dev\`.\`analytics\`.\`bugroupings\` AS source
        INNER JOIN \`integrated_operations_dev\`.\`analytics\`.\`businessunits\` AS businessUnit
          ON businessUnit.\`Id\` = source.\`BusinessUnitId\`
        WHERE NULLIF(TRIM(CAST(source.\`Original\` AS STRING)), '') IS NOT NULL
          AND NULLIF(TRIM(CAST(businessUnit.\`Name\` AS STRING)), '') IS NOT NULL
        UNION ALL
        SELECT
          TRIM(CAST(businessUnit.\`Name\` AS STRING)) AS original,
          TRIM(CAST(businessUnit.\`Name\` AS STRING)) AS \`group\`,
          1 AS is_canonical
        FROM \`integrated_operations_dev\`.\`analytics\`.\`businessunits\` AS businessUnit
        WHERE NULLIF(TRIM(CAST(businessUnit.\`Name\` AS STRING)), '') IS NOT NULL
      `
    });

    // Canonical names are valid source values even without an alias mapping.
    const isCanonical = (row) => row.is_canonical === true || Number(row.is_canonical) === 1;
    const canonicalKeys = new Set(rows.filter(isCanonical)
      .map((row) => normalizeLookupKey(row.original)));
    const lookup = new Map();
    const entries = [];
    let duplicateCount = 0;

    rows.forEach((row) => {
      const original = normalizeText(row.original);
      const group = normalizeText(row.group);
      const key = normalizeLookupKey(original);

      if (!key || !group || (!isCanonical(row) && canonicalKeys.has(key))) {
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
      rowCount: rows.length,
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
    source: 'databricks',
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

      if (groupedRow === row) {
        groupedRow = { ...row };
      }

      if (!rememberedOriginal) {
        rememberedOriginal = original;
        groupedRow.__business_unit_original = original;
      }

      const groupedBusinessUnit = lookup.get(normalizeLookupKey(original));
      groupedRow.__business_unit_mapped = Boolean(groupedBusinessUnit);

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

