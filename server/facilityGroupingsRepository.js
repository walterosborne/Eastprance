import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import { executeDatabricksQuery } from './databricksQuery.js';

const FACILITY_GROUPINGS_TABLE_NAME = 'integrated_operations_dev.analytics.facilitygroupings';
const FACILITY_GROUPINGS_CACHE_TTL_MS = 5 * 60 * 1000;

const FACILITY_FIELDS_BY_SCOPE = {
  'controllable-costs': ['address'],
  'controllable-costs-new': ['facility', 'address'],
  'controllable-costs-hana': ['facility'],
  'controllable-costs-databricks': ['facility'],
  'controllable-costs-databricks-raw': ['facility'],
  'controllable-costs-databricks-new': ['facility'],
  sif: ['site'],
  'potential-sif': ['site'],
  nmfr: ['site'],
  otd: ['site'],
  'customer-escapes': ['facility'],
  labor: ['forecasted_cc', 'site'],
  'labor-new': ['facility'],
  'labor-databricks': ['facility'],
  'labor-hana': ['forecasted_cc', 'site']
};

let cachedFacilityGroupings = null;
let facilityGroupingsLoadPromise = null;

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

async function loadFacilityGroupings() {
  const stopTimer = createTimer();
  try {
    const rows = await executeDatabricksQuery({
      scope: 'facility-groupings',
      tableName: FACILITY_GROUPINGS_TABLE_NAME,
      query: `
        SELECT
          TRIM(COALESCE(CAST(source.\`Original\` AS STRING), '')) AS original,
          TRIM(COALESCE(CAST(source.\`Group\` AS STRING), '')) AS \`group\`
        FROM \`integrated_operations_dev\`.\`analytics\`.\`facilitygroupings\` AS source
        WHERE NULLIF(TRIM(CAST(source.\`Original\` AS STRING)), '') IS NOT NULL
          AND NULLIF(TRIM(CAST(source.\`Group\` AS STRING)), '') IS NOT NULL
      `
    });

    const lookup = new Map();
    const entries = [];
    let duplicateCount = 0;

    rows.forEach((row) => {
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
            'Facility grouping table contains conflicting groups for one Original value.'
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
      mappedFacilityCount: lookup.size,
      groupCount: groups.length,
      duplicateCount,
      loadedAt: Date.now()
    };

    logDebug('facility-groupings', 'Facility groupings loaded.', {
      tableName: FACILITY_GROUPINGS_TABLE_NAME,
      rowCount: payload.rowCount,
      mappedFacilityCount: payload.mappedFacilityCount,
      groupCount: payload.groupCount,
      duplicateCount,
      duration: formatDuration(stopTimer())
    });

    return payload;
  } catch (error) {
    logError('facility-groupings', 'Unable to load facility groupings.', error, {
      tableName: FACILITY_GROUPINGS_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}

async function getFacilityGroupings() {
  const cacheIsFresh = cachedFacilityGroupings
    && Date.now() - cachedFacilityGroupings.loadedAt < FACILITY_GROUPINGS_CACHE_TTL_MS;

  if (cacheIsFresh) {
    return cachedFacilityGroupings;
  }

  if (!facilityGroupingsLoadPromise) {
    facilityGroupingsLoadPromise = loadFacilityGroupings()
      .then((payload) => {
        cachedFacilityGroupings = payload;
        return payload;
      })
      .finally(() => {
        facilityGroupingsLoadPromise = null;
      });
  }

  return facilityGroupingsLoadPromise;
}

export async function readFacilityGroupingHierarchy() {
  const payload = await getFacilityGroupings();

  return {
    source: 'databricks',
    tableName: FACILITY_GROUPINGS_TABLE_NAME,
    rowCount: payload.rowCount,
    mappedFacilityCount: payload.mappedFacilityCount,
    groupCount: payload.groupCount,
    duplicateCount: payload.duplicateCount,
    groups: payload.groups
  };
}

export async function applyFacilityGroupingsToPayload(payload, scope) {
  const facilityFields = FACILITY_FIELDS_BY_SCOPE[scope] ?? [];

  if (!payload || !Array.isArray(payload.rows) || facilityFields.length === 0) {
    return payload;
  }

  const { lookup } = await getFacilityGroupings();
  let mappedValueCount = 0;
  const unmatchedFacilities = new Set();

  const rows = payload.rows.map((row) => {
    let groupedRow = row;
    let rememberedOriginal = normalizeText(row.__facility_original);

    facilityFields.forEach((fieldName) => {
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
        groupedRow.__facility_original = original;
      }

      const groupedFacility = lookup.get(normalizeLookupKey(original));

      if (!groupedFacility) {
        unmatchedFacilities.add(original);
        return;
      }

      groupedRow[fieldName] = groupedFacility;
      groupedRow.__facility_group = groupedFacility;
      mappedValueCount += 1;
    });

    return groupedRow;
  });

  logDebug('facility-groupings', 'Applied facility groupings to dataset.', {
    scope,
    rowCount: rows.length,
    mappedValueCount,
    unmatchedFacilityCount: unmatchedFacilities.size
  });

  return {
    ...payload,
    rows
  };
}

