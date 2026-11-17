import { executeDatabricksQuery } from './databricksQuery.js';

const INVALID_CITIES = new Set(['UNKNOWN CITY', 'UNKNOWN', 'N/A']);
const normalizeText = (value) => String(value ?? '').trim();
const normalizeId = (value) => normalizeText(value).toUpperCase();

export function getLaborRosterConfig(env = process.env) {
  const names = ['DATABRICKS_LABOR_ROSTER_CATALOG', 'DATABRICKS_LABOR_ROSTER_SCHEMA', 'DATABRICKS_LABOR_ROSTER_TABLE'];
  const values = names.map((name) => normalizeText(env[name]));
  const missing = names.filter((_name, index) => !values[index]);
  if (missing.length) {
    throw new Error(`Missing labor roster environment variables: ${missing.join(', ')}`);
  }
  values.forEach((value, index) => {
    if (/[\x00-\x1f\x7f]/.test(value)) {
      throw new Error(`Invalid identifier in ${names[index]}.`);
    }
  });
  // Quote each identifier separately; configuration is never interpolated as SQL syntax.
  return { tableSql: values.map((value) => '`' + value.replace(/`/g, '``') + '`').join('.') };
}

export function buildLaborRosterLookup(rows) {
  const lookup = new Map();
  const conflictingIds = new Set();
  const required = ['myid', 'city', 'state', 'sector'];
  for (const row of rows) {
    if (required.some((field) => !Object.hasOwn(row, field))) {
      throw new Error('Databricks labor roster is missing required MyID, city, state, or sector columns.');
    }
    const city = normalizeText(row.city);
    const state = normalizeText(row.state);
    if (!normalizeId(row.sector).includes('DEFENSE') || !city || INVALID_CITIES.has(city.toUpperCase())) {
      continue;
    }
    const facilityKey = JSON.stringify([city.toUpperCase(), state.toUpperCase()]);
    const id = normalizeId(row.myid);
    if (!id || conflictingIds.has(id)) continue;
    const existing = lookup.get(id);
    if (existing && existing.facilityKey !== facilityKey) {
      lookup.delete(id);
      conflictingIds.add(id);
    } else if (!existing) {
      lookup.set(id, { city, state, facilityKey });
    }
  }
  return lookup;
}

export async function readLaborRosterLookup(config = getLaborRosterConfig()) {
  try {
    const rows = await executeDatabricksQuery({
      scope: 'labor-roster',
      tableName: 'configured Databricks labor roster',
      query: `
        SELECT
          CAST(\`myid\` AS STRING) AS myid,
          TRIM(CAST(\`work_city\` AS STRING)) AS city,
          TRIM(CAST(\`work_state_code\` AS STRING)) AS state,
          CAST(\`org_structure_lvl2\` AS STRING) AS sector
        FROM ${config.tableSql}
        WHERE \`effective_date\` = (SELECT MAX(\`effective_date\`) FROM ${config.tableSql})
          AND UPPER(CAST(\`org_structure_lvl2\` AS STRING)) LIKE '%DEFENSE%'
          AND NULLIF(TRIM(CAST(\`work_city\` AS STRING)), '') IS NOT NULL
          AND UPPER(TRIM(CAST(\`work_city\` AS STRING))) NOT IN ('UNKNOWN CITY', 'UNKNOWN', 'N/A')
      `
    });
    return buildLaborRosterLookup(rows);
  } catch (error) {
    const failure = new Error(`Unable to load the configured Databricks labor roster: ${error.message}`, { cause: error });
    failure.code = 'LABOR_ROSTER_UNAVAILABLE';
    throw failure;
  }
}

export function joinLaborFacilities(laborRows, rosterLookup) {
  const totals = new Map();
  for (const row of laborRows) {
    const facility = rosterLookup.get(normalizeId(row.my_id));
    const result = {
      year: row.year,
      month: row.month,
      division: row.division,
      business_unit: row.business_unit,
      cost_center: row.cost_center,
      facility: facility?.city ?? '',
      facility_state: facility?.state ?? '',
      labor_category: row.labor_category
    };
    const key = JSON.stringify(Object.values(result));
    const hours = row.entered_hours == null ? NaN : Number(row.entered_hours);
    if (!Number.isFinite(hours)) throw new Error('Invalid labor hours returned by the DBM query.');
    const existing = totals.get(key);
    if (existing) existing.entered_hours += hours;
    else totals.set(key, { ...result, entered_hours: hours });
  }
  // Return the original facility-level shape; employee identifiers stay on the server.
  return [...totals.values()].map((row) => ({ ...row, entered_hours: Number(row.entered_hours.toFixed(2)) }));
}
