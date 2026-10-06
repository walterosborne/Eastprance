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

const FACILITY_GROUPINGS_TABLE_NAME = 'qmi.facilitygroupings';
const FACILITY_GROUPINGS_CACHE_TTL_MS = 5 * 60 * 1000;

const FACILITY_FIELDS_BY_SCOPE = {
  'controllable-costs': ['address'],
  'controllable-costs-new': ['facility', 'address'],
  'controllable-costs-hana': ['facility'],
  sif: ['site'],
  'potential-sif': ['site'],
  nmfr: ['site'],
  otd: ['site'],
  labor: ['forecasted_cc', 'site'],
  'labor-new': ['facility'],
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
  const { config, missing } = getConnectionConfig();

  if (missing.length > 0) {
    throw new Error(
      `Cannot load facility groupings without database configuration: ${missing.join(', ')}`
    );
  }

  const pool = await getPool(config);
  const tableName = formatSqlIdentifier(FACILITY_GROUPINGS_TABLE_NAME, config);

  try {
    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(COALESCE(
          TRY_CONVERT(nvarchar(4000), source.[Original]),
          ''
        ))) AS [original],
        LTRIM(RTRIM(COALESCE(
          TRY_CONVERT(nvarchar(4000), source.[Group]),
          ''
        ))) AS [group]
      FROM ${tableName} AS source
      WHERE NULLIF(LTRIM(RTRIM(COALESCE(
              TRY_CONVERT(nvarchar(4000), source.[Original]),
              ''
            ))), '') IS NOT NULL
        AND NULLIF(LTRIM(RTRIM(COALESCE(
              TRY_CONVERT(nvarchar(4000), source.[Group]),
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
      rowCount: result.recordset.length,
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
    source: 'mssql',
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
