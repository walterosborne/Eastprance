import XLSX from 'xlsx';
import { getConnectionConfig, getPool } from '../sqlConnection.js';
import { LABOR_UTILIZATION_NEW_DBM_QUERY } from '../dbmQueries/laborUtilizationNewQuery.js';
import {
  getLaborRosterConfig, readLaborRosterLookup, lookupMonthlyLaborFacility
} from '../laborRosterDatabricksRepository.js';

// Reproduce the former labor card's DefenseRoster and RosterByPerson rules.
// Only return resolved IDs that actually occur in this labor extract.
const LEGACY_ROSTER_SQL = `
WITH DefenseRoster AS (
    SELECT UPPER(LTRIM(RTRIM(ids.MyID))) AS MyID, loc.City, loc.State,
           CONCAT_WS(', ', loc.City, loc.State) AS Facility
    FROM dbo.rb_roster_transform AS r
    CROSS APPLY (VALUES (r.Employee_MyID_NSR), (r.Employee_MyID_SR),
                        (r.Employee_MyID_DM), (r.Employee_MyID_SAP)) AS ids(MyID)
    CROSS APPLY (VALUES (NULLIF(LTRIM(RTRIM(r.Work_City_NSR)), ''),
                         NULLIF(LTRIM(RTRIM(r.Work_State_NSR)), ''))) AS loc(City, State)
    WHERE UPPER(r.Sector) LIKE '%DEFENSE%'
      AND UPPER(loc.City) NOT IN ('UNKNOWN CITY', 'UNKNOWN', 'N/A')
      AND UPPER(LTRIM(RTRIM(ids.MyID))) IN (SELECT value FROM OPENJSON(@laborIds))
)
SELECT MyID AS my_id, MIN(City) AS city, MIN(State) AS state
FROM DefenseRoster GROUP BY MyID HAVING MIN(Facility) = MAX(Facility);`;

const norm = value => String(value ?? '').trim().toUpperCase();
const unknown = '(Unknown)';
const percent = (part, total) => total ? part / total : null;

async function readLegacyRoster(config, rows) {
  const ids = [...new Set(rows.map(row => norm(row.my_id)).filter(Boolean))];
  if (!ids.length) return new Map();
  const pool = await getPool({
    ...config,
    server: process.env.LABOR_TEST_LEGACY_SERVER || config.server,
    database: process.env.LABOR_TEST_LEGACY_DATABASE || 'DTO_Business_Management',
    user: process.env.LABOR_TEST_LEGACY_USER || config.user,
    password: process.env.LABOR_TEST_LEGACY_PASSWORD || config.password
  }, 'labor-test-legacy');
  const result = await pool.request().input('laborIds', JSON.stringify(ids)).query(LEGACY_ROSTER_SQL);
  return new Map(result.recordset.map(row => [norm(row.my_id), row]));
}

function emptyBucket() {
  return { rows: 0, hours: 0, matchedRows: 0, matchedHours: 0 };
}

function add(bucket, hours, matched) {
  bucket.rows++;
  bucket.hours += hours;
  if (matched) {
    bucket.matchedRows++;
    bucket.matchedHours += hours;
  }
}

function bucketFor(map, key) {
  if (!map.has(key)) map.set(key, emptyBucket());
  return map.get(key);
}

function summarize(rows, resolve) {
  const total = emptyBucket();
  const facilities = new Map([[unknown, emptyBucket()]]);
  const months = new Map();
  for (const row of rows) {
    const amount = Number(row.entered_hours);
    if (row.entered_hours == null || !Number.isFinite(amount)) throw new Error('Invalid labor hours.');
    // Integer hundredths preserve the precision of the DBM decimal(18,2) measure.
    const hours = Math.abs(Math.round(amount * 100));
    const location = resolve(row);
    const facility = location?.city ? [norm(location.city), norm(location.state)].filter(Boolean).join(', ') : unknown;
    const matched = facility !== unknown;
    add(total, hours, matched);
    add(bucketFor(facilities, facility), hours, matched);
    add(bucketFor(months, row.year + '-' + String(row.month).padStart(2, '0')), hours, matched);
  }
  return { total, facilities, months };
}

function appendSheet(book, name, headers, rows, pctColumns) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  for (let r = 1; r <= rows.length; r++) {
    for (const c of pctColumns) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.z = '0.00%';
    }
  }
  sheet['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 40 : Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(book, sheet, name);
}

function workbook(summary) {
  const book = XLSX.utils.book_new();
  const { total, facilities, months } = summary;
  const ordered = [...facilities].sort(([a, x], [b, y]) =>
    Number(a === unknown) - Number(b === unknown) || y.hours - x.hours || a.localeCompare(b));
  let runningHours = 0, runningRows = 0;
  appendSheet(book, 'Facilities',
    ['Facility', 'Absolute hours', 'Share of hours', 'Cumulative hours %', 'Labor rows', 'Share of rows', 'Cumulative rows %'],
    ordered.map(([facility, v]) => {
      runningHours += v.hours;
      runningRows += v.rows;
      return [facility, v.hours / 100, percent(v.hours, total.hours), percent(runningHours, total.hours),
        v.rows, percent(v.rows, total.rows), percent(runningRows, total.rows)];
    }), [2, 3, 5, 6]);
  appendSheet(book, 'Monthly coverage',
    ['Month', 'Labor rows', 'Matched rows', 'Matched rows %', 'Absolute hours', 'Matched absolute hours', 'Matched hours %'],
    [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) =>
      [month, v.rows, v.matchedRows, percent(v.matchedRows, v.rows), v.hours / 100,
        v.matchedHours / 100, percent(v.matchedHours, v.hours)]), [3, 6]);
  return XLSX.write(book, { type: 'base64', bookType: 'xlsx', compression: true });
}

const displayPct = (n, d) => d ? (100 * n / d).toFixed(2) + '%' : '—';

export async function renderLaborRosterComparison() {
  const { config, missing } = getConnectionConfig('dbm');
  if (missing.length) throw new Error('Missing DBM settings: ' + missing.join(', '));
  const dbm = await getPool(config, 'dbm');
  const { recordset: rows } = await dbm.request().query(LABOR_UTILIZATION_NEW_DBM_QUERY);
  // Approved use of the Databricks fiscal roster is limited to labor facility attribution.
  const [oldRoster, monthlyRoster] = await Promise.all([
    readLegacyRoster(config, rows), readLaborRosterLookup(getLaborRosterConfig(), rows)
  ]);
  const methods = [
    ['Old SQL roster', 'old', summarize(rows, row => oldRoster.get(norm(row.my_id)))],
    ['New monthly roster', 'new', summarize(rows, row => lookupMonthlyLaborFacility(row, monthlyRoster))]
  ];
  const body = methods.map(([label, slug, summary]) => {
    const v = summary.total;
    return `<tr><th scope="row">${label}</th><td>${v.matchedRows.toLocaleString('en-US')} / ${v.rows.toLocaleString('en-US')}</td>
      <td>${displayPct(v.matchedRows, v.rows)}</td><td>${displayPct(v.matchedHours, v.hours)}</td>
      <td><a download="labor-facility-${slug}.xlsx" href="data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${workbook(summary)}">Download ${label} Excel</a></td></tr>`;
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Labor facility coverage</title><style>body{font:16px system-ui;margin:4vw;color:#172536}table{border-collapse:collapse}th,td{padding:.8rem;text-align:left;border-bottom:1px solid #ccc}a{display:inline-block;background:#164d75;color:white;padding:.45rem .8rem;border-radius:.3rem}p{max-width:78ch}</style>
    <main><h1>Labor facility coverage</h1><p>Both methods use the same ${rows.length.toLocaleString('en-US')} DBM labor rows, grouped by employee, month, division, business unit, cost center and labor category. Extracted ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC.</p>
    <table><thead><tr><th>Method</th><th>Matched / total rows</th><th>Rows matched</th><th>Hours matched</th><th>Workbook</th></tr></thead><tbody>${body}</tbody></table>
    <p>Hour percentages weight each grouped row by the absolute value of its entered hours. Facilities are ordered by hours, with (Unknown) last. Every share includes unknowns in its denominator. Blank percentages mean the denominator was zero.</p></main></html>`;
}
