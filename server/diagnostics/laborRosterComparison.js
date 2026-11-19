import XLSX from 'xlsx';
import { getConnectionConfig, getPool } from '../sqlConnection.js';
import { LABOR_UTILIZATION_NEW_DBM_QUERY, LABOR_PERIOD_SQL } from '../dbmQueries/laborUtilizationNewQuery.js';
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

// Run only when the normal extract is empty. Count original actuals before
// grouping, with the same conversions and hierarchy key used by the labor query.
const EMPTY_EXTRACT_COUNTS = `
WITH Hierarchy AS (
  SELECT UPPER(LTRIM(RTRIM(COST_CENTER))) AS center,
         MAX(CASE WHEN LTRIM(RTRIM(LEV02)) = 'NGRBT' THEN 1 ELSE 0 END) AS in_scope
  FROM rpt.cost_center_load_hierarchy GROUP BY UPPER(LTRIM(RTRIM(COST_CENTER)))
), Actuals AS (
  SELECT NULLIF(UPPER(LTRIM(RTRIM(Cost_Center))), '') AS center,
         TRY_CONVERT(decimal(18,2), Hours) AS hours,
         month_start
  FROM rpt.actuals_load_resource_management
  ${LABOR_PERIOD_SQL}
)
SELECT COUNT_BIG(*) AS raw_rows,
       COUNT_BIG(a.center) AS with_center,
       COUNT_BIG(CASE WHEN a.center IS NOT NULL AND a.hours IS NOT NULL THEN 1 END) AS with_hours,
       COUNT_BIG(CASE WHEN a.hours IS NOT NULL AND a.center IS NOT NULL AND a.month_start IS NOT NULL THEN 1 END) AS with_period,
       COUNT_BIG(CASE WHEN a.hours IS NOT NULL AND a.month_start IS NOT NULL AND h.center IS NOT NULL THEN 1 END) AS any_hierarchy,
       COUNT_BIG(CASE WHEN a.hours IS NOT NULL AND a.month_start IS NOT NULL AND h.in_scope = 1 THEN 1 END) AS scoped
FROM Actuals a LEFT JOIN Hierarchy h ON h.center = a.center;

SELECT COUNT_BIG(*) AS hierarchy_rows,
       COUNT_BIG(CASE WHEN LTRIM(RTRIM(LEV02)) = 'NGRBT' THEN 1 END) AS scoped_hierarchy_rows
FROM rpt.cost_center_load_hierarchy;`;

async function explainEmptyExtract(dbm) {
  try {
    const { recordsets } = await dbm.request().query(EMPTY_EXTRACT_COUNTS);
    const [counts] = recordsets[0];
    const [hierarchy] = recordsets[1];
    const stages = [
      ['raw_rows', 'Source actuals', 'The actuals table returned zero rows.'],
      ['with_center', 'With cost center', 'All actuals have blank cost centers.'],
      ['with_hours', 'With numeric hours', 'No remaining hours convert to decimal.'],
      ['with_period', 'With valid period', 'Period parsing excluded all remaining rows (expected YYYYMM, e.g. 202601 for January 2026).'],
      ['any_hierarchy', 'Matching any hierarchy center', 'No eligible cost center matches the hierarchy.'],
      ['scoped', 'Matching NGRBT hierarchy center', 'No eligible cost center matches a hierarchy row with LEV02 = NGRBT.']
    ];
    const firstZero = stages.find(([key]) => Number(counts[key]) === 0);
    return [
      'Finding: ' + (firstZero?.[2] ?? 'Eligible actuals exist on recheck. The extract and diagnostics were separate reads.'),
      'Actuals funnel (raw rows remaining):',
      ...stages.map(([key, label]) => '  ' + label + ': ' + counts[key]),
      'Hierarchy rows: ' + hierarchy.hierarchy_rows + ' total, ' + hierarchy.scoped_hierarchy_rows + ' in NGRBT.'
    ];
  } catch (error) {
    const code = String(error.code || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0,30);
    return ['Finding: The common labor extract returned zero rows. The follow-up count query failed (' + code + ').'];
  }
}

const norm = value => String(value ?? '').trim().toUpperCase();
const unknown = '(Unknown)';
const percent = (part, total) => total ? part / total : null;

function sqlTarget(config) {
  return [config.server, config.database].map(value =>
    String(value ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 128)).join(' / ');
}

function failureCode(error) {
  return /^[A-Z0-9_]{1,40}$/.test(error?.code) ? error.code : 'request failed';
}

async function readLegacyRoster(config, ids) {
  if (!config.server || !config.database || !config.user || !config.password) {
    const error = new Error('Missing old roster connection settings.');
    error.code = 'OLD_ROSTER_CONFIG_MISSING';
    throw error;
  }
  const pool = await getPool(config, 'labor-test-legacy');
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

function summarize(rows, resolve, resolveDivision) {
  const total = emptyBucket();
  const facilities = new Map([[unknown, emptyBucket()]]);
  const months = new Map();
  const divisions = resolveDivision ? new Map() : null;
  for (const row of rows) {
    const amount = Number(row.entered_hours);
    if (row.entered_hours == null || !Number.isFinite(amount)) throw new Error('Invalid labor hours.');
    // Integer hundredths preserve the precision of the DBM decimal(18,2) measure.
    const hours = Math.abs(Math.round(amount * 100));
    const location = resolve(row);
    const facility = location?.city ? [norm(location.city), norm(location.state)].filter(Boolean).join(', ') : unknown;
    const matched = facility !== unknown;
    if (divisions) {
      const hierarchyDivision = norm(row.division) || unknown;
      const rosterDivision = norm(resolveDivision(row)) || unknown;
      const pair = JSON.stringify([hierarchyDivision, rosterDivision]);
      add(bucketFor(divisions, pair), hours, false);
    }
    add(total, hours, matched);
    add(bucketFor(facilities, facility), hours, matched);
    add(bucketFor(months, row.year + '-' + String(row.month).padStart(2, '0')), hours, matched);
  }
  return { total, facilities, months, divisions };
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
  const { total, facilities, months, divisions } = summary;
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
  if (divisions) {
    // Preserve source labels. Only whitespace, case and the display prefix DS are normalized for agreement.
    const divisionKey = value => norm(value).replace(/^DS\s+/, '').replace(/\s+/g, ' ');
    const missingDivision = value => [unknown.toUpperCase(), 'UNMAPPED', 'UNKNOWN', 'N/A'].includes(norm(value));
    appendSheet(book, 'division comparison',
      ['Hierarchy division (LEV03_DESC)', 'Roster division (org_structure_lvl3)', 'Comparison',
        'Labor rows', 'Share of all rows', 'Absolute hours', 'Share of all hours'],
      [...divisions].sort(([a, x], [b, y]) => y.hours - x.hours || a.localeCompare(b)).map(([pair, v]) => {
        const [hierarchy, roster] = JSON.parse(pair);
        let comparison = 'Different';
        if (missingDivision(hierarchy) || missingDivision(roster)) comparison = 'Missing division';
        else if (divisionKey(hierarchy) === divisionKey(roster)) comparison = 'Same';
        return [hierarchy, roster, comparison, v.rows, percent(v.rows, total.rows),
          v.hours / 100, percent(v.hours, total.hours)];
      }), [4, 6]);
  }
  return XLSX.write(book, { type: 'base64', bookType: 'xlsx', compression: true });
}

const displayPct = (n, d) => d ? (100 * n / d).toFixed(2) + '%' : '—';

export async function renderLaborRosterComparison() {
  const { config, missing } = getConnectionConfig('dbm');
  if (missing.length) throw new Error('Missing DBM settings: ' + missing.join(', '));
  let dbm, rows;
  try {
    dbm = await getPool(config, 'dbm');
    ({ recordset: rows } = await dbm.request().query(LABOR_UTILIZATION_NEW_DBM_QUERY));
  } catch (error) {
    throw new Error('Shared DBM labor extract failed (' + failureCode(error) + ') at ' + sqlTarget(config)
      + '. Neither roster lookup ran.');
  }
  // Approved use of the Databricks fiscal roster is limited to labor facility attribution.
  const distinctIds = new Set();
  let withId = 0;
  for (const row of rows) {
    const id = norm(row.my_id);
    if (id) { distinctIds.add(id); withId++; }
  }
  // Labor actuals and the old roster have independent SQL connections.
  const oldRosterConfig = {
    server: process.env.oldrosterserver,
    database: process.env.oldrosterdatabase,
    user: process.env.oldrosteruser,
    password: process.env.oldrosterpassword,
    requestTimeout: 120000
  };
  const methods = [
    {
      label: 'Old SQL roster', slug: 'old',
      load: () => readLegacyRoster(oldRosterConfig, [...distinctIds]),
      resolve: (row, lookup) => lookup.get(norm(row.my_id)),
      failureHint: 'Target: ' + sqlTarget(oldRosterConfig)
        + '. Required connection settings: oldrosterserver / oldrosterdatabase / oldrosteruser / oldrosterpassword.'
        + ' Check access to dbo.rb_roster_transform in the configured old roster database.'
    },
    {
      label: 'New monthly roster', slug: 'new',
      load: () => readLaborRosterLookup(getLaborRosterConfig(), rows, { includeDivision: true }),
      resolveDivision: (row, lookup) => lookupMonthlyLaborFacility(row, lookup.divisions || new Map()),
      resolve: lookupMonthlyLaborFacility,
      failureHint: 'Check the Databricks labor roster configuration and warehouse access.'
    }
  ];
  const results = await Promise.all(methods.map(async method => {
    let lookup;
    try {
      lookup = withId ? await method.load() : new Map();
    } catch (error) {
      return { ...method, failure: failureCode(error) };
    }
    return { ...method, size: lookup.size, summary: summarize(rows, row => method.resolve(row, lookup),
      method.resolveDivision && (row => method.resolveDivision(row, lookup))) };
  }));
  const report = ['[labor-test] ' + new Date().toISOString(),
    'Shared DBM labor extract: ' + rows.length + ' grouped rows',
    'Rows with MyID: ' + withId + ' / ' + rows.length + ' (' + distinctIds.size + ' distinct IDs)'];
  if (!rows.length) {
    report.push(...await explainEmptyExtract(dbm));
  } else if (!withId) {
    report.push('Finding: Every grouped row has a blank MyID.');
  }
  if (!withId) {
    report.push('Both roster lookups skipped: no labor IDs to match.');
  } else {
    const firstSummary = results.find(result => result.summary)?.summary;
    if (firstSummary) {
      const months = [...firstSummary.months.keys()].sort();
      report.push('Labor months: ' + months[0] + ' through ' + months.at(-1));
    }
    for (const result of results) {
      if (result.failure) {
        report.push(result.label + ' unavailable (' + result.failure + '). ' + result.failureHint);
        continue;
      }
      const { total } = result.summary;
      const keys = result.slug === 'old' ? 'unambiguous Defense MyIDs' : 'eligible MyID/month keys';
      report.push(result.label + ': ' + result.size + ' ' + keys + ', ' + total.matchedRows
        + ' / ' + total.rows + ' labor rows matched');
      if (result.slug === 'new' && result.size && !total.matchedRows) {
        report.push('Monthly facilities exist, but none matches the exact employee and labor month.');
      }
    }
  }
  // Never include login values, employee IDs or raw driver messages in the shareable summary.
  const debugText = report.join('\n');
  console.info(debugText);
  const escapedDebug = debugText.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const body = results.map(({ label, slug, summary }) => {
    if (!summary) return `<tr><th scope="row">${label}</th><td colspan="4">Unavailable (see debug summary)</td></tr>`;
    const v = summary.total;
    return `<tr><th scope="row">${label}</th><td>${v.matchedRows.toLocaleString('en-US')} / ${v.rows.toLocaleString('en-US')}</td>
      <td>${displayPct(v.matchedRows, v.rows)}</td><td>${displayPct(v.matchedHours, v.hours)}</td>
      <td><a download="labor-facility-${slug}.xlsx" href="data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${workbook(summary)}">Download ${label} Excel</a></td></tr>`;
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Labor facility coverage</title><style>body{font:16px system-ui;margin:4vw;color:#172536}table{border-collapse:collapse}th,td{padding:.8rem;text-align:left;border-bottom:1px solid #ccc}a{display:inline-block;background:#164d75;color:white;padding:.45rem .8rem;border-radius:.3rem}p{max-width:78ch}</style>
    <main><h1>Labor facility coverage</h1><p>Both methods use the same ${rows.length.toLocaleString('en-US')} DBM labor rows, grouped by employee, month, division, business unit, cost center and labor category. Extracted ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC.</p>
    <section><h2>Debug summary</h2><pre style="white-space:pre-wrap">${escapedDebug}</pre></section>
    <table><thead><tr><th>Method</th><th>Matched / total rows</th><th>Rows matched</th><th>Hours matched</th><th>Workbook</th></tr></thead><tbody>${body}</tbody></table>
    <p>Hour percentages weight each grouped row by the absolute value of its entered hours. Facilities are ordered by hours, with (Unknown) last. Every share includes unknowns in its denominator. Blank percentages mean the denominator was zero.</p></main></html>`;
}

