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
  const normalized = text(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeCostElement(value) {
  const normalized = text(value);
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
  const match = /^Q([1-4])$/i.exec(text(row?.quarter));
  return Number.isInteger(year) && match ? `${year}-Q${match[1]}` : null;
}

function parseQuarterKey(value) {
  const match = /^(\d{4})-Q([1-4])$/.exec(text(value));
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  return {
    year,
    quarter,
    firstMonth: ((quarter - 1) * 3) + 1,
    lastMonth: quarter * 3
  };
}

const LOCATION_ALIASES = new Map([
  ['drive', 'dr'], ['road', 'rd'], ['street', 'st'], ['avenue', 'ave'],
  ['boulevard', 'blvd'], ['highway', 'hwy'], ['lane', 'ln'], ['circle', 'cir'],
  ['parkway', 'pkwy'], ['north', 'n'], ['south', 's'], ['east', 'e'], ['west', 'w']
]);

function canonicalLocation(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => LOCATION_ALIASES.get(token) ?? token)
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
  let score = legacyTokens.length ? overlap / legacyTokens.length : 0;
  if (legacyNumbers.some((value) => candidateNumbers.has(value))) score += 0.15;
  return Math.min(score, 0.99);
}

function findLegacyAddressMatch(candidateFacility, legacyAddresses) {
  const ranked = legacyAddresses
    .map((address) => ({ address, score: locationMatchScore(address, candidateFacility) }))
    .filter((row) => row.score >= 0.6)
    .sort((a, b) => b.score - a.score || a.address.localeCompare(b.address));

  if (!ranked.length) return null;
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
  if (!costCenters.length) return null;
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
WHERE UPPER(LTRIM(RTRIM(CONVERT(varchar(100), employee_cost_center)))) IN (${list})
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
  if (!costCenters.length) return null;
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
WHERE UPPER(LTRIM(RTRIM(CONVERT(varchar(100), CostCenter)))) IN (${list})
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
    const values = facilitiesByCostCenter.get(costCenter) ?? new Set();
    values.add(facility);
    facilitiesByCostCenter.set(costCenter, values);
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

function buildCombinedMap(archibus, roster) {
  const combined = new Map();
  let conflicts = 0;
  const costCenters = new Set([...archibus.keys(), ...roster.keys()]);
  costCenters.forEach((costCenter) => {
    const a = archibus.get(costCenter);
    const r = roster.get(costCenter);
    if (a && r && a.address !== r.address) {
      conflicts += 1;
      return;
    }
    if (a && r) combined.set(costCenter, a.score >= r.score ? a : r);
    else if (a) combined.set(costCenter, a);
    else if (r) combined.set(costCenter, r);
  });
  return { mapped: combined, ambiguousCostCenterCount: conflicts };
}

function buildSourceSummary(name, mapResult, legacyRows, freshRows) {
  const matchedAddresses = new Set([...mapResult.mapped.values()].map((row) => row.address));
  const coveredLegacyRows = legacyRows.filter((row) => matchedAddresses.has(row.address));
  const legacyAbsTotal = legacyRows.reduce((sum, row) => sum + Math.abs(row.cost), 0);
  const legacyCoveredAbs = coveredLegacyRows.reduce((sum, row) => sum + Math.abs(row.cost), 0);
  const mappedFresh = freshRows.filter((row) => mapResult.mapped.has(row.costCenter));
  return {
    source: name,
    mappedCostCenterCount: mapResult.mapped.size,
    ambiguousCostCenterCount: mapResult.ambiguousCostCenterCount,
    matchedLegacyAddressCount: matchedAddresses.size,
    legacyAddressCount: new Set(legacyRows.map((row) => row.address)).size,
    legacyCoveredCost: coveredLegacyRows.reduce((sum, row) => sum + row.cost, 0),
    legacyCoveredShare: legacyAbsTotal ? legacyCoveredAbs / legacyAbsTotal : 0,
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
      costCenterCount: row.costCenters.size,
      divisions: [...row.divisions].sort(),
      matchQuality: row.scores.length
        ? row.scores.reduce((sum, value) => sum + value, 0) / row.scores.length
        : 0,
      example: [...row.examples][0] ?? ''
    }))
    .sort((a, b) => Math.abs(b.legacyCost) - Math.abs(a.legacyCost));

  const unmatchedRows = [...groups.values()]
    .filter((row) => !matchedAddresses.has(row.address))
    .map((row) => ({ address: row.address, legacyCost: row.legacyCost }))
    .sort((a, b) => Math.abs(b.legacyCost) - Math.abs(a.legacyCost));

  return { alignmentRows, unmatchedRows };
}

function buildDivisionEstimate(alignmentRows) {
  const groups = new Map();
  alignmentRows.forEach((row) => {
    const division = row.divisions.length === 1
      ? row.divisions[0]
      : row.divisions.length > 1 ? 'Multiple divisions' : 'No fresh division';
    const group = groups.get(division) ?? { division, legacyCost: 0, addresses: 0, costCenters: 0 };
    group.legacyCost += row.legacyCost;
    group.addresses += 1;
    group.costCenters += row.costCenterCount;
    groups.set(division, group);
  });
  const total = [...groups.values()].reduce((sum, row) => sum + Math.abs(row.legacyCost), 0);
  return [...groups.values()]
    .map((row) => ({ ...row, share: total ? Math.abs(row.legacyCost) / total : 0 }))
    .sort((a, b) => Math.abs(b.legacyCost) - Math.abs(a.legacyCost));
}

function buildFreshDivisionTotals(freshRows) {
  const groups = new Map();
  freshRows.forEach((row) => {
    const group = groups.get(row.division) ?? {
      division: row.division,
      rawNonLaborCost: 0,
      exactGlCost: 0,
      costCenters: new Set()
    };
    group.rawNonLaborCost += row.rawNonLaborCost;
    group.exactGlCost += row.exactGlCost;
    group.costCenters.add(row.costCenter);
    groups.set(row.division, group);
  });
  return [...groups.values()]
    .map((row) => ({ ...row, costCenterCount: row.costCenters.size }))
    .sort((a, b) => {
      const wsA = /weapon systems/i.test(a.division) ? -1 : 0;
      const wsB = /weapon systems/i.test(b.division) ? -1 : 0;
      return wsA - wsB || Math.abs(b.rawNonLaborCost) - Math.abs(a.rawNonLaborCost);
    });
}

function singleDivisionLegacy(alignmentRows) {
  const totals = new Map();
  alignmentRows.forEach((row) => {
    if (row.divisions.length !== 1) return;
    totals.set(row.divisions[0], (totals.get(row.divisions[0]) ?? 0) + row.legacyCost);
  });
  return totals;
}

function buildDivisionReconciliation(freshDivisionRows, archAlignment, rosterAlignment, combinedAlignment) {
  const archLegacy = singleDivisionLegacy(archAlignment);
  const rosterLegacy = singleDivisionLegacy(rosterAlignment);
  const combinedLegacy = singleDivisionLegacy(combinedAlignment);
  const divisions = new Set([
    ...freshDivisionRows.map((row) => row.division),
    ...archLegacy.keys(),
    ...rosterLegacy.keys(),
    ...combinedLegacy.keys()
  ]);
  const freshByDivision = new Map(freshDivisionRows.map((row) => [row.division, row]));
  return [...divisions].map((division) => {
    const fresh = freshByDivision.get(division);
    return {
      division,
      freshRawNonLaborCost: fresh?.rawNonLaborCost ?? 0,
      freshExactGlCost: fresh?.exactGlCost ?? 0,
      freshCostCenterCount: fresh?.costCenterCount ?? 0,
      archibusLegacyCost: archLegacy.get(division) ?? 0,
      rosterLegacyCost: rosterLegacy.get(division) ?? 0,
      combinedLegacyCost: combinedLegacy.get(division) ?? 0
    };
  }).sort((a, b) => {
    const wsA = /weapon systems/i.test(a.division) ? -1 : 0;
    const wsB = /weapon systems/i.test(b.division) ? -1 : 0;
    return wsA - wsB || Math.abs(b.combinedLegacyCost) - Math.abs(a.combinedLegacyCost);
  });
}

function buildPostingClues(legacyRows, archAlignment, rosterAlignment) {
  const legacyByAddress = new Map();
  legacyRows.forEach((row) => legacyByAddress.set(row.address, (legacyByAddress.get(row.address) ?? 0) + row.cost));
  const arch = new Map(archAlignment.map((row) => [row.address, row]));
  const roster = new Map(rosterAlignment.map((row) => [row.address, row]));
  const addresses = new Set([...arch.keys(), ...roster.keys()]);
  return [...addresses].map((address) => {
    const a = arch.get(address);
    const r = roster.get(address);
    return {
      address,
      legacyCost: legacyByAddress.get(address) ?? 0,
      archExact: a?.freshExactGlCost ?? 0,
      rosterExact: r?.freshExactGlCost ?? 0,
      archRaw: a?.freshRawNonLaborCost ?? 0,
      rosterRaw: r?.freshRawNonLaborCost ?? 0,
      archDivisions: a?.divisions ?? [],
      rosterDivisions: r?.divisions ?? []
    };
  }).sort((a, b) => {
    const clueA = Math.max(Math.abs(a.archExact), Math.abs(a.rosterExact));
    const clueB = Math.max(Math.abs(b.archExact), Math.abs(b.rosterExact));
    return clueB - clueA || Math.abs(b.legacyCost) - Math.abs(a.legacyCost);
  });
}

export async function readDbmDiagnosticsFast() {
  const { config, missing } = getConnectionConfig('dbm');
  if (missing.length) throw new Error(`DBM configuration is incomplete: ${missing.join(', ')}`);
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

  const comparisonQuarterKey = [...new Set(allLegacyRows.map((row) => row.quarterKey))].sort().at(-1);
  const period = parseQuarterKey(comparisonQuarterKey);
  if (!period) throw new Error('Unable to determine a legacy comparison quarter.');

  const legacyRows = allLegacyRows.filter((row) => row.quarterKey === comparisonQuarterKey);
  const legacyAddresses = [...new Set(legacyRows.map((row) => row.address).filter((value) => value !== '(Blank)'))];
  const costElements = [...new Set(allLegacyRows.map((row) => row.costElement).filter(Boolean))];

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
    archibusQuery ? pool.request().query(archibusQuery).catch(() => ({ recordset: [] })) : Promise.resolve({ recordset: [] }),
    rosterQuery ? pool.request().query(rosterQuery).catch(() => ({ recordset: [] })) : Promise.resolve({ recordset: [] })
  ]);

  const archibusMap = buildKeyMap(archibusResult.recordset, legacyAddresses);
  const rosterMap = buildKeyMap(rosterResult.recordset, legacyAddresses);
  const combinedMap = buildCombinedMap(archibusMap.mapped, rosterMap.mapped);

  const sourceRows = [
    buildSourceSummary('rpt.rb_archibus', archibusMap, legacyRows, freshRows),
    buildSourceSummary('dbo.src_ng_nonsensitive_roster', rosterMap, legacyRows, freshRows),
    buildSourceSummary('Combined unique matches', combinedMap, legacyRows, freshRows)
  ].sort((a, b) => b.legacyCoveredShare - a.legacyCoveredShare || Math.abs(b.freshExactGlCost) - Math.abs(a.freshExactGlCost));

  const archAlignment = buildAlignment(legacyRows, freshRows, archibusMap.mapped);
  const rosterAlignment = buildAlignment(legacyRows, freshRows, rosterMap.mapped);
  const combinedAlignment = buildAlignment(legacyRows, freshRows, combinedMap.mapped);
  const best = sourceRows[0];
  const bestAlignment = best.source === 'rpt.rb_archibus'
    ? archAlignment
    : best.source === 'dbo.src_ng_nonsensitive_roster' ? rosterAlignment : combinedAlignment;

  const freshDivisionRows = buildFreshDivisionTotals(freshRows);
  const divisionReconciliationRows = buildDivisionReconciliation(
    freshDivisionRows,
    archAlignment.alignmentRows,
    rosterAlignment.alignmentRows,
    combinedAlignment.alignmentRows
  );

  return {
    comparisonQuarterKey,
    legacyCost: legacyRows.reduce((sum, row) => sum + row.cost, 0),
    freshRawNonLaborCost: freshRows.reduce((sum, row) => sum + row.rawNonLaborCost, 0),
    freshExactGlCost: freshRows.reduce((sum, row) => sum + row.exactGlCost, 0),
    bestSource: best.source,
    bestMatchedAddressCount: best.matchedLegacyAddressCount,
    legacyAddressCount: best.legacyAddressCount,
    bestLegacyCoveredCost: best.legacyCoveredCost,
    bestLegacyCoveredShare: best.legacyCoveredShare,
    bestFreshExactGlCost: best.freshExactGlCost,
    sourceRows: sourceRows.map(({ keyMap, ...row }) => row),
    divisionReconciliationRows,
    archibusDivisionRows: buildDivisionEstimate(archAlignment.alignmentRows),
    rosterDivisionRows: buildDivisionEstimate(rosterAlignment.alignmentRows),
    postingClueRows: buildPostingClues(legacyRows, archAlignment.alignmentRows, rosterAlignment.alignmentRows).slice(0, 15),
    alignmentRows: bestAlignment.alignmentRows.slice(0, 15),
    unmatchedRows: combinedAlignment.unmatchedRows.slice(0, 15)
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

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});
const countFormatter = new Intl.NumberFormat('en-US');
const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function money(value) {
  return currencyFormatter.format(number(value));
}
function count(value) {
  return countFormatter.format(number(value));
}
function pct(value) {
  return percentFormatter.format(number(value));
}

export function renderDbmDiagnosticsFastPage(payload) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DBM Diagnostics — Fast Facility Test</title>
  <style>
    :root { color-scheme: dark; font-family: Arial, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #111827; color: #f3f4f6; font-size: 13px; }
    main { width: min(980px, calc(100% - 24px)); margin: 12px auto 40px; }
    section { margin-bottom: 12px; padding: 12px; border: 1px solid #374151; border-radius: 10px; background: #1f2937; }
    h1 { margin: 0 0 8px; font-size: 21px; }
    h2 { margin: 14px 0 7px; font-size: 15px; }
    p { margin: 0 0 9px; }
    .note { padding: 8px; border-radius: 7px; background: #111827; color: #d1d5db; line-height: 1.35; }
    .buttons { display: flex; gap: 7px; margin-bottom: 10px; }
    .button { padding: 6px 9px; border: 1px solid #4b5563; border-radius: 999px; color: white; text-decoration: none; font-size: 11px; font-weight: 700; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
    .card { min-width: 0; padding: 8px; border: 1px solid #374151; border-radius: 8px; background: #111827; }
    .card span { display: block; color: #9ca3af; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
    .card strong { display: block; margin-top: 4px; overflow-wrap: anywhere; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
    th, td { padding: 6px; border: 1px solid #374151; text-align: left; vertical-align: top; white-space: normal; overflow-wrap: anywhere; }
    th { background: #28223c; }
    tbody tr:nth-child(even) { background: #182231; }
    .ws { background: rgba(245, 158, 11, .12) !important; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    @media (max-width: 760px) { .cards { grid-template-columns: repeat(2, 1fr); } main { width: calc(100% - 12px); } }
  </style>
</head>
<body>
<main>
  <section>
    <h1>DBM Diagnostics — Fast Facility Test</h1>
    <div class="buttons"><a class="button" href="/dbm-diagnostics">Refresh</a><a class="button" href="/dbm-diagnostics-full">Full / Slow Diagnostics</a></div>
    <p class="note">Fast path: one transaction-table scan for ${escapeHtml(payload.comparisonQuarterKey)} only. Archibus and roster lookups are restricted to cost centers returned by that scan. The new tables below reuse the same data — they add no extra DB scans.</p>
    <div class="cards">
      <div class="card"><span>Comparison quarter</span><strong>${escapeHtml(payload.comparisonQuarterKey)}</strong></div>
      <div class="card"><span>Legacy cost</span><strong>${money(payload.legacyCost)}</strong></div>
      <div class="card"><span>Fresh raw non-labor</span><strong>${money(payload.freshRawNonLaborCost)}</strong></div>
      <div class="card"><span>Fresh exact legacy GLs</span><strong>${money(payload.freshExactGlCost)}</strong></div>
      <div class="card"><span>Best facility source</span><strong>${escapeHtml(payload.bestSource)}</strong></div>
      <div class="card"><span>Legacy addresses matched</span><strong>${count(payload.bestMatchedAddressCount)} / ${count(payload.legacyAddressCount)}</strong></div>
      <div class="card"><span>Legacy $ covered</span><strong>${money(payload.bestLegacyCoveredCost)} · ${pct(payload.bestLegacyCoveredShare)}</strong></div>
      <div class="card"><span>Fresh exact-GL at matched facilities</span><strong>${money(payload.bestFreshExactGlCost)}</strong></div>
    </div>

    <h2>Facility Source Comparison</h2>
    <table>
      <thead><tr><th>Source</th><th>Mapped CCs</th><th>Ambiguous / conflicts</th><th>Addresses</th><th>Legacy $ covered</th><th>Fresh exact-GL</th></tr></thead>
      <tbody>${payload.sourceRows.map((row) => `<tr>
        <td class="mono">${escapeHtml(row.source)}</td><td>${count(row.mappedCostCenterCount)}</td><td>${count(row.ambiguousCostCenterCount)}</td>
        <td>${count(row.matchedLegacyAddressCount)} / ${count(row.legacyAddressCount)}</td><td>${money(row.legacyCoveredCost)} · ${pct(row.legacyCoveredShare)}</td><td>${money(row.freshExactGlCost)}</td>
      </tr>`).join('')}</tbody>
    </table>

    <h2>Division Reconciliation — WS Check</h2>
    <p class="note">Fresh columns are exact Q1 transaction totals. Legacy columns assign old-report facility dollars only when that facility maps cleanly to one division under each source. Weapon Systems is forced to the top.</p>
    <table>
      <thead><tr><th>Division</th><th>Fresh raw non-labor</th><th>Fresh exact legacy GLs</th><th>Legacy via Archibus</th><th>Legacy via roster</th><th>Legacy via combined</th></tr></thead>
      <tbody>${payload.divisionReconciliationRows.map((row) => `<tr class="${/weapon systems/i.test(row.division) ? 'ws' : ''}">
        <td>${escapeHtml(row.division)}</td><td>${money(row.freshRawNonLaborCost)}</td><td>${money(row.freshExactGlCost)}</td>
        <td>${money(row.archibusLegacyCost)}</td><td>${money(row.rosterLegacyCost)}</td><td>${money(row.combinedLegacyCost)}</td>
      </tr>`).join('')}</tbody>
    </table>

    <h2>Posting-Cost-Center Clue — Archibus vs Roster</h2>
    <p class="note">This is the next test. If roster carries meaningful exact-GL dollars at a legacy facility while Archibus is near zero, that is evidence the employee/Archibus cost center is not the posting cost center. It tells us where to chase the allocation bridge next without another transaction scan.</p>
    <table>
      <thead><tr><th>Legacy facility</th><th>Legacy cost</th><th>Archibus exact GL</th><th>Roster exact GL</th><th>Archibus division</th><th>Roster division</th></tr></thead>
      <tbody>${payload.postingClueRows.map((row) => `<tr>
        <td>${escapeHtml(row.address)}</td><td>${money(row.legacyCost)}</td><td>${money(row.archExact)}</td><td>${money(row.rosterExact)}</td>
        <td>${escapeHtml(row.archDivisions.join(', ') || '—')}</td><td>${escapeHtml(row.rosterDivisions.join(', ') || '—')}</td>
      </tr>`).join('')}</tbody>
    </table>

    <h2>Facility Alignment — Top 15 Legacy Facilities (${escapeHtml(payload.bestSource)})</h2>
    <table>
      <thead><tr><th>Legacy address</th><th>Legacy cost</th><th>Fresh exact GL</th><th>Fresh raw non-labor</th><th>Mapped CCs</th><th>Division(s)</th><th>Fresh location</th></tr></thead>
      <tbody>${payload.alignmentRows.map((row) => `<tr>
        <td>${escapeHtml(row.address)}</td><td>${money(row.legacyCost)}</td><td>${money(row.freshExactGlCost)}</td><td>${money(row.freshRawNonLaborCost)}</td>
        <td>${count(row.costCenterCount)}</td><td>${escapeHtml(row.divisions.join(', ') || '—')}</td><td>${escapeHtml(row.example || '—')}</td>
      </tr>`).join('')}</tbody>
    </table>

    <h2>Largest Legacy Facilities Still Unmatched by Either Source</h2>
    <table><thead><tr><th>Legacy address</th><th>Legacy cost</th></tr></thead><tbody>${payload.unmatchedRows.map((row) => `<tr><td>${escapeHtml(row.address)}</td><td>${money(row.legacyCost)}</td></tr>`).join('')}</tbody></table>
  </section>
</main>
</body>
</html>`;
}
