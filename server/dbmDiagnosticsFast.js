import { readControllableCostsData } from './controllableCostsRepository.js';
import { getConnectionConfig, getPool } from './sqlConnection.js';

const MAX_ALLOCATION_FOCUS = 450;
const MAX_ALLOCATION_ROWS = 5000;
const MAX_LINKED_LOOKUPS = 1000;

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
  const quarter = Number(match[2]);
  return {
    year: Number(match[1]),
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
  if (legacyNumbers.length && candidateNumbers.size && !legacyNumbers.some((value) => candidateNumbers.has(value))) return 0;

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
  return { ambiguous: false, address: ranked[0].address, score: ranked[0].score, candidateFacility };
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlList(values) {
  return values.map(sqlString).join(',');
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
  SUM(CASE WHEN LTRIM(RTRIM(t.ACCT_LEVEL02_TEXT)) = 'NGRB Indirect Non Labor CEG'
    THEN TRY_CONVERT(decimal(18,2), t.KSL) ELSE 0 END) AS raw_nonlabor_cost,
  SUM(CASE WHEN ${glPredicate}
    THEN TRY_CONVERT(decimal(18,2), t.KSL) ELSE 0 END) AS exact_gl_cost
FROM src.rb_CVG_Transaction_Details_03 t
JOIN CostCenterHierarchy h
  ON LTRIM(RTRIM(t.RCNTR)) = h.cost_center
 AND h.rn = 1
WHERE TRY_CONVERT(int, t.GJAHR) = ${period.year}
  AND TRY_CONVERT(int, t.POPER) BETWEEN ${period.firstMonth} AND ${period.lastMonth}
  AND TRY_CONVERT(decimal(18,2), t.KSL) IS NOT NULL
  AND (LTRIM(RTRIM(t.ACCT_LEVEL02_TEXT)) = 'NGRB Indirect Non Labor CEG' OR ${glPredicate})
GROUP BY h.division, UPPER(LTRIM(RTRIM(t.RCNTR)));
`;
}

function buildArchibusQuery(costCenters) {
  if (!costCenters.length) return null;
  const list = sqlList(costCenters);
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
  const list = sqlList(costCenters);
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

function buildRemsQuery(costCenters) {
  if (!costCenters.length) return null;
  const list = sqlList(costCenters);
  return `
SELECT
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), COST_CENTER)))) AS cost_center,
  NULLIF(CONCAT_WS(' | ',
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), ADDRESS))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), BLDG_NAME))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), CITY))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), STATE))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), BLDG_FACID))), '')
  ), '') AS facility
FROM src.rb_lvw_fdw_rems_buildings
WHERE UPPER(LTRIM(RTRIM(CONVERT(varchar(100), COST_CENTER)))) IN (${list})
GROUP BY
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), COST_CENTER)))),
  NULLIF(CONCAT_WS(' | ',
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), ADDRESS))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), BLDG_NAME))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), CITY))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), STATE))), ''),
    NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), BLDG_FACID))), '')
  ), '');
`;
}

function buildHierarchyQuery(costCenters) {
  if (!costCenters.length) return null;
  const list = sqlList(costCenters);
  return `
WITH Ranked AS (
  SELECT
    UPPER(LTRIM(RTRIM(COST_CENTER))) AS cost_center,
    COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS division,
    COALESCE(NULLIF(LTRIM(RTRIM(LEV04_DESC)), ''), 'Unmapped') AS business_unit,
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
      ORDER BY last_modified_date DESC, created_date DESC, id DESC
    ) AS rn
  FROM rpt.rb_load_cost_center_hierarchy
  WHERE UPPER(LTRIM(RTRIM(COST_CENTER))) IN (${list})
)
SELECT cost_center, division, business_unit FROM Ranked WHERE rn = 1;
`;
}

const ALLOCATION_SOURCES = [
  {
    name: 'dbo.rb_Allocation_staging_Capture_SAP',
    build: (list) => `
SELECT TOP (${MAX_ALLOCATION_ROWS})
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), RCNTR)))) AS rcntr,
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), UKOSTL)))) AS ukostl,
  NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), Allocation))), '') AS allocation_name,
  NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), ERP_Allocation_Reference))), '') AS allocation_reference,
  NULLIF(LTRIM(RTRIM(CONVERT(varchar(150), Facility_Type))), '') AS facility_type
FROM dbo.rb_Allocation_staging_Capture_SAP
WHERE UPPER(LTRIM(RTRIM(CONVERT(varchar(100), RCNTR)))) IN (${list})
   OR UPPER(LTRIM(RTRIM(CONVERT(varchar(100), UKOSTL)))) IN (${list});`
  },
  {
    name: 'dbo.rb_lvw_allocation_staging_ukostl',
    build: (list) => `
SELECT TOP (${MAX_ALLOCATION_ROWS})
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), RCNTR)))) AS rcntr,
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), UKOSTL)))) AS ukostl,
  NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), Allocations))), '') AS allocation_name,
  NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), ERP_Allocation_Reference))), '') AS allocation_reference,
  CAST(NULL AS varchar(150)) AS facility_type
FROM dbo.rb_lvw_allocation_staging_ukostl
WHERE UPPER(LTRIM(RTRIM(CONVERT(varchar(100), RCNTR)))) IN (${list})
   OR UPPER(LTRIM(RTRIM(CONVERT(varchar(100), UKOSTL)))) IN (${list});`
  },
  {
    name: 'dbo.rb_Allocation_staging_ukostl',
    build: (list) => `
SELECT TOP (${MAX_ALLOCATION_ROWS})
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), RCNTR)))) AS rcntr,
  UPPER(LTRIM(RTRIM(CONVERT(varchar(100), UKOSTL)))) AS ukostl,
  NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), Allocations))), '') AS allocation_name,
  NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), ERP_Allocation_Reference))), '') AS allocation_reference,
  CAST(NULL AS varchar(150)) AS facility_type
FROM dbo.rb_Allocation_staging_ukostl
WHERE UPPER(LTRIM(RTRIM(CONVERT(varchar(100), RCNTR)))) IN (${list})
   OR UPPER(LTRIM(RTRIM(CONVERT(varchar(100), UKOSTL)))) IN (${list});`
  }
];

async function runQuery(pool, name, query) {
  if (!query) return { name, rows: [], error: 'No cost centers to test.' };
  try {
    const result = await pool.request().query(query);
    return { name, rows: result.recordset ?? [], error: null };
  } catch (error) {
    return { name, rows: [], error: error.message };
  }
}

function buildKeyMap(rows, legacyAddresses, source) {
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
      if (!previous || match.score > previous.score) addressMatches.set(match.address, { ...match, source });
    });
    if (addressMatches.size === 1 && !ambiguous) mapped.set(costCenter, [...addressMatches.values()][0]);
    else if (addressMatches.size > 1 || ambiguous) ambiguousCostCenterCount += 1;
  });

  return { mapped, ambiguousCostCenterCount };
}

function buildCombinedMap(mapResults) {
  const combined = new Map();
  let conflicts = 0;
  const costCenters = new Set(mapResults.flatMap((result) => [...result.mapped.keys()]));
  costCenters.forEach((costCenter) => {
    const candidates = mapResults.map((result) => result.mapped.get(costCenter)).filter(Boolean);
    const addresses = new Set(candidates.map((row) => row.address));
    if (addresses.size !== 1) {
      if (addresses.size > 1) conflicts += 1;
      return;
    }
    candidates.sort((a, b) => b.score - a.score);
    combined.set(costCenter, candidates[0]);
  });
  return { mapped: combined, ambiguousCostCenterCount: conflicts };
}

function buildSourceSummary(name, mapResult, legacyRows, freshRows, error = null) {
  const matchedAddresses = new Set([...mapResult.mapped.values()].map((row) => row.address));
  const coveredLegacyRows = legacyRows.filter((row) => matchedAddresses.has(row.address));
  const legacyAbsTotal = legacyRows.reduce((sum, row) => sum + Math.abs(row.cost), 0);
  const legacyCoveredAbs = coveredLegacyRows.reduce((sum, row) => sum + Math.abs(row.cost), 0);
  const mappedFresh = freshRows.filter((row) => mapResult.mapped.has(row.costCenter));
  return {
    source: name,
    error,
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
      address: row.address, legacyCost: 0, freshExactGlCost: 0, freshRawNonLaborCost: 0,
      costCenters: new Set(), divisions: new Set(), examples: new Set(), scores: []
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
      matchQuality: row.scores.length ? row.scores.reduce((sum, value) => sum + value, 0) / row.scores.length : 0,
      example: [...row.examples][0] ?? ''
    }))
    .sort((a, b) => Math.abs(b.legacyCost) - Math.abs(a.legacyCost));

  const unmatchedRows = [...groups.values()]
    .filter((row) => !matchedAddresses.has(row.address))
    .map((row) => ({ address: row.address, legacyCost: row.legacyCost }))
    .sort((a, b) => Math.abs(b.legacyCost) - Math.abs(a.legacyCost));
  return { alignmentRows, unmatchedRows };
}

function singleDivisionLegacy(alignmentRows) {
  const totals = new Map();
  alignmentRows.forEach((row) => {
    if (row.divisions.length !== 1) return;
    totals.set(row.divisions[0], (totals.get(row.divisions[0]) ?? 0) + row.legacyCost);
  });
  return totals;
}

function buildFreshDivisionTotals(freshRows) {
  const groups = new Map();
  freshRows.forEach((row) => {
    const group = groups.get(row.division) ?? { division: row.division, rawNonLaborCost: 0, exactGlCost: 0, costCenters: new Set() };
    group.rawNonLaborCost += row.rawNonLaborCost;
    group.exactGlCost += row.exactGlCost;
    group.costCenters.add(row.costCenter);
    groups.set(row.division, group);
  });
  return [...groups.values()].map((row) => ({ ...row, costCenterCount: row.costCenters.size }));
}

function buildDivisionReconciliation(freshRows, sourceAlignments) {
  const freshDivisionRows = buildFreshDivisionTotals(freshRows);
  const legacyMaps = sourceAlignments.map(({ name, rows }) => ({ name, totals: singleDivisionLegacy(rows) }));
  const divisions = new Set(freshDivisionRows.map((row) => row.division));
  legacyMaps.forEach(({ totals }) => totals.forEach((_value, division) => divisions.add(division)));
  const freshByDivision = new Map(freshDivisionRows.map((row) => [row.division, row]));
  return [...divisions].map((division) => {
    const fresh = freshByDivision.get(division);
    const legacy = Object.fromEntries(legacyMaps.map(({ name, totals }) => [name, totals.get(division) ?? 0]));
    return {
      division,
      freshRawNonLaborCost: fresh?.rawNonLaborCost ?? 0,
      freshExactGlCost: fresh?.exactGlCost ?? 0,
      ...legacy
    };
  }).sort((a, b) => {
    const wsA = /weapon systems/i.test(a.division) ? -1 : 0;
    const wsB = /weapon systems/i.test(b.division) ? -1 : 0;
    return wsA - wsB || Math.abs(b.combinedLegacyCost ?? 0) - Math.abs(a.combinedLegacyCost ?? 0);
  });
}

function buildPostingClues(legacyRows, archAlignment, rosterAlignment, remsAlignment) {
  const legacyByAddress = new Map();
  legacyRows.forEach((row) => legacyByAddress.set(row.address, (legacyByAddress.get(row.address) ?? 0) + row.cost));
  const sources = [
    ['Archibus', new Map(archAlignment.map((row) => [row.address, row]))],
    ['Roster', new Map(rosterAlignment.map((row) => [row.address, row]))],
    ['REMS', new Map(remsAlignment.map((row) => [row.address, row]))]
  ];
  const addresses = new Set(sources.flatMap(([, rows]) => [...rows.keys()]));
  return [...addresses].map((address) => {
    const result = { address, legacyCost: legacyByAddress.get(address) ?? 0 };
    sources.forEach(([name, rows]) => {
      const row = rows.get(address);
      result[`${name.toLowerCase()}Exact`] = row?.freshExactGlCost ?? 0;
      result[`${name.toLowerCase()}Divisions`] = row?.divisions ?? [];
    });
    return result;
  }).sort((a, b) => {
    const clueA = Math.max(Math.abs(a.archibusExact), Math.abs(a.rosterExact), Math.abs(a.remsExact));
    const clueB = Math.max(Math.abs(b.archibusExact), Math.abs(b.rosterExact), Math.abs(b.remsExact));
    return clueB - clueA || Math.abs(b.legacyCost) - Math.abs(a.legacyCost);
  });
}

function selectAllocationFocus(freshRows) {
  const selected = new Map();
  freshRows.filter((row) => /weapon systems/i.test(row.division)).forEach((row) => selected.set(row.costCenter, row));
  freshRows.filter((row) => Math.abs(row.exactGlCost) > 0)
    .sort((a, b) => Math.abs(b.exactGlCost) - Math.abs(a.exactGlCost))
    .slice(0, 300).forEach((row) => selected.set(row.costCenter, row));
  freshRows.slice().sort((a, b) => Math.abs(b.rawNonLaborCost) - Math.abs(a.rawNonLaborCost))
    .slice(0, 100).forEach((row) => selected.set(row.costCenter, row));
  return [...selected.values()].slice(0, MAX_ALLOCATION_FOCUS);
}

function normalizeAllocationRows(result) {
  return result.rows.map((row) => ({
    source: result.name,
    rcntr: normalizeCostCenter(row.rcntr),
    ukostl: normalizeCostCenter(row.ukostl),
    allocationName: text(row.allocation_name),
    allocationReference: text(row.allocation_reference),
    facilityType: text(row.facility_type)
  })).filter((row) => row.rcntr || row.ukostl);
}

function topConnectedCostCenters(allocationResults, focusSet) {
  const counts = new Map();
  allocationResults.forEach((result) => normalizeAllocationRows(result).forEach((row) => {
    [row.rcntr, row.ukostl].filter(Boolean).forEach((cc) => {
      if (!focusSet.has(cc)) counts.set(cc, (counts.get(cc) ?? 0) + 1);
    });
  }));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_LINKED_LOOKUPS).map(([cc]) => cc);
}

function pickBestLinkedMap(mapResults) {
  const output = new Map();
  const priority = { 'src.rb_lvw_fdw_rems_buildings': 0.03, 'dbo.src_ng_nonsensitive_roster': 0.02, 'rpt.rb_archibus': 0.01 };
  const costCenters = new Set(mapResults.flatMap((result) => [...result.mapped.keys()]));
  costCenters.forEach((costCenter) => {
    const candidates = mapResults.map((result) => result.mapped.get(costCenter)).filter(Boolean)
      .sort((a, b) => (b.score + (priority[b.source] ?? 0)) - (a.score + (priority[a.source] ?? 0)));
    if (candidates.length) output.set(costCenter, candidates[0]);
  });
  return output;
}

function buildAllocationDiagnostics(allocationResults, focusRows, linkedFacilityMap, hierarchyMap, legacyRows) {
  const focusByCc = new Map(focusRows.map((row) => [row.costCenter, row]));
  const focusSet = new Set(focusByCc.keys());
  const legacyCostByAddress = new Map();
  legacyRows.forEach((row) => legacyCostByAddress.set(row.address, (legacyCostByAddress.get(row.address) ?? 0) + row.cost));

  const bridgeRows = [];
  const sourceRows = allocationResults.map((result) => {
    const rows = normalizeAllocationRows(result);
    const touched = new Set();
    const linked = new Set();
    const matchedAddresses = new Set();
    let wsLinks = 0;

    rows.forEach((row) => {
      const directions = [];
      if (row.rcntr && focusSet.has(row.rcntr) && row.ukostl && row.ukostl !== row.rcntr) directions.push([row.rcntr, row.ukostl, 'RCNTR → UKOSTL']);
      if (row.ukostl && focusSet.has(row.ukostl) && row.rcntr && row.rcntr !== row.ukostl) directions.push([row.ukostl, row.rcntr, 'UKOSTL → RCNTR']);
      directions.forEach(([postingCc, linkedCc, direction]) => {
        touched.add(postingCc);
        linked.add(linkedCc);
        const posting = focusByCc.get(postingCc);
        const linkedFacility = linkedFacilityMap.get(linkedCc);
        const linkedHierarchy = hierarchyMap.get(linkedCc);
        if (linkedFacility?.address) matchedAddresses.add(linkedFacility.address);
        if (/weapon systems/i.test(posting?.division ?? '') || /weapon systems/i.test(linkedHierarchy?.division ?? '')) wsLinks += 1;
        bridgeRows.push({
          source: result.name,
          direction,
          postingCc,
          postingDivision: posting?.division ?? '—',
          postingExactGl: posting?.exactGlCost ?? 0,
          linkedCc,
          linkedDivision: linkedHierarchy?.division ?? '—',
          linkedBusinessUnit: linkedHierarchy?.businessUnit ?? '—',
          legacyAddress: linkedFacility?.address ?? '',
          legacyCost: linkedFacility?.address ? (legacyCostByAddress.get(linkedFacility.address) ?? 0) : 0,
          facilitySource: linkedFacility?.source ?? '',
          allocationName: row.allocationName,
          allocationReference: row.allocationReference,
          facilityType: row.facilityType
        });
      });
    });

    return {
      source: result.name,
      status: result.error ? result.error : 'OK',
      rowCount: rows.length,
      focusCostCenterCount: touched.size,
      linkedCostCenterCount: linked.size,
      matchedLegacyAddressCount: matchedAddresses.size,
      wsLinkCount: wsLinks
    };
  });

  const deduped = new Map();
  bridgeRows.forEach((row) => {
    const key = [row.source, row.direction, row.postingCc, row.linkedCc, row.legacyAddress, row.allocationName, row.allocationReference].join('|');
    if (!deduped.has(key)) deduped.set(key, row);
  });
  const rows = [...deduped.values()].sort((a, b) => {
    const matchedA = a.legacyAddress ? -1 : 0;
    const matchedB = b.legacyAddress ? -1 : 0;
    const wsA = /weapon systems/i.test(`${a.postingDivision} ${a.linkedDivision}`) ? -1 : 0;
    const wsB = /weapon systems/i.test(`${b.postingDivision} ${b.linkedDivision}`) ? -1 : 0;
    return matchedA - matchedB || wsA - wsB || Math.abs(b.postingExactGl) - Math.abs(a.postingExactGl);
  });
  return { sourceRows, bridgeRows: rows.slice(0, 30) };
}

export async function readDbmDiagnosticsFast() {
  const { config, missing } = getConnectionConfig('dbm');
  if (missing.length) throw new Error(`DBM configuration is incomplete: ${missing.join(', ')}`);
  const pool = await getPool(config, 'dbm');
  const oldPayload = await readControllableCostsData();

  const allLegacyRows = (oldPayload?.rows ?? [])
    .map((row) => ({ quarterKey: legacyQuarterKey(row), address: text(row.address, '(Blank)'), costElement: normalizeCostElement(row.cost_element), cost: number(row.cost) }))
    .filter((row) => row.quarterKey && Number.isFinite(row.cost));
  const comparisonQuarterKey = [...new Set(allLegacyRows.map((row) => row.quarterKey))].sort().at(-1);
  const period = parseQuarterKey(comparisonQuarterKey);
  if (!period) throw new Error('Unable to determine a legacy comparison quarter.');

  const legacyRows = allLegacyRows.filter((row) => row.quarterKey === comparisonQuarterKey);
  const legacyAddresses = [...new Set(legacyRows.map((row) => row.address).filter((value) => value !== '(Blank)'))];
  const costElements = [...new Set(allLegacyRows.map((row) => row.costElement).filter(Boolean))];

  // Only expensive transaction scan on the fast page.
  const freshResult = await pool.request().query(buildFreshQuarterQuery(period, costElements));
  const freshRows = freshResult.recordset.map((row) => ({
    division: text(row.division, 'Unmapped'),
    costCenter: normalizeCostCenter(row.cost_center),
    rawNonLaborCost: number(row.raw_nonlabor_cost),
    exactGlCost: number(row.exact_gl_cost)
  })).filter((row) => row.costCenter);

  const costCenters = [...new Set(freshRows.map((row) => row.costCenter))];
  const directLookups = await Promise.all([
    runQuery(pool, 'rpt.rb_archibus', buildArchibusQuery(costCenters)),
    runQuery(pool, 'dbo.src_ng_nonsensitive_roster', buildRosterQuery(costCenters)),
    runQuery(pool, 'src.rb_lvw_fdw_rems_buildings', buildRemsQuery(costCenters))
  ]);

  const archibusMap = buildKeyMap(directLookups[0].rows, legacyAddresses, directLookups[0].name);
  const rosterMap = buildKeyMap(directLookups[1].rows, legacyAddresses, directLookups[1].name);
  const remsMap = buildKeyMap(directLookups[2].rows, legacyAddresses, directLookups[2].name);
  const combinedMap = buildCombinedMap([archibusMap, rosterMap, remsMap]);

  const sourceRows = [
    buildSourceSummary('rpt.rb_archibus', archibusMap, legacyRows, freshRows, directLookups[0].error),
    buildSourceSummary('dbo.src_ng_nonsensitive_roster', rosterMap, legacyRows, freshRows, directLookups[1].error),
    buildSourceSummary('src.rb_lvw_fdw_rems_buildings', remsMap, legacyRows, freshRows, directLookups[2].error),
    buildSourceSummary('Combined non-conflicting', combinedMap, legacyRows, freshRows)
  ].sort((a, b) => b.legacyCoveredShare - a.legacyCoveredShare || Math.abs(b.freshExactGlCost) - Math.abs(a.freshExactGlCost));

  const archAlignment = buildAlignment(legacyRows, freshRows, archibusMap.mapped);
  const rosterAlignment = buildAlignment(legacyRows, freshRows, rosterMap.mapped);
  const remsAlignment = buildAlignment(legacyRows, freshRows, remsMap.mapped);
  const combinedAlignment = buildAlignment(legacyRows, freshRows, combinedMap.mapped);
  const best = sourceRows.find((row) => !row.error) ?? sourceRows[0];
  const bestAlignment = best.source === 'rpt.rb_archibus' ? archAlignment
    : best.source === 'dbo.src_ng_nonsensitive_roster' ? rosterAlignment
      : best.source === 'src.rb_lvw_fdw_rems_buildings' ? remsAlignment : combinedAlignment;

  const divisionReconciliationRows = buildDivisionReconciliation(freshRows, [
    { name: 'archibusLegacyCost', rows: archAlignment.alignmentRows },
    { name: 'rosterLegacyCost', rows: rosterAlignment.alignmentRows },
    { name: 'remsLegacyCost', rows: remsAlignment.alignmentRows },
    { name: 'combinedLegacyCost', rows: combinedAlignment.alignmentRows }
  ]);

  // Allocation bridge: only a bounded sample of the most informative Q1 posting cost centers.
  const focusRows = selectAllocationFocus(freshRows);
  const focusCostCenters = focusRows.map((row) => row.costCenter);
  const focusList = sqlList(focusCostCenters);
  const allocationResults = await Promise.all(ALLOCATION_SOURCES.map((source) => runQuery(pool, source.name, source.build(focusList))));
  const focusSet = new Set(focusCostCenters);
  const linkedCostCenters = topConnectedCostCenters(allocationResults, focusSet);

  const linkedLookups = await Promise.all([
    runQuery(pool, 'rpt.rb_archibus', buildArchibusQuery(linkedCostCenters)),
    runQuery(pool, 'dbo.src_ng_nonsensitive_roster', buildRosterQuery(linkedCostCenters)),
    runQuery(pool, 'src.rb_lvw_fdw_rems_buildings', buildRemsQuery(linkedCostCenters)),
    runQuery(pool, 'hierarchy', buildHierarchyQuery(linkedCostCenters))
  ]);
  const linkedMaps = [
    buildKeyMap(linkedLookups[0].rows, legacyAddresses, linkedLookups[0].name),
    buildKeyMap(linkedLookups[1].rows, legacyAddresses, linkedLookups[1].name),
    buildKeyMap(linkedLookups[2].rows, legacyAddresses, linkedLookups[2].name)
  ];
  const linkedFacilityMap = pickBestLinkedMap(linkedMaps);
  const hierarchyMap = new Map(linkedLookups[3].rows.map((row) => [normalizeCostCenter(row.cost_center), {
    division: text(row.division, 'Unmapped'), businessUnit: text(row.business_unit, 'Unmapped')
  }]));
  const allocationDiagnostics = buildAllocationDiagnostics(allocationResults, focusRows, linkedFacilityMap, hierarchyMap, legacyRows);

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
    postingClueRows: buildPostingClues(legacyRows, archAlignment.alignmentRows, rosterAlignment.alignmentRows, remsAlignment.alignmentRows).slice(0, 15),
    allocationFocusCostCenterCount: focusCostCenters.length,
    linkedCostCenterCount: linkedCostCenters.length,
    allocationSourceRows: allocationDiagnostics.sourceRows,
    allocationBridgeRows: allocationDiagnostics.bridgeRows,
    alignmentRows: bestAlignment.alignmentRows.slice(0, 12),
    unmatchedRows: combinedAlignment.unmatchedRows.slice(0, 12)
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const countFormatter = new Intl.NumberFormat('en-US');
const percentFormatter = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
function money(value) { return currencyFormatter.format(number(value)); }
function count(value) { return countFormatter.format(number(value)); }
function pct(value) { return percentFormatter.format(number(value)); }

export function renderDbmDiagnosticsFastPage(payload) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DBM Diagnostics — Fast Facility Test</title>
<style>
:root{color-scheme:dark;font-family:Arial,sans-serif}*{box-sizing:border-box}body{margin:0;background:#111827;color:#f3f4f6;font-size:13px}
main{width:min(960px,calc(100% - 24px));margin:12px auto 40px}section{margin-bottom:12px;padding:12px;border:1px solid #374151;border-radius:10px;background:#1f2937}
h1{margin:0 0 8px;font-size:21px}h2{margin:14px 0 7px;font-size:15px}p{margin:0 0 9px}.note{padding:8px;border-radius:7px;background:#111827;color:#d1d5db;line-height:1.35}
.buttons{display:flex;gap:7px;margin-bottom:10px}.button{padding:6px 9px;border:1px solid #4b5563;border-radius:999px;color:white;text-decoration:none;font-size:11px;font-weight:700}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.card{min-width:0;padding:8px;border:1px solid #374151;border-radius:8px;background:#111827}.card span{display:block;color:#9ca3af;font-size:9px;font-weight:700;text-transform:uppercase}.card strong{display:block;margin-top:4px;overflow-wrap:anywhere;font-size:13px}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5px}th,td{padding:5px;border:1px solid #374151;text-align:left;vertical-align:top;white-space:normal;overflow-wrap:anywhere}th{background:#28223c}tbody tr:nth-child(even){background:#182231}.ws{background:rgba(245,158,11,.12)!important}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.error{color:#fca5a5;font-weight:700}
@media(max-width:760px){.cards{grid-template-columns:repeat(2,1fr)}main{width:calc(100% - 12px)}}
</style></head><body><main><section>
<h1>DBM Diagnostics — Fast Facility / Allocation Test</h1>
<div class="buttons"><a class="button" href="/dbm-diagnostics">Refresh</a><a class="button" href="/dbm-diagnostics-full">Full / Slow Diagnostics</a></div>
<p class="note">Fast path: one transaction-table scan for ${escapeHtml(payload.comparisonQuarterKey)}. The allocation tests below use only a bounded sample of ${count(payload.allocationFocusCostCenterCount)} informative posting cost centers and then query small mapping/allocation tables; they do not rescan transaction detail.</p>
<div class="cards">
<div class="card"><span>Comparison quarter</span><strong>${escapeHtml(payload.comparisonQuarterKey)}</strong></div><div class="card"><span>Legacy cost</span><strong>${money(payload.legacyCost)}</strong></div>
<div class="card"><span>Fresh raw non-labor</span><strong>${money(payload.freshRawNonLaborCost)}</strong></div><div class="card"><span>Fresh exact legacy GLs</span><strong>${money(payload.freshExactGlCost)}</strong></div>
<div class="card"><span>Best facility source</span><strong>${escapeHtml(payload.bestSource)}</strong></div><div class="card"><span>Legacy addresses matched</span><strong>${count(payload.bestMatchedAddressCount)} / ${count(payload.legacyAddressCount)}</strong></div>
<div class="card"><span>Legacy $ covered</span><strong>${money(payload.bestLegacyCoveredCost)} · ${pct(payload.bestLegacyCoveredShare)}</strong></div><div class="card"><span>Linked CCs tested</span><strong>${count(payload.linkedCostCenterCount)}</strong></div>
</div>

<h2>Facility Source Comparison — REMS Retest Included</h2>
<table><thead><tr><th>Source</th><th>Mapped CCs</th><th>Ambig.</th><th>Addresses</th><th>Legacy $ covered</th><th>Fresh exact GL</th><th>Status</th></tr></thead><tbody>
${payload.sourceRows.map((row)=>`<tr><td class="mono">${escapeHtml(row.source)}</td><td>${count(row.mappedCostCenterCount)}</td><td>${count(row.ambiguousCostCenterCount)}</td><td>${count(row.matchedLegacyAddressCount)} / ${count(row.legacyAddressCount)}</td><td>${money(row.legacyCoveredCost)} · ${pct(row.legacyCoveredShare)}</td><td>${money(row.freshExactGlCost)}</td><td class="${row.error?'error':''}">${escapeHtml(row.error ? row.error.slice(0,120) : 'OK')}</td></tr>`).join('')}
</tbody></table>

<h2>Division Reconciliation — WS Is a Required Legacy Population</h2>
<p class="note">We now know the legacy report intentionally collected every BU, so WS must be present. A source showing $0 legacy WS is a mapping failure, not evidence WS was absent.</p>
<table><thead><tr><th>Division</th><th>Fresh raw non-labor</th><th>Fresh exact legacy GLs</th><th>Legacy Archibus</th><th>Legacy roster</th><th>Legacy REMS</th><th>Legacy combined</th></tr></thead><tbody>
${payload.divisionReconciliationRows.map((row)=>`<tr class="${/weapon systems/i.test(row.division)?'ws':''}"><td>${escapeHtml(row.division)}</td><td>${money(row.freshRawNonLaborCost)}</td><td>${money(row.freshExactGlCost)}</td><td>${money(row.archibusLegacyCost)}</td><td>${money(row.rosterLegacyCost)}</td><td>${money(row.remsLegacyCost)}</td><td>${money(row.combinedLegacyCost)}</td></tr>`).join('')}
</tbody></table>

<h2>Allocation Bridge — Source Coverage</h2>
<p class="note">This checks whether Q1 posting cost centers appear as RCNTR or UKOSTL in the allocation staging objects. The useful signal is a linked cost center that resolves to an old-report facility, especially when either side is Weapon Systems.</p>
<table><thead><tr><th>Allocation source</th><th>Rows sampled</th><th>Posting CCs touched</th><th>Linked CCs</th><th>Old facilities recovered</th><th>WS links</th><th>Status</th></tr></thead><tbody>
${payload.allocationSourceRows.map((row)=>`<tr><td class="mono">${escapeHtml(row.source)}</td><td>${count(row.rowCount)}</td><td>${count(row.focusCostCenterCount)}</td><td>${count(row.linkedCostCenterCount)}</td><td>${count(row.matchedLegacyAddressCount)}</td><td>${count(row.wsLinkCount)}</td><td class="${row.status==='OK'?'':'error'}">${escapeHtml(row.status.slice(0,130))}</td></tr>`).join('')}
</tbody></table>

<h2>Best Allocation → Facility Bridge Candidates</h2>
<table><thead><tr><th>Source / direction</th><th>Posting CC / division</th><th>Q1 exact GL</th><th>Linked CC / division / BU</th><th>Recovered legacy facility</th><th>Legacy Q1</th><th>Allocation clue</th></tr></thead><tbody>
${payload.allocationBridgeRows.map((row)=>`<tr class="${/weapon systems/i.test(`${row.postingDivision} ${row.linkedDivision}`)?'ws':''}"><td class="mono">${escapeHtml(row.source)}<br>${escapeHtml(row.direction)}</td><td class="mono">${escapeHtml(row.postingCc)}<br>${escapeHtml(row.postingDivision)}</td><td>${money(row.postingExactGl)}</td><td class="mono">${escapeHtml(row.linkedCc)}<br>${escapeHtml(row.linkedDivision)}<br>${escapeHtml(row.linkedBusinessUnit)}</td><td>${escapeHtml(row.legacyAddress || '—')}<br><small>${escapeHtml(row.facilitySource || '')}</small></td><td>${row.legacyAddress?money(row.legacyCost):'—'}</td><td>${escapeHtml([row.allocationName,row.allocationReference,row.facilityType].filter(Boolean).join(' | ') || '—')}</td></tr>`).join('') || '<tr><td colspan="7">No allocation bridge candidates recovered.</td></tr>'}
</tbody></table>

<h2>Posting-Cost-Center Clue — Archibus vs Roster vs REMS</h2>
<table><thead><tr><th>Legacy facility</th><th>Legacy cost</th><th>Archibus exact GL</th><th>Roster exact GL</th><th>REMS exact GL</th><th>Roster / REMS division clues</th></tr></thead><tbody>
${payload.postingClueRows.map((row)=>`<tr><td>${escapeHtml(row.address)}</td><td>${money(row.legacyCost)}</td><td>${money(row.archibusExact)}</td><td>${money(row.rosterExact)}</td><td>${money(row.remsExact)}</td><td>${escapeHtml([...new Set([...(row.rosterDivisions||[]),...(row.remsDivisions||[])])].join(', ')||'—')}</td></tr>`).join('')}
</tbody></table>

<h2>Facility Alignment — Top 12 (${escapeHtml(payload.bestSource)})</h2>
<table><thead><tr><th>Legacy address</th><th>Legacy cost</th><th>Fresh exact GL</th><th>Fresh raw non-labor</th><th>Mapped CCs</th><th>Division(s)</th><th>Fresh location</th></tr></thead><tbody>
${payload.alignmentRows.map((row)=>`<tr><td>${escapeHtml(row.address)}</td><td>${money(row.legacyCost)}</td><td>${money(row.freshExactGlCost)}</td><td>${money(row.freshRawNonLaborCost)}</td><td>${count(row.costCenterCount)}</td><td>${escapeHtml(row.divisions.join(', ')||'—')}</td><td>${escapeHtml(row.example||'—')}</td></tr>`).join('')}
</tbody></table>

<h2>Largest Legacy Facilities Still Unmatched</h2>
<table><thead><tr><th>Legacy address</th><th>Legacy cost</th></tr></thead><tbody>${payload.unmatchedRows.map((row)=>`<tr><td>${escapeHtml(row.address)}</td><td>${money(row.legacyCost)}</td></tr>`).join('')}</tbody></table>
</section></main></body></html>`;
}
