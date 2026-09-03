import { readControllableCostsData } from './controllableCostsRepository.js';
import { getConnectionConfig, getPool } from './sqlConnection.js';

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function number(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeCostCenter(value) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeCostElement(value) {
  const normalized = String(value ?? '').trim();
  const match = /^(\d+)(?:\.0+)?$/.exec(normalized);
  if (!match) return null;
  try {
    return BigInt(match[1]).toString();
  } catch {
    return null;
  }
}

function legacyQuarterKey(row) {
  const year = Number(row?.year);
  const match = /^Q([1-4])$/i.exec(String(row?.quarter ?? '').trim());
  return Number.isInteger(year) && match ? `${year}-Q${match[1]}` : null;
}

function parseQuarterKey(value) {
  const match = /^(\d{4})-Q([1-4])$/.exec(String(value ?? ''));
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  return {
    year,
    quarter,
    firstMonth: (quarter - 1) * 3 + 1,
    lastMonth: quarter * 3
  };
}

function canonicalLocation(value) {
  const aliases = new Map([
    ['drive', 'dr'], ['road', 'rd'], ['street', 'st'], ['avenue', 'ave'],
    ['boulevard', 'blvd'], ['highway', 'hwy'], ['lane', 'ln'], ['circle', 'cir'],
    ['parkway', 'pkwy'], ['north', 'n'], ['south', 's'], ['east', 'e'], ['west', 'w']
  ]);

  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => aliases.get(token) ?? token)
    .join(' ');
}

function locationMatchScore(legacyAddress, candidateFacility) {
  const legacy = canonicalLocation(legacyAddress);
  const candidate = canonicalLocation(candidateFacility);
  if (!legacy || !candidate) return 0;
  if (candidate.includes(legacy) || legacy.includes(candidate)) return 1;

  const legacyTokens = legacy.split(' ');
  const candidateTokens = new Set(candidate.split(' '));
  const legacyNumbers = legacyTokens.filter((token) => /^\d+$/.test(token));
  const candidateNumbers = new Set([...candidateTokens].filter((token) => /^\d+$/.test(token)));

  if (
    legacyNumbers.length > 0
    && candidateNumbers.size > 0
    && !legacyNumbers.some((value) => candidateNumbers.has(value))
  ) {
    return 0;
  }

  const overlap = legacyTokens.filter((token) => candidateTokens.has(token)).length;
  let score = legacyTokens.length > 0 ? overlap / legacyTokens.length : 0;
  if (legacyNumbers.some((value) => candidateNumbers.has(value))) score += 0.15;
  return Math.min(score, 0.99);
}

function findLegacyAddressMatch(candidateFacility, legacyAddresses) {
  const ranked = legacyAddresses
    .map((address) => ({ address, score: locationMatchScore(address, candidateFacility) }))
    .filter((row) => row.score >= 0.6)
    .sort((a, b) => b.score - a.score || a.address.localeCompare(b.address));

  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.08) return { ambiguous: true };

  return {
    ambiguous: false,
    address: ranked[0].address,
    score: ranked[0].score,
    candidateFacility
  };
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildFreshQuarterQuery(period, costElements) {
  const glList = costElements.filter((value) => /^\d+$/.test(value)).join(',');
  const glPredicate = glList ? `TRY_CONVERT(bigint, t.RACCT) IN (${glList})` : '1 = 0';

  return `
WITH CostCenterHierarchy AS (
  SELECT
    LTRIM(RTRIM(COST_CENTER)) AS cost_center,
    COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS division,
    ROW_NUMBER() OVER (
      PARTITION BY LTRIM(RTRIM(COST_CENTER))
      ORDER BY last_modified_date DESC, created_date DESC, id DESC
    ) AS rn
  FROM rpt.rb_load_cost_center_hierarchy
  WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
)
SELECT
  h.division,
  UPPER(LTRIM(RTRIM(t.RCNTR))) AS cost_center,
  SUM(CASE
    WHEN LTRIM(RTRIM(t.ACCT_LEVEL02_TEXT)) = 'NGRB Indirect Non Labor CEG'
    THEN TRY_CONVERT(decimal(18,2), t.KSL)
    ELSE 0
  END) AS raw_nonlabor_cost,
  SUM(CASE
    WHEN ${glPredicate}
    THEN TRY_CONVERT(decimal(18,2), t.KSL)
    ELSE 0
  END) AS exact_gl_cost
FROM src.rb_CVG_Transaction_Details_03 t
JOIN CostCenterHierarchy h
  ON LTRIM(RTRIM(t.RCNTR)) = h.cost_center
 AND h.rn = 1
WHERE
  TRY_CONVERT(int, t.GJAHR) = ${period.year}
  AND TRY_CONVERT(int, t.POPER) BETWEEN ${period.firstMonth} AND ${period.lastMonth}
  AND TRY_CONVERT(decimal(18,2), t.KSL) IS NOT NULL
  AND (
    LTRIM(RTRIM(t.ACCT_LEVEL02_TEXT)) = 'NGRB Indirect Non Labor CEG'
    OR ${glPredicate}
  )
GROUP BY
  h.division,
  UPPER(LTRIM(RTRIM(t.RCNTR)));
`;
}

function buildArchibusQuery(costCenters) {
  if (costCenters.length === 0) return null;
  const list = costCenters.map(sqlString).join(',');
  return `
SELECT
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), employee_cost_center)))) AS cost_center,
  NULLIF(CONCAT_WS(' | ',
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), address_1))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), city))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), state))), '')
  ), '') AS facility
FROM rpt.rb_archibus
WHERE
  NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), employee_cost_center))), '') IS NOT NULL
  AND UPPER(LTRIM(RTRIM(CONVERT(varchar(100), employee_cost_center)))) IN (${list})
GROUP BY
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), employee_cost_center)))),
  NULLIF(CONCAT_WS(' | ',
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), address_1))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), city))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), state))), '')
  ), '');
`;
}

function buildRosterQuery(costCenters) {
  if (costCenters.length === 0) return null;
  const list = costCenters.map(sqlString).join(',');
  return `
SELECT
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), CostCenter)))) AS cost_center,
  NULLIF(CONCAT_WS(' | ',
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), LocationID))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), LocationName))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), WorkCity))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), WorkStateCode))), '')
  ), '') AS facility
FROM dbo.src_ng_nonsensitive_roster
WHERE
  NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), CostCenter))), '') IS NOT NULL
  AND UPPER(LTRIM(RTRIM(CONVERT(varchar(100), CostCenter)))) IN (${list})
GROUP BY
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), CostCenter)))),
  NULLIF(CONCAT_WS(' | ',
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), LocationID))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), LocationName))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), WorkCity))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), WorkStateCode))), '')
  ), '');
`;
}

function buildKeyMap(rows, legacyAddresses) {
  const facilitiesByCostCenter = new Map();

  rows.forEach((row) => {
    const costCenter = normalizeCostCenter(row.cost_center);
    const facility = text(row.facility);
    if (!costCenter || !facility) return;
    const facilities = facilitiesByCostCenter.get(costCenter) ?? new Set();
    facilities.add(facility);
    facilitiesByCostCenter.set(costCenter, facilities);
  });

  const mapped = new Map();
  let ambiguousCostCenterCount = 0;

  facilitiesByCostCenter.forEach((facilities, costCenter) => {
    const addressMatches = new Map();
    let ambiguous = false;

    facilities.forEach((facility) => {
      const match = findLegacyAddressMatch(facility, legacyAddresses);
      if (!match) return;
      if (match.ambiguous) {
        ambiguous = true;
        return;
      }
      const previous = addressMatches.get(match.address);
      if (!previous || match.score > previous.score) addressMatches.set(match.address, match);
    });

    if (addressMatches.size === 1 && !ambiguous) {
      mapped.set(costCenter, [...addressMatches.values()][0]);
    } else if (addressMatches.size > 1 || ambiguous) {
      ambiguousCostCenterCount += 1;
    }
  });

  return { mapped, ambiguousCostCenterCount };
}

function buildSourceSummary(name, mapResult, legacyRows, freshRows) {
  const matchedAddresses = new Set([...mapResult.mapped.values()].map((row) => row.address));
  const coveredLegacyRows = legacyRows.filter((row) => matchedAddresses.has(row.address));
  const legacyCoveredCost = coveredLegacyRows.reduce((sum, row) => sum + row.cost, 0);
  const legacyAbsTotal = legacyRows.reduce((sum, row) => sum + Math.abs(row.cost), 0);
  const legacyCoveredAbs = coveredLegacyRows.reduce((sum, row) => sum + Math.abs(row.cost), 0);
  const mappedFresh = freshRows.filter((row) => mapResult.mapped.has(row.costCenter));

  return {
    source: name,
    mappedCostCenterCount: mapResult.mapped.size,
    ambiguousCostCenterCount: mapResult.ambiguousCostCenterCount,
    matchedLegacyAddressCount: matchedAddresses.size,
    legacyAddressCount: new Set(legacyRows.map((row) => row.address)).size,
    legacyCoveredCost,
    legacyCoveredShare: legacyAbsTotal > 0 ? legacyCoveredAbs / legacyAbsTotal : 0,
    freshExactGlCost: mappedFresh.reduce((sum, row) => sum + row.exactGlCost, 0),
    freshRawNonLaborCost: mappedFresh.reduce((sum, row) => sum + row.rawNonLaborCost, 0),
    keyMap: mapResult.mapped
  };
}

function buildAlignment(legacyRows, freshRows, keyMap) {
  const groups = new Map();

  legacyRows.forEach((row) => {
    const group = groups.get(row.address) ?? {
      address: row.address,
      legacyCost: 0,
      freshExactGlCost: 0,
      freshRawNonLaborCost: 0,
      costCenters: new Set(),
      divisions: new Set(),
      examples: new Set(),
      scores: []
    };
    group.legacyCost += row.cost;
    groups.set(row.address, group);
  });

  freshRows.forEach((row) => {
    const mapping = keyMap.get(row.costCenter);
    if (!mapping) return;
    const group = groups.get(mapping.address);
    if (!group) return;
    group.freshExactGlCost += row.exactGlCost;
    group.freshRawNonLaborCost += row.rawNonLaborCost;
    group.costCenters.add(row.costCenter);
    group.divisions.add(row.division);
    group.examples.add(mapping.candidateFacility);
    group.scores.push(mapping.score);
  });

  const matchedAddresses = new Set([...keyMap.values()].map((row) => row.address));
  const alignmentRows = [...groups.values()]
    .filter((row) => matchedAddresses.has(row.address))
    .map((row) => ({
      address: row.address,
      legacyCost: row.legacyCost,
      freshExactGlCost: row.freshExactGlCost,
      freshRawNonLaborCost: row.freshRawNonLaborCost,
      difference: row.freshExactGlCost - row.legacyCost,
      costCenterCount: row.costCenters.size,
      divisions: [...row.divisions].sort(),
      matchQuality: row.scores.length > 0
        ? row.scores.reduce((sum, value) => sum + value, 0) / row.scores.length
        : 0,
      example: [...row.examples][0] ?? ''
    }))
    .sort((a, b) => Math.abs(b.legacyCost) - Math.abs(a.legacyCost));

  const unmatchedRows = [...groups.values()]
    .filter((row) => !matchedAddresses.has(row.address))
    .map((row) => ({ address: row.address, legacyCost: row.legacyCost }))
    .sort((a, b) => Math.abs(b.legacyCost) - Math.abs(a.legacyCost))
    .slice(0, 20);

  return { alignmentRows, unmatchedRows };
}

function buildDivisionEstimate(alignmentRows) {
  const groups = new Map();
  const totalLegacy = alignmentRows.reduce((sum, row) => sum + Math.abs(row.legacyCost), 0);

  alignmentRows.forEach((row) => {
    const division = row.divisions.length === 1
      ? row.divisions[0]
      : row.divisions.length > 1
        ? 'Multiple divisions'
        : 'No fresh division';
    const group = groups.get(division) ?? {
      division,
      legacyCost: 0,
      freshExactGlCost: 0,
      freshRawNonLaborCost: 0,
      addressCount: 0,
      mappedCostCenterCount: 0
    };
    group.legacyCost += row.legacyCost;
    group.freshExactGlCost += row.freshExactGlCost;
    group.freshRawNonLaborCost += row.freshRawNonLaborCost;
    group.addressCount += 1;
    group.mappedCostCenterCount += row.costCenterCount;
    groups.set(division, group);
  });

  return [...groups.values()]
    .map((row) => ({
      ...row,
      legacyShareOfMatched: totalLegacy > 0 ? Math.abs(row.legacyCost) / totalLegacy : 0
    }))
    .sort((a, b) => {
      const wsA = /weapon systems/i.test(a.division) ? -1 : 0;
      const wsB = /weapon systems/i.test(b.division) ? -1 : 0;
      return wsA - wsB || Math.abs(b.legacyCost) - Math.abs(a.legacyCost);
    });
}

export async function readDbmDiagnosticsFast() {
  const { config, missing } = getConnectionConfig('dbm');
  if (missing.length > 0) throw new Error(`DBM configuration is incomplete: ${missing.join(', ')}`);

  const pool = await getPool(config, 'dbm');
  const oldPayload = await readControllableCostsData();
  const allLegacyRows = (oldPayload?.rows ?? [])
    .map((row) => ({
      quarterKey: legacyQuarterKey(row),
      address: text(row.address, '(Blank)'),
      costElement: normalizeCostElement(row.cost_element),
      cost: number(row.cost)
    }))
    .filter((row) => row.quarterKey && Number.isFinite(row.cost));

  const sampleQuarterKey = [...new Set(allLegacyRows.map((row) => row.quarterKey))].sort().at(-1);
  const period = parseQuarterKey(sampleQuarterKey);
  if (!period) throw new Error('Could not determine a legacy comparison quarter.');

  const legacyRows = allLegacyRows.filter((row) => row.quarterKey === sampleQuarterKey);
  const legacyAddresses = [...new Set(legacyRows.map((row) => row.address).filter((value) => value !== '(Blank)'))];
  const costElements = [...new Set(legacyRows.map((row) => row.costElement).filter(Boolean))];

  const freshResult = await pool.request().query(buildFreshQuarterQuery(period, costElements));
  const freshRows = freshResult.recordset.map((row) => ({
    division: text(row.division, 'Unmapped'),
    costCenter: normalizeCostCenter(row.cost_center),
    rawNonLaborCost: number(row.raw_nonlabor_cost),
    exactGlCost: number(row.exact_gl_cost)
  })).filter((row) => row.costCenter);

  const costCenters = [...new Set(freshRows.map((row) => row.costCenter))];
  const archibusQuery = buildArchibusQuery(costCenters);
  const rosterQuery = buildRosterQuery(costCenters);
  const [archibusResult, rosterResult] = await Promise.all([
    archibusQuery ? pool.request().query(archibusQuery) : Promise.resolve({ recordset: [] }),
    rosterQuery ? pool.request().query(rosterQuery) : Promise.resolve({ recordset: [] })
  ]);

  const archibusMap = buildKeyMap(archibusResult.recordset, legacyAddresses);
  const rosterMap = buildKeyMap(rosterResult.recordset, legacyAddresses);
  const sourceRows = [
    buildSourceSummary('rpt.rb_archibus', archibusMap, legacyRows, freshRows),
    buildSourceSummary('dbo.src_ng_nonsensitive_roster', rosterMap, legacyRows, freshRows)
  ].sort((a, b) => b.legacyCoveredShare - a.legacyCoveredShare);

  const best = sourceRows[0];
  const { alignmentRows, unmatchedRows } = buildAlignment(legacyRows, freshRows, best.keyMap);
  const divisionRows = buildDivisionEstimate(alignmentRows);

  return {
    sampleQuarterKey,
    legacyCost: legacyRows.reduce((sum, row) => sum + row.cost, 0),
    legacyAddressCount: legacyAddresses.length,
    freshCostCenterCount: costCenters.length,
    freshRawNonLaborCost: freshRows.reduce((sum, row) => sum + row.rawNonLaborCost, 0),
    freshExactGlCost: freshRows.reduce((sum, row) => sum + row.exactGlCost, 0),
    bestSource: best.source,
    bestMatchedAddressCount: best.matchedLegacyAddressCount,
    bestLegacyCoveredCost: best.legacyCoveredCost,
    bestLegacyCoveredShare: best.legacyCoveredShare,
    bestFreshExactGlCost: best.freshExactGlCost,
    bestFreshRawNonLaborCost: best.freshRawNonLaborCost,
    sourceRows: sourceRows.map(({ keyMap, ...row }) => row),
    divisionRows,
    alignmentRows: alignmentRows.slice(0, 20),
    unmatchedRows
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const count = new Intl.NumberFormat('en-US');
const percent = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatMoney(value) {
  return money.format(number(value));
}

function formatCount(value) {
  return count.format(number(value));
}

function formatPercent(value) {
  return percent.format(number(value));
}

export function renderDbmDiagnosticsFastPage(payload) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DBM Diagnostics — Fast</title>
  <style>
    :root { color-scheme: dark; font-family: Arial, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 14px; background: #111827; color: #f3f4f6; }
    .shell { width: min(1080px, 100%); margin: 0 auto; display: grid; gap: 12px; }
    .panel, .card { border: 1px solid #374151; border-radius: 9px; background: #1f2937; }
    .panel { padding: 12px; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .card { padding: 9px 10px; background: #111827; }
    .card span { display: block; color: #9ca3af; font-size: 9px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
    .card strong { font-size: 13px; overflow-wrap: anywhere; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    h2 { margin: 0 0 8px; font-size: 16px; }
    h3 { margin: 16px 0 7px; font-size: 13px; }
    p { margin: 0 0 9px; }
    .note { background: #111827; border-radius: 7px; padding: 8px 9px; font-size: 11px; color: #d1d5db; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10.5px; }
    th, td { border: 1px solid #374151; padding: 6px 7px; text-align: left; vertical-align: top; white-space: normal; overflow-wrap: anywhere; }
    th { background: #28223c; color: white; }
    tbody tr:nth-child(even) { background: #182231; }
    .review { background: rgba(245, 158, 11, .08); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .links { display: flex; gap: 8px; margin-bottom: 10px; }
    .links a { color: white; text-decoration: none; border: 1px solid #4b5563; border-radius: 999px; padding: 6px 9px; font-size: 10px; }
    @media (max-width: 800px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel">
      <h1>DBM Diagnostics — Fast Facility Test</h1>
      <div class="links"><a href="/dbm-diagnostics">Refresh</a><a href="/dbm-diagnostics-full">Full / Slow Diagnostics</a></div>
      <p class="note">Fast path: only ${escapeHtml(payload.sampleQuarterKey)} is scanned, and the transaction table is scanned once for both raw non-labor and exact legacy-GL dollars. Facility lookup tables are then restricted to only the cost centers returned by that quarter.</p>
      <div class="cards">
        <article class="card"><span>Comparison Quarter</span><strong>${escapeHtml(payload.sampleQuarterKey)}</strong></article>
        <article class="card"><span>Legacy Cost</span><strong>${formatMoney(payload.legacyCost)}</strong></article>
        <article class="card"><span>Fresh Raw Non-Labor</span><strong>${formatMoney(payload.freshRawNonLaborCost)}</strong></article>
        <article class="card"><span>Fresh Exact Legacy GLs</span><strong>${formatMoney(payload.freshExactGlCost)}</strong></article>
        <article class="card"><span>Best Facility Source</span><strong>${escapeHtml(payload.bestSource)}</strong></article>
        <article class="card"><span>Legacy Addresses Matched</span><strong>${formatCount(payload.bestMatchedAddressCount)} / ${formatCount(payload.legacyAddressCount)}</strong></article>
        <article class="card"><span>Legacy $ Covered</span><strong>${formatMoney(payload.bestLegacyCoveredCost)} · ${formatPercent(payload.bestLegacyCoveredShare)}</strong></article>
        <article class="card"><span>Fresh Exact-GL at Matched Facilities</span><strong>${formatMoney(payload.bestFreshExactGlCost)}</strong></article>
      </div>

      <h3>Facility Source Comparison</h3>
      <table>
        <thead><tr><th>Source</th><th>Mapped CCs</th><th>Ambiguous CCs</th><th>Addresses</th><th>Legacy $ Covered</th><th>Share</th><th>Fresh Exact-GL</th><th>Fresh Raw Non-Labor</th></tr></thead>
        <tbody>${payload.sourceRows.map((row) => `
          <tr><td class="mono">${escapeHtml(row.source)}</td><td>${formatCount(row.mappedCostCenterCount)}</td><td>${formatCount(row.ambiguousCostCenterCount)}</td><td>${formatCount(row.matchedLegacyAddressCount)} / ${formatCount(row.legacyAddressCount)}</td><td>${formatMoney(row.legacyCoveredCost)}</td><td>${formatPercent(row.legacyCoveredShare)}</td><td>${formatMoney(row.freshExactGlCost)}</td><td>${formatMoney(row.freshRawNonLaborCost)}</td></tr>
        `).join('')}</tbody>
      </table>

      <h3>Old Report → Division Estimate</h3>
      <p class="note">New test. For each legacy facility that maps cleanly to fresh cost centers, this assigns the old facility dollars to the fresh division when the facility resolves to exactly one division. Multi-division facilities are kept separate instead of guessed. This is specifically useful for checking whether Weapon Systems is underrepresented.</p>
      <table>
        <thead><tr><th>Division</th><th>Legacy Cost at Matched Facilities</th><th>Share of Matched Legacy $</th><th>Fresh Exact-GL</th><th>Fresh Raw Non-Labor</th><th>Addresses / CCs</th></tr></thead>
        <tbody>${payload.divisionRows.map((row) => `
          <tr><td>${escapeHtml(row.division)}</td><td>${formatMoney(row.legacyCost)}</td><td>${formatPercent(row.legacyShareOfMatched)}</td><td>${formatMoney(row.freshExactGlCost)}</td><td>${formatMoney(row.freshRawNonLaborCost)}</td><td>${formatCount(row.addressCount)} / ${formatCount(row.mappedCostCenterCount)}</td></tr>
        `).join('') || '<tr><td colspan="6">No division-attributable facilities found.</td></tr>'}</tbody>
      </table>

      <h3>Facility Alignment — Top 20 Legacy Facilities</h3>
      <table>
        <thead><tr><th>Legacy Address</th><th>Legacy Cost</th><th>Fresh Exact-GL</th><th>Fresh Raw Non-Labor</th><th>Mapped CCs</th><th>Division(s)</th><th>Match</th><th>Fresh Location</th></tr></thead>
        <tbody>${payload.alignmentRows.map((row) => `
          <tr><td>${escapeHtml(row.address)}</td><td>${formatMoney(row.legacyCost)}</td><td>${formatMoney(row.freshExactGlCost)}</td><td>${formatMoney(row.freshRawNonLaborCost)}</td><td>${formatCount(row.costCenterCount)}</td><td>${escapeHtml(row.divisions.join(', ') || '—')}</td><td>${formatPercent(row.matchQuality)}</td><td>${escapeHtml(row.example || '—')}</td></tr>
        `).join('') || '<tr><td colspan="8">No matched facilities.</td></tr>'}</tbody>
      </table>

      <h3>Largest Legacy Facilities Still Unmatched</h3>
      <table>
        <thead><tr><th>Legacy Address</th><th>Legacy Cost</th></tr></thead>
        <tbody>${payload.unmatchedRows.map((row) => `<tr class="review"><td>${escapeHtml(row.address)}</td><td>${formatMoney(row.legacyCost)}</td></tr>`).join('') || '<tr><td colspan="2">All legacy addresses matched.</td></tr>'}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}
