import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import { readCostClassificationDiagnostics } from './costClassificationDiagnostics.js';
import { readCostDimensionCoverageDiagnostics } from './costDimensionCoverageDiagnostics.js';
import { classifyFacilityCost } from './costFacilityClassification.js';
import { readControllableCostsData } from './controllableCostsRepository.js';
import { getConnectionConfig, getPool } from './sqlConnection.js';

const DBM_TABLE_CHECKS = [
  {
    name: 'src.rb_CVG_Transaction_Details_03',
    query: `
      SELECT TOP (1)
        TRY_CONVERT(int, source.[GJAHR]) AS [year],
        TRY_CONVERT(int, source.[POPER]) AS [month]
      FROM [src].[rb_CVG_Transaction_Details_03] AS source
      WHERE TRY_CONVERT(int, source.[GJAHR]) IS NOT NULL
        AND TRY_CONVERT(int, source.[POPER]) BETWEEN 1 AND 12
      ORDER BY TRY_CONVERT(int, source.[GJAHR]) DESC, TRY_CONVERT(int, source.[POPER]) DESC;
    `,
    transactionTable: true
  },
  {
    name: 'rpt.rb_load_cost_center_hierarchy',
    query: 'SELECT TOP (0) 1 AS [accessible] FROM [rpt].[rb_load_cost_center_hierarchy];'
  },
  {
    name: 'rpt.rb_archibus',
    query: 'SELECT TOP (0) 1 AS [accessible] FROM [rpt].[rb_archibus];'
  }
];

const LEGACY_FACILITY_SOURCE_TESTS = [
  {
    name: 'src.rb_lvw_fdw_rems_buildings',
    query: `
      SELECT
        UPPER(LTRIM(RTRIM(CONVERT(varchar(100), COST_CENTER)))) AS cost_center,
        NULLIF(CONCAT_WS(' | ',
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), ADDRESS))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), BLDG_NAME))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), BLDG_ID))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), BLDG_FACID))), '')
        ), '') AS facility
      FROM src.rb_lvw_fdw_rems_buildings
      WHERE NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), COST_CENTER))), '') IS NOT NULL
      GROUP BY
        UPPER(LTRIM(RTRIM(CONVERT(varchar(100), COST_CENTER)))),
        NULLIF(CONCAT_WS(' | ',
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), ADDRESS))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), BLDG_NAME))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), BLDG_ID))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), BLDG_FACID))), '')
        ), '');
    `
  },
  {
    name: 'dbo.src_ng_nonsensitive_roster',
    query: `
      SELECT
        UPPER(LTRIM(RTRIM(CONVERT(varchar(100), CostCenter)))) AS cost_center,
        NULLIF(CONCAT_WS(' | ',
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), LocationID))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), LocationName))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), WorkCity))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), WorkStateCode))), '')
        ), '') AS facility
      FROM dbo.src_ng_nonsensitive_roster
      WHERE NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), CostCenter))), '') IS NOT NULL
      GROUP BY
        UPPER(LTRIM(RTRIM(CONVERT(varchar(100), CostCenter)))),
        NULLIF(CONCAT_WS(' | ',
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), LocationID))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), LocationName))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), WorkCity))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), WorkStateCode))), '')
        ), '');
    `
  },
  {
    name: 'rpt.rb_archibus',
    query: `
      SELECT
        UPPER(LTRIM(RTRIM(CONVERT(varchar(100), employee_cost_center)))) AS cost_center,
        NULLIF(CONCAT_WS(' | ',
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), address_1))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), city))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), state))), '')
        ), '') AS facility
      FROM rpt.rb_archibus
      WHERE NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), employee_cost_center))), '') IS NOT NULL
      GROUP BY
        UPPER(LTRIM(RTRIM(CONVERT(varchar(100), employee_cost_center)))),
        NULLIF(CONCAT_WS(' | ',
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(250), address_1))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), city))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), state))), '')
        ), '');
    `
  }
];

const LEGACY_FACILITY_RAW_QUERY = `
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
  TRY_CONVERT(int, t.GJAHR) AS [year],
  TRY_CONVERT(int, t.POPER) AS [month],
  h.division,
  UPPER(LTRIM(RTRIM(t.RCNTR))) AS cost_center,
  SUM(TRY_CONVERT(decimal(18,2), t.KSL)) AS net_cost
FROM src.rb_CVG_Transaction_Details_03 t
JOIN CostCenterHierarchy h
  ON LTRIM(RTRIM(t.RCNTR)) = h.cost_center
 AND h.rn = 1
WHERE TRY_CONVERT(int, t.GJAHR) >= 2025
  AND TRY_CONVERT(int, t.POPER) BETWEEN 1 AND 12
  AND LTRIM(RTRIM(t.ACCT_LEVEL02_TEXT)) = 'NGRB Indirect Non Labor CEG'
  AND TRY_CONVERT(decimal(18,2), t.KSL) IS NOT NULL
GROUP BY
  TRY_CONVERT(int, t.GJAHR),
  TRY_CONVERT(int, t.POPER),
  h.division,
  UPPER(LTRIM(RTRIM(t.RCNTR)));
`;

function getEmptyTableResults(status = 'Not tested') {
  return DBM_TABLE_CHECKS.map(({ name }) => ({ name, accessible: null, status }));
}

function formatLatestMonth(year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return 'None';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

async function runTableCheck(pool, tableCheck) {
  const stopTimer = createTimer();

  try {
    const result = await pool.request().query(tableCheck.query);
    const latestRow = tableCheck.transactionTable ? result.recordset[0] : null;
    const latestYear = Number(latestRow?.year);
    const latestMonth = Number(latestRow?.month);

    logDebug('dbm-diagnostics', 'DBM table access confirmed.', {
      tableName: tableCheck.name,
      duration: formatDuration(stopTimer())
    });

    return {
      name: tableCheck.name,
      accessible: true,
      status: 'Accessible',
      latestYear: Number.isInteger(latestYear) ? latestYear : null,
      latestMonth: Number.isInteger(latestMonth) ? latestMonth : null
    };
  } catch (error) {
    logError('dbm-diagnostics', 'DBM table access check failed.', error, {
      tableName: tableCheck.name,
      duration: formatDuration(stopTimer())
    });

    return {
      name: tableCheck.name,
      accessible: false,
      status: 'Unavailable',
      latestYear: null,
      latestMonth: null
    };
  }
}

function legacyQuarterKey(row) {
  const year = Number(row?.year);
  const match = /^Q([1-4])$/i.exec(String(row?.quarter ?? '').trim());
  return Number.isInteger(year) && match ? `${year}-Q${match[1]}` : null;
}

function freshQuarterKey(year, month) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) return null;
  return `${numericYear}-Q${Math.floor((numericMonth - 1) / 3) + 1}`;
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

function normalizeCostCenter(value) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.toUpperCase() : null;
}

const LOCATION_ALIASES = new Map([
  ['drive', 'dr'], ['dr', 'dr'], ['road', 'rd'], ['rd', 'rd'], ['street', 'st'], ['st', 'st'],
  ['avenue', 'ave'], ['ave', 'ave'], ['boulevard', 'blvd'], ['blvd', 'blvd'], ['highway', 'hwy'], ['hwy', 'hwy'],
  ['lane', 'ln'], ['ln', 'ln'], ['circle', 'cir'], ['cir', 'cir'], ['parkway', 'pkwy'], ['pkwy', 'pkwy'],
  ['north', 'n'], ['south', 's'], ['east', 'e'], ['west', 'w']
]);

function canonicalLocation(value) {
  return String(value ?? '')
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
  if (legacyNumbers.length > 0 && candidateNumbers.size > 0 && !legacyNumbers.some((value) => candidateNumbers.has(value))) {
    return 0;
  }

  const overlap = legacyTokens.filter((token) => candidateTokens.has(token)).length;
  let score = legacyTokens.length > 0 ? overlap / legacyTokens.length : 0;
  if (legacyNumbers.length > 0 && legacyNumbers.some((value) => candidateNumbers.has(value))) score += 0.15;
  return Math.min(score, 0.99);
}

function findLegacyAddressMatch(candidateFacility, legacyAddresses) {
  const ranked = legacyAddresses
    .map((address) => ({ address, score: locationMatchScore(address, candidateFacility) }))
    .filter((row) => row.score >= 0.6)
    .sort((a, b) => b.score - a.score || a.address.localeCompare(b.address));

  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.08 && ranked[0].address !== ranked[1].address) {
    return { ambiguous: true, matches: ranked.slice(0, 3) };
  }
  return {
    ambiguous: false,
    address: ranked[0].address,
    score: ranked[0].score,
    matchType: ranked[0].score >= 0.99 ? 'Exact/contains' : 'Fuzzy'
  };
}

function buildExactLegacyGlQuery(costElements) {
  if (costElements.length === 0) return null;
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
  TRY_CONVERT(int, t.GJAHR) AS [year],
  ((TRY_CONVERT(int, t.POPER) - 1) / 3) + 1 AS [quarter],
  h.division,
  UPPER(LTRIM(RTRIM(t.RCNTR))) AS cost_center,
  SUM(TRY_CONVERT(decimal(18,2), t.KSL)) AS net_cost
FROM src.rb_CVG_Transaction_Details_03 t
JOIN CostCenterHierarchy h
  ON LTRIM(RTRIM(t.RCNTR)) = h.cost_center
 AND h.rn = 1
WHERE TRY_CONVERT(int, t.GJAHR) >= 2025
  AND TRY_CONVERT(int, t.POPER) BETWEEN 1 AND 12
  AND TRY_CONVERT(bigint, t.RACCT) IN (${costElements.join(',')})
  AND TRY_CONVERT(decimal(18,2), t.KSL) IS NOT NULL
GROUP BY
  TRY_CONVERT(int, t.GJAHR),
  ((TRY_CONVERT(int, t.POPER) - 1) / 3) + 1,
  h.division,
  UPPER(LTRIM(RTRIM(t.RCNTR)));
`;
}

async function runLegacyFacilitySourceTest(pool, test) {
  try {
    const result = await pool.request().query(test.query);
    return { name: test.name, rows: result.recordset, error: null };
  } catch (error) {
    return { name: test.name, rows: [], error: error.message };
  }
}

function buildLegacyKeyMap(testRows, legacyAddresses) {
  const facilitiesByCostCenter = new Map();
  testRows.forEach((row) => {
    const costCenter = normalizeCostCenter(row.cost_center);
    const facility = String(row.facility ?? '').trim();
    if (!costCenter || !facility) return;
    const values = facilitiesByCostCenter.get(costCenter) ?? new Set();
    values.add(facility);
    facilitiesByCostCenter.set(costCenter, values);
  });

  const mapped = new Map();
  let ambiguousCostCenters = 0;
  facilitiesByCostCenter.forEach((facilities, costCenter) => {
    const addressMatches = new Map();
    let hadAmbiguousCandidate = false;

    facilities.forEach((facility) => {
      const match = findLegacyAddressMatch(facility, legacyAddresses);
      if (!match) return;
      if (match.ambiguous) {
        hadAmbiguousCandidate = true;
        return;
      }
      const previous = addressMatches.get(match.address);
      if (!previous || match.score > previous.score) {
        addressMatches.set(match.address, {
          address: match.address,
          score: match.score,
          matchType: match.matchType,
          candidateFacility: facility
        });
      }
    });

    if (addressMatches.size === 1) {
      mapped.set(costCenter, [...addressMatches.values()][0]);
    } else if (addressMatches.size > 1 || hadAmbiguousCandidate) {
      ambiguousCostCenters += 1;
    }
  });

  return { mapped, ambiguousCostCenters };
}

function buildLegacyFacilityKeyResult(oldRows, rawRows, exactRows, sourceResults) {
  const legacyAddresses = [...new Set(oldRows.map((row) => row.address).filter((value) => value && value !== '(Blank)'))];
  const oldQuarterKeys = new Set(oldRows.map((row) => row.quarterKey));
  const freshQuarterKeys = new Set([
    ...rawRows.map((row) => row.quarterKey),
    ...exactRows.map((row) => row.quarterKey)
  ].filter(Boolean));
  const commonQuarterKeys = [...oldQuarterKeys].filter((key) => freshQuarterKeys.has(key)).sort();
  const commonQuarterSet = new Set(commonQuarterKeys);
  const commonOld = oldRows.filter((row) => commonQuarterSet.has(row.quarterKey));
  const commonRaw = rawRows.filter((row) => commonQuarterSet.has(row.quarterKey));
  const commonExact = exactRows.filter((row) => commonQuarterSet.has(row.quarterKey));
  const legacyCommonAddresses = [...new Set(commonOld.map((row) => row.address))];
  const legacyAbsTotal = commonOld.reduce((sum, row) => sum + Math.abs(row.cost), 0);

  const summaries = sourceResults.map((source) => {
    if (source.error) {
      return {
        source: source.name,
        error: source.error,
        mappedCostCenterCount: 0,
        ambiguousCostCenterCount: 0,
        matchedLegacyAddressCount: 0,
        legacyAddressCount: legacyCommonAddresses.length,
        legacyCoveredCost: 0,
        legacyCoveredShare: 0,
        freshExactGlCost: 0,
        freshRawNonLaborCost: 0,
        allPeriodRawNonLaborCost: 0,
        difference: 0,
        keyMap: new Map()
      };
    }

    const { mapped, ambiguousCostCenters } = buildLegacyKeyMap(source.rows, legacyAddresses);
    const matchedAddresses = new Set([...mapped.values()].map((value) => value.address));
    const legacyCoveredRows = commonOld.filter((row) => matchedAddresses.has(row.address));
    const legacyCoveredCost = legacyCoveredRows.reduce((sum, row) => sum + row.cost, 0);
    const legacyCoveredAbs = legacyCoveredRows.reduce((sum, row) => sum + Math.abs(row.cost), 0);
    const freshExactGlCost = commonExact
      .filter((row) => mapped.has(row.costCenter))
      .reduce((sum, row) => sum + row.netCost, 0);
    const freshRawNonLaborCost = commonRaw
      .filter((row) => mapped.has(row.costCenter))
      .reduce((sum, row) => sum + row.netCost, 0);
    const allPeriodRawNonLaborCost = rawRows
      .filter((row) => mapped.has(row.costCenter))
      .reduce((sum, row) => sum + row.netCost, 0);

    return {
      source: source.name,
      error: null,
      mappedCostCenterCount: mapped.size,
      ambiguousCostCenterCount: ambiguousCostCenters,
      matchedLegacyAddressCount: matchedAddresses.size,
      legacyAddressCount: legacyCommonAddresses.length,
      legacyCoveredCost,
      legacyCoveredShare: legacyAbsTotal > 0 ? legacyCoveredAbs / legacyAbsTotal : 0,
      freshExactGlCost,
      freshRawNonLaborCost,
      allPeriodRawNonLaborCost,
      difference: freshExactGlCost - legacyCoveredCost,
      keyMap: mapped
    };
  }).sort((a, b) => b.legacyCoveredShare - a.legacyCoveredShare || Math.abs(a.difference) - Math.abs(b.difference));

  const best = summaries.find((row) => !row.error && row.mappedCostCenterCount > 0) ?? summaries[0] ?? null;
  const bestMap = best?.keyMap ?? new Map();
  const matchedAddressSet = new Set([...bestMap.values()].map((value) => value.address));

  const addressGroups = new Map();
  commonOld.forEach((row) => {
    const group = addressGroups.get(row.address) ?? {
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
    addressGroups.set(row.address, group);
  });

  commonExact.forEach((row) => {
    const mapping = bestMap.get(row.costCenter);
    if (!mapping) return;
    const group = addressGroups.get(mapping.address);
    if (!group) return;
    group.freshExactGlCost += row.netCost;
    group.costCenters.add(row.costCenter);
    group.divisions.add(row.division);
    group.examples.add(mapping.candidateFacility);
    group.scores.push(mapping.score);
  });

  commonRaw.forEach((row) => {
    const mapping = bestMap.get(row.costCenter);
    if (!mapping) return;
    const group = addressGroups.get(mapping.address);
    if (!group) return;
    group.freshRawNonLaborCost += row.netCost;
    group.costCenters.add(row.costCenter);
    group.divisions.add(row.division);
    group.examples.add(mapping.candidateFacility);
    group.scores.push(mapping.score);
  });

  const alignmentRows = [...addressGroups.values()]
    .filter((group) => matchedAddressSet.has(group.address))
    .map((group) => ({
      address: group.address,
      legacyCost: group.legacyCost,
      freshExactGlCost: group.freshExactGlCost,
      difference: group.freshExactGlCost - group.legacyCost,
      differencePct: Math.abs(group.legacyCost) > 0
        ? (group.freshExactGlCost - group.legacyCost) / Math.abs(group.legacyCost)
        : null,
      freshRawNonLaborCost: group.freshRawNonLaborCost,
      costCenterCount: group.costCenters.size,
      divisions: [...group.divisions].sort(),
      matchQuality: group.scores.length > 0 ? group.scores.reduce((sum, value) => sum + value, 0) / group.scores.length : 0,
      examples: [...group.examples].slice(0, 2)
    }))
    .sort((a, b) => Math.abs(b.legacyCost) - Math.abs(a.legacyCost));

  const unmatchedRows = [...addressGroups.values()]
    .filter((group) => !matchedAddressSet.has(group.address))
    .map((group) => ({ address: group.address, legacyCost: group.legacyCost }))
    .sort((a, b) => Math.abs(b.legacyCost) - Math.abs(a.legacyCost))
    .slice(0, 20);

  return {
    commonQuarterKeys,
    bestSource: best?.source ?? 'None',
    bestLegacyCoveredCost: best?.legacyCoveredCost ?? 0,
    bestLegacyCoveredShare: best?.legacyCoveredShare ?? 0,
    bestFreshExactGlCost: best?.freshExactGlCost ?? 0,
    bestFreshRawNonLaborCost: best?.freshRawNonLaborCost ?? 0,
    bestDifference: best?.difference ?? 0,
    bestMatchedAddressCount: best?.matchedLegacyAddressCount ?? 0,
    legacyAddressCount: legacyCommonAddresses.length,
    sourceRows: summaries.map(({ keyMap, ...row }) => row),
    alignmentRows: alignmentRows.slice(0, 40),
    unmatchedRows
  };
}

async function readLegacyFacilityKeyDiagnostics(pool) {
  const oldPayload = await readControllableCostsData();
  const oldRows = (oldPayload?.rows ?? [])
    .map((row) => ({
      quarterKey: legacyQuarterKey(row),
      address: String(row.address ?? '').trim() || '(Blank)',
      costElement: normalizeCostElement(row.cost_element),
      cost: Number(row.cost)
    }))
    .filter((row) => row.quarterKey && Number.isFinite(row.cost));

  const costElements = [...new Set(oldRows.map((row) => row.costElement).filter(Boolean))]
    .filter((value) => /^\d+$/.test(value));
  const exactQuery = buildExactLegacyGlQuery(costElements);

  const [rawResult, exactResult, sourceResults] = await Promise.all([
    pool.request().query(LEGACY_FACILITY_RAW_QUERY),
    exactQuery ? pool.request().query(exactQuery) : Promise.resolve({ recordset: [] }),
    Promise.all(LEGACY_FACILITY_SOURCE_TESTS.map((test) => runLegacyFacilitySourceTest(pool, test)))
  ]);

  const rawRows = rawResult.recordset.map((row) => ({
    quarterKey: freshQuarterKey(row.year, row.month),
    division: String(row.division ?? '').trim() || 'Unmapped',
    costCenter: normalizeCostCenter(row.cost_center),
    netCost: Number(row.net_cost) || 0
  })).filter((row) => row.quarterKey && row.costCenter);

  const exactRows = exactResult.recordset.map((row) => ({
    quarterKey: Number.isInteger(Number(row.year)) && Number.isInteger(Number(row.quarter))
      ? `${Number(row.year)}-Q${Number(row.quarter)}`
      : null,
    division: String(row.division ?? '').trim() || 'Unmapped',
    costCenter: normalizeCostCenter(row.cost_center),
    netCost: Number(row.net_cost) || 0
  })).filter((row) => row.quarterKey && row.costCenter);

  return buildLegacyFacilityKeyResult(oldRows, rawRows, exactRows, sourceResults);
}

export async function readDbmDiagnostics() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig('dbm');
  const basePayload = {
    connection: {
      status: 'Not configured',
      connected: false,
      server: config.server ?? 'Not configured',
      database: config.database ?? 'Not configured'
    },
    tables: getEmptyTableResults(),
    latestTransactionPeriod: { year: null, month: null, label: 'None' },
    costClassification: null,
    costClassificationError: null,
    costDimensionCoverage: null,
    costDimensionCoverageError: null,
    legacyFacilityKey: null,
    legacyFacilityKeyError: null
  };

  if (missing.length > 0) {
    logDebug('dbm-diagnostics', 'DBM connection is not configured.', {
      missing,
      duration: formatDuration(stopTimer())
    });
    return basePayload;
  }

  let pool;
  try {
    pool = await getPool(config, 'dbm');
  } catch (error) {
    logError('dbm-diagnostics', 'DBM connection test failed.', error, {
      server: config.server,
      database: config.database,
      duration: formatDuration(stopTimer())
    });

    return {
      ...basePayload,
      connection: {
        status: 'Failed',
        connected: false,
        server: config.server,
        database: config.database
      },
      tables: getEmptyTableResults('Not tested — connection failed')
    };
  }

  const tables = await Promise.all(DBM_TABLE_CHECKS.map((check) => runTableCheck(pool, check)));
  const transactionTable = tables.find((table) => table.name === 'src.rb_CVG_Transaction_Details_03');

  let costClassification = null;
  let costClassificationError = null;
  let costDimensionCoverage = null;
  let costDimensionCoverageError = null;
  let legacyFacilityKey = null;
  let legacyFacilityKeyError = null;

  try {
    costClassification = await readCostClassificationDiagnostics();
  } catch (error) {
    costClassificationError = error.message;
    logError('dbm-diagnostics', 'Cost classification explorer failed to load.', error);
  }

  try {
    costDimensionCoverage = await readCostDimensionCoverageDiagnostics();
  } catch (error) {
    costDimensionCoverageError = error.message;
    logError('dbm-diagnostics', 'Cost dimension coverage diagnostics failed to load.', error);
  }

  try {
    legacyFacilityKey = await readLegacyFacilityKeyDiagnostics(pool);
  } catch (error) {
    legacyFacilityKeyError = error.message;
    logError('dbm-diagnostics', 'Legacy facility-key diagnostics failed to load.', error);
  }

  logDebug('dbm-diagnostics', 'DBM diagnostics completed.', {
    server: config.server,
    database: config.database,
    accessibleTableCount: tables.filter((table) => table.accessible).length,
    costClassificationLoaded: Boolean(costClassification),
    costDimensionCoverageLoaded: Boolean(costDimensionCoverage),
    legacyFacilityKeyLoaded: Boolean(legacyFacilityKey),
    duration: formatDuration(stopTimer())
  });

  return {
    connection: {
      status: 'Connected',
      connected: true,
      server: config.server,
      database: config.database
    },
    tables: tables.map(({ name, accessible, status }) => ({ name, accessible, status })),
    latestTransactionPeriod: {
      year: transactionTable?.latestYear ?? null,
      month: transactionTable?.latestMonth ?? null,
      label: formatLatestMonth(transactionTable?.latestYear, transactionTable?.latestMonth)
    },
    costClassification,
    costClassificationError,
    costDimensionCoverage,
    costDimensionCoverageError,
    legacyFacilityKey,
    legacyFacilityKeyError
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

function formatCurrency(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : 'N/A';
}

function formatCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? countFormatter.format(numeric) : 'N/A';
}

function formatPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? percentFormatter.format(numeric) : 'N/A';
}

function summarizeFacilityStatuses(rows) {
  const summary = {
    Facility: { rowCount: 0, netCost: 0 },
    'Not Facility': { rowCount: 0, netCost: 0 },
    'Needs Review': { rowCount: 0, netCost: 0 }
  };

  rows.forEach((row) => {
    const bucket = summary[row.facilityStatus];
    bucket.rowCount += 1;
    bucket.netCost += Number(row.netCost) || 0;
  });

  return summary;
}

function renderLegacyFacilityKey(payload, errorMessage) {
  if (!payload) {
    return `
      <section class="panel">
        <h2>Legacy Facility-Key Test</h2>
        <p class="error">${escapeHtml(errorMessage || 'Legacy facility-key diagnostics did not load.')}</p>
      </section>
    `;
  }

  return `
    <section class="panel">
      <h2>Legacy Facility-Key Test</h2>
      <p class="note">Diagnostic only. This treats the legacy report's address list as a facility whitelist/key, maps fresh cost centers to candidate physical locations, and keeps only cost centers that resolve to exactly one legacy address. Fresh Exact-GL uses the legacy GL list as a second key; Fresh Raw Non-Labor is shown separately so we can distinguish facility-mapping quality from cost-definition quality.</p>

      <div class="classification-summary coverage-summary">
        <article class="summary-card"><span>Common Quarters</span><strong>${escapeHtml(payload.commonQuarterKeys.join(', ') || 'None')}</strong></article>
        <article class="summary-card"><span>Best Mapping Source</span><strong>${escapeHtml(payload.bestSource)}</strong></article>
        <article class="summary-card"><span>Legacy Addresses Matched</span><strong>${formatCount(payload.bestMatchedAddressCount)} / ${formatCount(payload.legacyAddressCount)}</strong></article>
        <article class="summary-card"><span>Legacy $ Covered</span><strong>${formatCurrency(payload.bestLegacyCoveredCost)} · ${formatPercent(payload.bestLegacyCoveredShare)}</strong></article>
        <article class="summary-card"><span>Fresh Exact-GL at Matched Facilities</span><strong>${formatCurrency(payload.bestFreshExactGlCost)}</strong></article>
        <article class="summary-card"><span>Exact-GL vs Legacy Difference</span><strong>${formatCurrency(payload.bestDifference)}</strong></article>
      </div>

      <p class="note">Fresh raw non-labor at those same matched facilities: ${formatCurrency(payload.bestFreshRawNonLaborCost)}. If address coverage is high but Exact-GL dollars still diverge, facility mapping is probably good and the remaining problem is the cost population/classification.</p>

      <h3>Using Legacy Addresses as the Facility Key — Source Comparison</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Mapping Source</th><th>Mapped CCs</th><th>Ambiguous CCs</th><th>Legacy Addresses Matched</th><th>Legacy $ Covered</th><th>Legacy Share</th><th>Fresh Exact-GL</th><th>Difference</th><th>Fresh Raw Non-Labor</th><th>Status</th></tr></thead>
          <tbody>${payload.sourceRows.map((row) => `
            <tr class="${row.error ? 'review-row' : ''}">
              <td class="mono">${escapeHtml(row.source)}</td>
              <td>${formatCount(row.mappedCostCenterCount)}</td>
              <td>${formatCount(row.ambiguousCostCenterCount)}</td>
              <td>${formatCount(row.matchedLegacyAddressCount)} / ${formatCount(row.legacyAddressCount)}</td>
              <td>${formatCurrency(row.legacyCoveredCost)}</td>
              <td>${formatPercent(row.legacyCoveredShare)}</td>
              <td>${formatCurrency(row.freshExactGlCost)}</td>
              <td>${formatCurrency(row.difference)}</td>
              <td>${formatCurrency(row.freshRawNonLaborCost)}</td>
              <td>${escapeHtml(row.error ? row.error.slice(0, 160) : 'OK')}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>

      <h3>Facility Alignment — Legacy vs Fresh at the Same Matched Facilities</h3>
      <p class="note">Sorted by legacy dollar impact. This is the closest apples-to-apples diagnostic we have right now: same legacy address key, same common quarter, and the same legacy GL set in the fresh transaction source.</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Legacy Address</th><th>Legacy Cost</th><th>Fresh Exact-GL</th><th>Difference</th><th>Difference %</th><th>Fresh Raw Non-Labor</th><th>Mapped CCs</th><th>Divisions</th><th>Match Quality</th><th>Fresh Location Example</th></tr></thead>
          <tbody>${payload.alignmentRows.map((row) => `
            <tr>
              <td>${escapeHtml(row.address)}</td>
              <td>${formatCurrency(row.legacyCost)}</td>
              <td>${formatCurrency(row.freshExactGlCost)}</td>
              <td>${formatCurrency(row.difference)}</td>
              <td>${row.differencePct == null ? '—' : formatPercent(row.differencePct)}</td>
              <td>${formatCurrency(row.freshRawNonLaborCost)}</td>
              <td>${formatCount(row.costCenterCount)}</td>
              <td>${escapeHtml(row.divisions.join(', ') || '—')}</td>
              <td>${formatPercent(row.matchQuality)}</td>
              <td>${escapeHtml(row.examples.join(' / ') || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="10">No legacy facilities matched uniquely.</td></tr>'}</tbody>
        </table>
      </div>

      <h3>Largest Legacy Facilities Still Unmatched</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Legacy Address</th><th>Legacy Cost in Common Quarter</th></tr></thead>
          <tbody>${payload.unmatchedRows.map((row) => `
            <tr class="review-row"><td>${escapeHtml(row.address)}</td><td>${formatCurrency(row.legacyCost)}</td></tr>`).join('') || '<tr><td colspan="2">All legacy addresses matched.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderLegacyComparison(legacy) {
  if (!legacy) return '';

  return `
    <h3>Legacy Cost Source Benchmark</h3>
    <p class="note">Benchmark only. This is the old controllable-cost source, not a definition of truth. Use it to compare expected facility/address mix and quarter totals while we build the new independent logic.</p>

    <div class="classification-summary coverage-summary">
      <article class="summary-card"><span>Legacy Source</span><strong>${escapeHtml(`${legacy.source}: ${legacy.sourceName}`)}</strong></article>
      <article class="summary-card"><span>Legacy Rows</span><strong>${formatCount(legacy.rowCount)}</strong></article>
      <article class="summary-card"><span>Addresses</span><strong>${formatCount(legacy.addressCount)}</strong></article>
      <article class="summary-card"><span>Cost Elements</span><strong>${formatCount(legacy.costElementCount)}</strong></article>
      <article class="summary-card"><span>Quarters</span><strong>${formatCount(legacy.quarterCount)}</strong></article>
      <article class="summary-card"><span>Legacy Net Cost</span><strong>${formatCurrency(legacy.totalNetCost)}</strong></article>
    </div>

    <p class="note">Common quarters: ${escapeHtml(legacy.commonQuarterKeys.join(', ') || 'None')} · legacy total in common quarters: ${formatCurrency(legacy.commonOldNetCost)} · fresh raw DS indirect non-labor in those quarters: ${formatCurrency(legacy.commonFreshRawNetCost)}. The fresh value is intentionally much broader until facility filtering is finished.</p>

    <h3>Legacy vs Fresh by Quarter</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Quarter</th><th>Legacy Facility Report</th><th>Fresh Raw DS Non-Labor</th><th>Overlap?</th></tr></thead>
        <tbody>${legacy.quarterRows.map((row) => `
          <tr class="${row.overlap ? 'coverage' : ''}">
            <td>${escapeHtml(row.quarter)}</td>
            <td>${formatCurrency(row.oldCost)}</td>
            <td>${formatCurrency(row.freshRawCost)}</td>
            <td>${row.overlap ? 'Yes' : 'No'}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>

    <h3>Top Legacy Addresses</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Legacy Address</th><th>Legacy Net Cost</th><th>Abs Share</th><th>Quarters</th><th>Fresh Mapped Facility Match</th><th>Fresh Mapped Net Cost</th></tr></thead>
        <tbody>${legacy.topAddresses.map((row) => `
          <tr>
            <td>${escapeHtml(row.key)}</td>
            <td>${formatCurrency(row.netCost)}</td>
            <td>${formatPercent(row.absoluteShare)}</td>
            <td>${escapeHtml(row.quarters.join(', '))}</td>
            <td>${escapeHtml(row.freshFacilityMatch || 'No current match')}</td>
            <td>${row.freshMappedNetCost == null ? '—' : formatCurrency(row.freshMappedNetCost)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>

    <h3>Top Legacy Cost Categories</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Cost Category</th><th>Legacy Net Cost</th><th>Abs Share</th><th>Rows</th></tr></thead>
        <tbody>${legacy.topCategories.map((row) => `
          <tr>
            <td>${escapeHtml(row.key)}</td>
            <td>${formatCurrency(row.netCost)}</td>
            <td>${formatPercent(row.absoluteShare)}</td>
            <td>${formatCount(row.rowCount)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderLegacyGlOverlap(overlap) {
  if (!overlap) return '';

  return `
    <h3>Legacy GL Overlap — Exact Cost Elements in Fresh Source</h3>
    <p class="note">This ignores the old Cost Element Key for filtering. It takes the cost elements that actually appeared in the legacy report and finds those exact RACCTs in the fresh DS transaction source across every account hierarchy, including labor.</p>

    <div class="classification-summary coverage-summary">
      <article class="summary-card"><span>Common Quarters</span><strong>${escapeHtml(overlap.commonQuarterKeys.join(', ') || 'None')}</strong></article>
      <article class="summary-card"><span>Legacy Elements</span><strong>${formatCount(overlap.legacyElementCount)}</strong></article>
      <article class="summary-card"><span>Fresh Matched Elements</span><strong>${formatCount(overlap.freshMatchedElementCount)}</strong></article>
      <article class="summary-card"><span>Legacy Cost</span><strong>${formatCurrency(overlap.oldNetCost)}</strong></article>
      <article class="summary-card"><span>Fresh Exact-GL Cost</span><strong>${formatCurrency(overlap.freshExactGlNetCost)}</strong></article>
      <article class="summary-card"><span>Difference</span><strong>${formatCurrency(overlap.difference)}</strong></article>
    </div>

    <h3>Legacy Category vs Fresh Exact-GL</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Legacy Category</th><th>Legacy Cost</th><th>Fresh Exact-GL Cost</th><th>Difference</th><th>Elements Old / Fresh</th><th>Fresh Account Hierarchy</th></tr></thead>
        <tbody>${overlap.categoryRows.map((row) => `
          <tr>
            <td>${escapeHtml(row.category)}</td>
            <td>${formatCurrency(row.oldCost)}</td>
            <td>${formatCurrency(row.freshExactGlCost)}</td>
            <td>${formatCurrency(row.difference)}</td>
            <td>${formatCount(row.legacyElementCount)} / ${formatCount(row.freshMatchedElementCount)}</td>
            <td>${escapeHtml(row.freshHierarchy)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>

    <h3>Largest Legacy-vs-Fresh GL Differences</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Cost Element</th><th>Legacy Category</th><th>Description</th><th>Legacy</th><th>Fresh</th><th>Difference</th><th>Fresh Level 1</th><th>Fresh Level 2</th><th>Fresh Level 3</th></tr></thead>
        <tbody>${overlap.elementRows.map((row) => `
          <tr>
            <td class="mono">${escapeHtml(row.costElement)}</td>
            <td>${escapeHtml(row.legacyCategory)}</td>
            <td>${escapeHtml(row.description)}</td>
            <td>${formatCurrency(row.oldCost)}</td>
            <td>${formatCurrency(row.freshExactGlCost)}</td>
            <td>${formatCurrency(row.difference)}</td>
            <td>${escapeHtml(row.level1)}</td>
            <td>${escapeHtml(row.level2)}</td>
            <td>${escapeHtml(row.level3)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderFacilityMappingCandidates(candidates = []) {
  return `
    <h3>DBM Facility-Mapping Candidate Objects</h3>
    <p class="note">Metadata-only discovery: DBM tables/views containing at least one cost-center-like column and at least one facility/location/address-like column. These are candidates for a real KOSTL → physical facility join; nothing here changes the card.</p>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Object</th><th>Type</th><th>Cost Center Columns</th><th>Facility / Location Columns</th></tr></thead>
        <tbody>${candidates.map((row) => `
          <tr>
            <td class="mono">${escapeHtml(row.objectName)}</td>
            <td>${escapeHtml(row.tableType)}</td>
            <td>${escapeHtml(row.costCenterColumns.join(', '))}</td>
            <td>${escapeHtml(row.locationColumns.join(', '))}</td>
          </tr>`).join('') || '<tr><td colspan="4">No metadata candidates found.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function renderCostDimensionCoverage(payload, errorMessage, classificationTotal) {
  if (!payload) {
    return `
      <section class="panel">
        <h2>Cost Dimension Coverage</h2>
        <p class="error">${escapeHtml(errorMessage || 'Dimension coverage data did not load.')}</p>
      </section>
    `;
  }

  const reconciliationDifference = Number(payload.totalNetCost) - Number(classificationTotal || 0);

  return `
    <section class="panel">
      <h2>Cost Dimension Coverage</h2>
      <p class="note">Fresh DS indirect non-labor population. Division/BU should already be trustworthy; facility mapping is still diagnostic until coverage is good enough.</p>

      <div class="classification-summary coverage-summary">
        <article class="summary-card"><span>Divisions</span><strong>${formatCount(payload.divisionCount)}</strong></article>
        <article class="summary-card"><span>Business Units</span><strong>${formatCount(payload.businessUnitCount)}</strong></article>
        <article class="summary-card"><span>Mapped Facilities</span><strong>${formatCount(payload.facilityCount)}</strong></article>
        <article class="summary-card"><span>Cost Centers</span><strong>${formatCount(payload.costCenterCount)}</strong></article>
        <article class="summary-card"><span>Months Present</span><strong>${formatCount(payload.monthCount)}</strong></article>
        <article class="summary-card"><span>Unmapped Facility</span><strong>${formatCount(payload.unmapped.costCenterCount)} CCs · ${formatPercent(payload.unmapped.absoluteShare)}</strong></article>
      </div>

      <p class="note">Dimension total: ${formatCurrency(payload.totalNetCost)} · GL explorer total: ${formatCurrency(classificationTotal)} · Difference: ${formatCurrency(reconciliationDifference)}. These should reconcile essentially to zero.</p>

      <h3>Division Coverage</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Division</th><th>BUs</th><th>Facilities</th><th>Cost Centers</th><th>Months</th><th>Net Cost</th><th>Abs Share</th></tr></thead>
          <tbody>${payload.divisions.map((row) => `
            <tr>
              <td>${escapeHtml(row.key)}</td>
              <td>${formatCount(row.businessUnitCount)}</td>
              <td>${formatCount(row.facilityCount)}</td>
              <td>${formatCount(row.costCenterCount)}</td>
              <td class="${row.monthCount < payload.monthCount ? 'status-needs-review' : ''}">${formatCount(row.monthCount)} / ${formatCount(payload.monthCount)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>

      <h3>Business Unit Coverage</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Division | Business Unit</th><th>Facilities</th><th>Cost Centers</th><th>Months</th><th>Net Cost</th><th>Abs Share</th></tr></thead>
          <tbody>${payload.businessUnits.map((row) => `
            <tr>
              <td>${escapeHtml(row.key)}</td>
              <td>${formatCount(row.facilityCount)}</td>
              <td>${formatCount(row.costCenterCount)}</td>
              <td class="${row.monthCount < payload.monthCount ? 'status-needs-review' : ''}">${formatCount(row.monthCount)} / ${formatCount(payload.monthCount)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>

      <h3>Facility Coverage + Mapping Tests</h3>
      <p class="note">The MAPPING COVERAGE rows are diagnostics. The SAP overlap rows test whether transaction RCNTR corresponds to KOSTL, PRCTR, or ZZORGCODE in the SAP cost-center master before we guess another join.</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Facility / Test</th><th>Divisions</th><th>BUs</th><th>Cost Centers</th><th>Months</th><th>Net Cost</th><th>Abs Share</th></tr></thead>
          <tbody>${payload.facilities.map((row) => `
            <tr class="${row.key === 'Unmapped' ? 'review-row' : ''}">
              <td>${escapeHtml(row.key)}</td>
              <td>${formatCount(row.divisionCount)}</td>
              <td>${formatCount(row.businessUnitCount)}</td>
              <td>${formatCount(row.costCenterCount)}</td>
              <td class="${row.monthCount < payload.monthCount ? 'status-needs-review' : ''}">${formatCount(row.monthCount)} / ${formatCount(payload.monthCount)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>

      <h3>Top Unmapped Facility Cost Centers</h3>
      <p class="note">Each row also shows whether that RCNTR exists as KOSTL, PRCTR, or ZZORGCODE in the SAP cost-center master.</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Cost Center + SAP Hint</th><th>Months</th><th>Net Cost</th><th>Share of Unmapped Activity</th></tr></thead>
          <tbody>${payload.unmappedCostCenters.map((row) => `
            <tr class="review-row">
              <td class="mono">${escapeHtml(row.key)}</td>
              <td>${formatCount(row.monthCount)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
            </tr>`).join('') || '<tr><td colspan="4">No unmapped facility cost centers.</td></tr>'}</tbody>
        </table>
      </div>

      ${renderLegacyComparison(payload.legacyComparison)}
      ${renderLegacyGlOverlap(payload.legacyGlOverlap)}
      ${renderFacilityMappingCandidates(payload.facilityMappingCandidates)}
    </section>
  `;
}

function renderCostClassification(payload, errorMessage) {
  if (!payload) {
    return `
      <section class="panel">
        <h2>Facility Cost Classification Explorer</h2>
        <p class="error">${escapeHtml(errorMessage || 'Classification data did not load.')}</p>
      </section>
    `;
  }

  const classifiedRows = payload.costElementRows.map((row) => ({
    ...row,
    ...classifyFacilityCost(row)
  }));
  const statusSummary = summarizeFacilityStatuses(classifiedRows);
  const needsReviewRows = classifiedRows.filter((row) => row.facilityStatus === 'Needs Review');

  return `
    <section class="panel classification-panel">
      <h2>Facility Cost Classification Explorer</h2>
      <p class="note">Fresh DS DBM non-labor population only. This section intentionally ignores the old Cost Element Key and existing controllable/uncontrollable assumptions.</p>

      <div class="classification-summary">
        <article class="summary-card"><span>Period</span><strong>${escapeHtml(payload.firstPeriod)} – ${escapeHtml(payload.latestPeriod)}</strong></article>
        <article class="summary-card"><span>Net Cost</span><strong>${formatCurrency(payload.totalNetCost)}</strong></article>
        <article class="summary-card"><span>GL / Category Combos</span><strong>${formatCount(payload.costElementCombinationCount)}</strong></article>
        <article class="summary-card"><span>Rows to 95%</span><strong>${formatCount(payload.rowsTo95)}</strong></article>
        <article class="summary-card"><span>Rows to 99%</span><strong>${formatCount(payload.rowsTo99)}</strong></article>
      </div>

      <h3>First-Pass Facility Classification — 95% Coverage Set</h3>
      <p class="note">Conservative rules only. Nothing here changes the scorecard yet.</p>
      <div class="classification-summary status-summary">
        <article class="summary-card"><span>Facility</span><strong>${formatCount(statusSummary.Facility.rowCount)} rows · ${formatCurrency(statusSummary.Facility.netCost)}</strong></article>
        <article class="summary-card"><span>Not Facility</span><strong>${formatCount(statusSummary['Not Facility'].rowCount)} rows · ${formatCurrency(statusSummary['Not Facility'].netCost)}</strong></article>
        <article class="summary-card"><span>Needs Review</span><strong>${formatCount(statusSummary['Needs Review'].rowCount)} rows · ${formatCurrency(statusSummary['Needs Review'].netCost)}</strong></article>
      </div>

      <h3>Needs Review</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>#</th><th>Cost Element</th><th>Description</th><th>Level 3</th><th>Net Cost</th><th>Abs Share</th><th>Reason</th></tr></thead>
          <tbody>${needsReviewRows.map((row) => `
            <tr class="review-row">
              <td>${row.rank}</td>
              <td class="mono">${escapeHtml(row.costElement)}</td>
              <td>${escapeHtml(row.costElementDescription)}</td>
              <td>${escapeHtml(row.level3Category)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
              <td>${escapeHtml(row.facilityReason)}</td>
            </tr>`).join('') || '<tr><td colspan="7">No rows need review in the visible coverage set.</td></tr>'}</tbody>
        </table>
      </div>

      <h3>Category Summary</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>#</th><th>Level 3</th><th>Level 4</th><th>GL Combos</th><th>Net Cost</th><th>Abs Share</th><th>Cumulative</th></tr></thead>
          <tbody>${payload.categoryRows.map((row) => `
            <tr>
              <td>${row.rank}</td>
              <td>${escapeHtml(row.level3Category)}</td>
              <td>${escapeHtml(row.level4Category)}</td>
              <td>${formatCount(row.costElementCount)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
              <td>${formatPercent(row.cumulativeShare)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>

      <h3>Cost Elements Ranked by Dollar Impact</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>#</th><th>Cost Element</th><th>Description</th><th>Level 3</th><th>Status</th><th>Net Cost</th><th>Abs Share</th><th>Cumulative</th><th>Txn Rows</th></tr></thead>
          <tbody>${classifiedRows.map((row) => `
            <tr class="${row.cumulativeShare <= 0.95 ? 'coverage' : ''}">
              <td>${row.rank}</td>
              <td class="mono">${escapeHtml(row.costElement)}</td>
              <td>${escapeHtml(row.costElementDescription)}</td>
              <td>${escapeHtml(row.level3Category)}</td>
              <td class="status-${row.facilityStatus.toLowerCase().replaceAll(' ', '-')}">${escapeHtml(row.facilityStatus)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
              <td>${formatPercent(row.cumulativeShare)}</td>
              <td>${formatCount(row.transactionRowCount)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </section>
  `;
}

export function renderDbmDiagnosticsPage(payload) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DBM Diagnostics</title>
    <style>
      :root { color-scheme: dark; font-family: Arial, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 18px; background: #111827; color: #f3f4f6; }
      .shell { width: min(1500px, 100%); margin: 0 auto; display: grid; gap: 12px; }
      .hero, .panel, .summary-card { border: 1px solid #374151; border-radius: 10px; background: #1f2937; }
      .hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { margin-bottom: 0; font-size: 22px; }
      h2 { margin-bottom: 10px; font-size: 16px; }
      h3 { margin: 18px 0 8px; font-size: 14px; }
      .button { padding: 8px 12px; border: 1px solid #4b5563; border-radius: 999px; background: #28223c; color: white; text-decoration: none; font-size: 12px; font-weight: 700; }
      .panel { padding: 12px; }
      .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
      .classification-summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
      .classification-summary.status-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .classification-summary.coverage-summary { grid-template-columns: repeat(6, minmax(0, 1fr)); }
      .summary-card { padding: 10px 12px; background: #111827; }
      .summary-card span { display: block; margin-bottom: 5px; color: #9ca3af; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .summary-card strong { display: block; overflow-wrap: anywhere; font-size: 14px; }
      .table-scroll { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { padding: 7px 8px; border: 1px solid #374151; text-align: left; white-space: nowrap; }
      thead th { position: sticky; top: 0; background: #28223c; color: white; z-index: 1; }
      tbody tr:nth-child(even) { background: #182231; }
      tbody tr.coverage { background: rgba(34, 197, 94, .07); }
      tbody tr.review-row { background: rgba(245, 158, 11, .08); }
      .accessible, .status-facility { color: #86efac; font-weight: 700; }
      .unavailable, .error, .status-not-facility { color: #fca5a5; font-weight: 700; }
      .not-tested, .status-needs-review { color: #fcd34d; font-weight: 700; }
      .note { padding: 9px 10px; border-radius: 8px; background: #111827; color: #d1d5db; font-size: 12px; margin-bottom: 10px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      @media (max-width: 1000px) {
        .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .classification-summary, .classification-summary.status-summary, .classification-summary.coverage-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 420px) {
        body { padding: 8px; }
        .summary-grid, .classification-summary, .classification-summary.status-summary, .classification-summary.coverage-summary { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <h1>DBM Diagnostics</h1>
        <a class="button" href="/dbm-diagnostics">Refresh</a>
      </section>

      <section class="summary-grid">
        <article class="summary-card"><span>Connection</span><strong>${escapeHtml(payload.connection.status)}</strong></article>
        <article class="summary-card"><span>Server</span><strong>${escapeHtml(payload.connection.server)}</strong></article>
        <article class="summary-card"><span>Database</span><strong>${escapeHtml(payload.connection.database)}</strong></article>
        <article class="summary-card"><span>Latest Transaction Period</span><strong>${escapeHtml(payload.latestTransactionPeriod.label)}</strong></article>
      </section>

      <section class="panel">
        <h2>Table Accessibility</h2>
        <table>
          <thead><tr><th>Table</th><th>Status</th></tr></thead>
          <tbody>${payload.tables.map((table) => {
            const statusClass = table.accessible === true ? 'accessible' : table.accessible === false ? 'unavailable' : 'not-tested';
            return `<tr><th>${escapeHtml(table.name)}</th><td class="${statusClass}">${escapeHtml(table.status)}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </section>

      ${renderCostDimensionCoverage(
        payload.costDimensionCoverage,
        payload.costDimensionCoverageError,
        payload.costClassification?.totalNetCost
      )}

      ${renderLegacyFacilityKey(payload.legacyFacilityKey, payload.legacyFacilityKeyError)}

      ${renderCostClassification(payload.costClassification, payload.costClassificationError)}
    </main>
  </body>
</html>`;
}
