import { executeDatabricksQuery } from './databricksQuery.js';

// Approved use: this fiscal month-end roster may only assign facilities to labor actuals.
// Do not import it for safety, headcount, identity, costs, or any other metric.
const INVALID_CITIES = new Set(['UNKNOWN CITY', 'UNKNOWN', 'N/A']);
// A bounded batch keeps each response below Databricks' 26 MB INLINE limit.
const MYID_BATCH_SIZE = 500;
const MAX_CONCURRENT_BATCHES = 3;
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

const monthKey = (myid, year, month) => JSON.stringify([normalizeId(myid), Number(year), Number(month)]);

function snapshotDate(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return { year, month, iso: `${match[1]}-${match[2]}-${match[3]}` };
}

function compareCandidates(left, right) {
  if (left.date !== right.date) return left.date > right.date ? 1 : -1;
  if (left.standard !== right.standard) return Number(left.standard) - Number(right.standard);
  return left.workerId.localeCompare(right.workerId, undefined, { numeric: true });
}

export function buildLaborRosterLookup(rows, { includeDivision = false } = {}) {
  const candidates = new Map();
  const causes = new Map();
  const required = ['myid', 'city', 'state', 'sector', 'effective_date', 'is_standard_headcount', 'worker_id'];
  if (includeDivision) required.push('division');
  for (const row of rows) {
    if (required.some((field) => !Object.hasOwn(row, field))) {
      throw new Error('Databricks labor roster is missing required MyID, location, sector, or fiscal snapshot fields.');
    }
    const id = normalizeId(row.myid);
    const date = snapshotDate(row.effective_date);
    if (!id || !date) continue;
    if (!normalizeId(row.sector).includes('DEFENSE')) {
      if (includeDivision) causes.set(monthKey(id, date.year, date.month), 'No Defense sector roster row');
      continue;
    }
    const city = normalizeText(row.city);
    const state = normalizeText(row.state);
    const candidate = {
      city, state,
      division: normalizeText(row.division),
      facilityKey: JSON.stringify([city.toUpperCase(), state.toUpperCase()]),
      date: date.iso,
      standard: ['1', 'TRUE', 'Y', 'YES'].includes(normalizeId(row.is_standard_headcount)),
      workerId: normalizeId(row.worker_id)
    };
    const key = monthKey(id, date.year, date.month);
    const previous = candidates.get(key);
    const comparison = previous ? compareCandidates(candidate, previous.best) : 1;
    if (comparison > 0) candidates.set(key, { best: candidate, conflict: false, divisionConflict: false });
    else if (comparison === 0) {
      if (candidate.facilityKey !== previous.best.facilityKey) previous.conflict = true;
      if (normalizeId(candidate.division) !== normalizeId(previous.best.division)) previous.divisionConflict = true;
    }
  }

  const lookup = new Map();
  // Diagnostic division coverage is independent of whether the location is usable.
  if (includeDivision) {
    lookup.unmappedCauses = causes;
    lookup.invalidCities = new Map();
  }
  if (includeDivision) lookup.divisions = new Map();
  for (const [key, { best, conflict, divisionConflict }] of candidates) {
    if (includeDivision && !divisionConflict && best.division) lookup.divisions.set(key, best.division);
    if (includeDivision) {
      if (conflict) causes.set(key, 'Conflicting locations on tied roster rows');
      else if (!best.city || INVALID_CITIES.has(best.city.toUpperCase())) {
        causes.set(key, 'Missing or invalid roster city');
        lookup.invalidCities.set(key, best.city || '(blank)');
      }
      else causes.delete(key);
    }
    if (!conflict && best.city && !INVALID_CITIES.has(best.city.toUpperCase())) {
      lookup.set(key, { city: best.city, state: best.state, facilityKey: best.facilityKey, snapshotDate: best.date });
    }
  }
  if (includeDivision) lookup.divisionDiagnostics = {
    rows: rows.filter(row => normalizeId(row.sector).includes('DEFENSE')).length,
    populated: rows.filter(row => normalizeId(row.sector).includes('DEFENSE') && normalizeText(row.division)).length,
    resolved: lookup.divisions.size
  };
  return lookup;
}

export async function readLaborRosterLookup(config = getLaborRosterConfig(), laborRows = [], { includeDivision = false, allMonths = false } = {}) {
  try {
    const ids = [...new Set(laborRows.map((row) => normalizeId(row.my_id)).filter(Boolean))];
    let firstPeriod = Infinity;
    let lastPeriod = -Infinity;
    for (const row of laborRows) {
      const period = Number(row.year) * 100 + Number(row.month);
      if (!Number.isInteger(period)) continue;
      firstPeriod = Math.min(firstPeriod, period);
      lastPeriod = Math.max(lastPeriod, period);
    }
    if (!ids.length || !Number.isFinite(firstPeriod)) return new Map();
    const batches = [];
    for (let index = 0; index < ids.length; index += MYID_BATCH_SIZE) {
      batches.push(ids.slice(index, index + MYID_BATCH_SIZE));
    }
    const rows = [];
    for (let index = 0; index < batches.length; index += MAX_CONCURRENT_BATCHES) {
      const results = await Promise.all(batches.slice(index, index + MAX_CONCURRENT_BATCHES).map((batch) =>
        executeDatabricksQuery({
      scope: 'labor-roster',
      tableName: 'configured Databricks labor roster',
      query: `
        -- Return only the most relevant Defense snapshot for each MyID/month.
        -- DENSE_RANK retains tied locations so the app can leave conflicts unmapped.
        WITH ranked AS (
          SELECT
            CAST(\`myid\` AS STRING) AS myid,
            TRIM(CAST(\`work_city\` AS STRING)) AS city,
            TRIM(CAST(\`work_state_code\` AS STRING)) AS state,
            CAST(\`org_structure_lvl2\` AS STRING) AS sector,
            ${includeDivision ? 'CAST(`org_structure_lvl3` AS STRING) AS division,' : ''}
            CAST(\`effective_date\` AS STRING) AS effective_date,
            CAST(\`is_standard_headcount\` AS STRING) AS is_standard_headcount,
            CAST(\`worker_id\` AS STRING) AS worker_id,
            DENSE_RANK() OVER (
              PARTITION BY UPPER(TRIM(CAST(\`myid\` AS STRING))),
                YEAR(\`effective_date\`), MONTH(\`effective_date\`)
              ORDER BY ${includeDivision ? "CASE WHEN UPPER(CAST(`org_structure_lvl2` AS STRING)) LIKE '%DEFENSE%' THEN 0 ELSE 1 END," : ''} \`effective_date\` DESC,
                \`is_standard_headcount\` DESC, \`worker_id\` DESC
            ) AS roster_rank
          FROM ${config.tableSql}
          WHERE \`effective_date\` IS NOT NULL
            ${includeDivision ? '' : "AND UPPER(CAST(`org_structure_lvl2` AS STRING)) LIKE '%DEFENSE%'"}
            AND UPPER(TRIM(CAST(\`myid\` AS STRING))) IN (
              ${batch.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ')}
            )
            ${allMonths ? '' : `AND YEAR(effective_date) * 100 + MONTH(effective_date) BETWEEN ${firstPeriod} AND ${lastPeriod}`}
        )
        SELECT myid, city, state, sector, effective_date, is_standard_headcount, worker_id${includeDivision ? ', division' : ''}
        FROM ranked
        WHERE roster_rank = 1
      `
        })
      ));
      for (const result of results) {
        for (const row of result) rows.push(row);
      }
    }
    return buildLaborRosterLookup(rows, { includeDivision });
  } catch (error) {
    const failure = new Error(`Unable to load the configured Databricks labor roster: ${error.message}`, { cause: error });
    failure.code = 'LABOR_ROSTER_UNAVAILABLE';
    throw failure;
  }
}

export function lookupMonthlyLaborFacility(row, rosterLookup) {
  return rosterLookup.get(monthKey(row.my_id, row.year, row.month));
}

export function joinLaborFacilities(laborRows, rosterLookup) {
  const totals = new Map();
  for (const row of laborRows) {
    // A fiscal month-end snapshot belongs only to that labor month. Do not carry
    // today's location backward or substitute an adjacent month's facility.
    const facility = lookupMonthlyLaborFacility(row, rosterLookup);
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

