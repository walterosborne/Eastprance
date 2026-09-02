import { COST_DIMENSION_COVERAGE_DBM_QUERY } from './dbmQueries/costDimensionCoverageQuery.js';
import { readControllableCostsData } from './controllableCostsRepository.js';
import { getConnectionConfig, getPool } from './sqlConnection.js';

function text(value, fallback = 'Unmapped') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function optionalText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function number(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round(value) {
  return Number(number(value).toFixed(2));
}

function monthKey(row) {
  return `${row.year}-${String(row.month).padStart(2, '0')}`;
}

function quarterKeyFromMonth(row) {
  if (!Number.isInteger(row.year) || !Number.isInteger(row.month) || row.month < 1 || row.month > 12) {
    return null;
  }

  return `${row.year}-Q${Math.floor((row.month - 1) / 3) + 1}`;
}

function legacyQuarterKey(row) {
  const year = Number(row?.year);
  const match = /^Q([1-4])$/i.exec(String(row?.quarter ?? '').trim());
  return Number.isInteger(year) && match ? `${year}-Q${match[1]}` : null;
}

function formatMonthKey(value) {
  const [year, month] = String(value).split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function normalizeLocation(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function chooseWaterfallFacility(row) {
  if (row.employeeMyidFacility) {
    return { facility: row.employeeMyidFacility, mappingMethod: 'Employee MyID direct' };
  }

  if (row.rosterLocationFacility) {
    return { facility: row.rosterLocationFacility, mappingMethod: 'Roster location fallback' };
  }

  if (row.currentCostCenterFacility) {
    return { facility: row.currentCostCenterFacility, mappingMethod: 'Cost center → Archibus' };
  }

  return { facility: 'Unmapped', mappingMethod: 'Unmapped' };
}

function summarize(rows, keySelector, allMonthKeys = null) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = keySelector(row);
    const group = groups.get(key) ?? {
      key,
      netCost: 0,
      absoluteCost: 0,
      transactionRows: 0,
      months: new Set(),
      divisions: new Set(),
      businessUnits: new Set(),
      facilities: new Set(),
      costCenters: new Set()
    };

    group.netCost += row.netCost;
    group.absoluteCost += Math.abs(row.netCost);
    group.transactionRows += row.transactionRowCount;
    group.months.add(monthKey(row));
    group.divisions.add(row.division);
    group.businessUnits.add(row.businessUnit);
    group.facilities.add(row.facility);
    group.costCenters.add(row.costCenter);
    groups.set(key, group);
  });

  const totalAbsolute = rows.reduce((sum, row) => sum + Math.abs(row.netCost), 0);

  return [...groups.values()]
    .map((group) => {
      const missingMonths = allMonthKeys
        ? [...allMonthKeys].filter((value) => !group.months.has(value)).sort()
        : [];

      return {
        key: group.key,
        netCost: round(group.netCost),
        absoluteCost: round(group.absoluteCost),
        absoluteShare: totalAbsolute > 0 ? group.absoluteCost / totalAbsolute : 0,
        transactionRows: group.transactionRows,
        monthCount: group.months.size,
        missingMonths,
        divisionCount: group.divisions.size,
        businessUnitCount: group.businessUnits.size,
        facilityCount: group.facilities.size,
        costCenterCount: group.costCenters.size
      };
    })
    .sort((a, b) => b.absoluteCost - a.absoluteCost || a.key.localeCompare(b.key));
}

function appendMissingMonths(rows) {
  return rows.map((row) => ({
    ...row,
    key: row.missingMonths.length > 0
      ? `${row.key} · missing ${row.missingMonths.map(formatMonthKey).join(', ')}`
      : row.key
  }));
}

function formatSapMasterHint(row) {
  const locationParts = [];
  if (row.sapPlant) locationParts.push(`plant ${row.sapPlant}`);
  if (row.sapCity) locationParts.push(`city ${row.sapCity}`);
  if (row.sapDistrict) locationParts.push(`district ${row.sapDistrict}`);

  return `${locationParts.join(' · ') || 'SAP master location blank'} · key matches: KOSTL ${row.sapKostlMatch ? 'yes' : 'no'}, PRCTR ${row.sapPrctrMatch ? 'yes' : 'no'}, ZZORGCODE ${row.sapOrgCodeMatch ? 'yes' : 'no'}`;
}

function buildUnmappedCostCenters(rows, allMonthKeys) {
  const unmappedRows = rows.filter((row) => row.facility === 'Unmapped');
  const hintsByCostCenter = new Map();

  unmappedRows.forEach((row) => {
    if (!hintsByCostCenter.has(row.costCenter)) {
      hintsByCostCenter.set(row.costCenter, formatSapMasterHint(row));
    }
  });

  return summarize(unmappedRows, (row) => row.costCenter, allMonthKeys)
    .slice(0, 30)
    .map((row) => ({
      ...row,
      key: `${row.key} · ${hintsByCostCenter.get(row.key)}`
    }));
}

function summarizeMappingMethod(rows, fieldName, label, totalAbsoluteCost) {
  const mappedRows = rows.filter((row) => row[fieldName]);
  const mappedAbsoluteCost = mappedRows.reduce((sum, row) => sum + Math.abs(row.netCost), 0);

  return {
    label,
    mappedCostCenterCount: new Set(mappedRows.map((row) => row.costCenter)).size,
    mappedDivisionCount: new Set(mappedRows.map((row) => row.division)).size,
    mappedBusinessUnitCount: new Set(mappedRows.map((row) => row.businessUnit)).size,
    mappedMonthCount: new Set(mappedRows.map(monthKey)).size,
    mappedNetCost: round(mappedRows.reduce((sum, row) => sum + row.netCost, 0)),
    mappedAbsoluteShare: totalAbsoluteCost > 0 ? mappedAbsoluteCost / totalAbsoluteCost : 0
  };
}

function buildMappingMethodRows(methods) {
  return methods.map((method) => ({
    key: `MAPPING COVERAGE — ${method.label}`,
    netCost: method.mappedNetCost,
    absoluteCost: 0,
    absoluteShare: method.mappedAbsoluteShare,
    transactionRows: 0,
    monthCount: method.mappedMonthCount,
    divisionCount: method.mappedDivisionCount,
    businessUnitCount: method.mappedBusinessUnitCount,
    facilityCount: 0,
    costCenterCount: method.mappedCostCenterCount,
    missingMonths: []
  }));
}

function groupLegacyRows(rows, keySelector) {
  const groups = new Map();
  const totalAbsolute = rows.reduce((sum, row) => sum + Math.abs(row.cost), 0);

  rows.forEach((row) => {
    const key = keySelector(row) || '(Blank)';
    const group = groups.get(key) ?? { key, netCost: 0, absoluteCost: 0, rowCount: 0, quarters: new Set() };
    group.netCost += row.cost;
    group.absoluteCost += Math.abs(row.cost);
    group.rowCount += 1;
    if (row.quarterKey) group.quarters.add(row.quarterKey);
    groups.set(key, group);
  });

  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      netCost: round(group.netCost),
      absoluteCost: round(group.absoluteCost),
      absoluteShare: totalAbsolute > 0 ? group.absoluteCost / totalAbsolute : 0,
      rowCount: group.rowCount,
      quarters: [...group.quarters].sort()
    }))
    .sort((a, b) => b.absoluteCost - a.absoluteCost || a.key.localeCompare(b.key));
}

function buildLegacyComparison(oldPayload, freshRows) {
  const legacyRows = (oldPayload?.rows ?? [])
    .map((row) => ({
      year: Number(row.year),
      quarterKey: legacyQuarterKey(row),
      address: text(row.address, '(Blank)'),
      costCategory: text(row.cost_category, '(Blank)'),
      costElement: text(row.cost_element, '(Blank)'),
      controllable: row.controllable === 'Controllable' ? 'Controllable' : 'Uncontrollable',
      cost: Number(row.cost)
    }))
    .filter((row) => Number.isFinite(row.cost) && row.quarterKey);

  const legacyQuarterKeys = new Set(legacyRows.map((row) => row.quarterKey));
  const freshQuarterKeys = new Set(freshRows.map(quarterKeyFromMonth).filter(Boolean));
  const commonQuarterKeys = [...legacyQuarterKeys].filter((key) => freshQuarterKeys.has(key)).sort();
  const commonQuarterSet = new Set(commonQuarterKeys);

  const quarterRows = [...new Set([...legacyQuarterKeys, ...freshQuarterKeys])]
    .sort()
    .map((key) => {
      const oldCost = legacyRows
        .filter((row) => row.quarterKey === key)
        .reduce((sum, row) => sum + row.cost, 0);
      const freshCost = freshRows
        .filter((row) => quarterKeyFromMonth(row) === key)
        .reduce((sum, row) => sum + row.netCost, 0);

      return {
        quarter: key,
        oldCost: round(oldCost),
        freshRawCost: round(freshCost),
        overlap: legacyQuarterKeys.has(key) && freshQuarterKeys.has(key)
      };
    });

  const freshFacilities = summarize(
    freshRows.filter((row) => row.facility !== 'Unmapped'),
    (row) => row.facility
  );

  const topAddresses = groupLegacyRows(legacyRows, (row) => row.address)
    .slice(0, 30)
    .map((row) => {
      const normalizedOld = normalizeLocation(row.key);
      const match = normalizedOld
        ? freshFacilities.find((facility) => {
            const normalizedFresh = normalizeLocation(facility.key);
            return normalizedFresh.includes(normalizedOld) || normalizedOld.includes(normalizedFresh);
          })
        : null;

      return {
        ...row,
        freshFacilityMatch: match?.key ?? null,
        freshMappedNetCost: match?.netCost ?? null
      };
    });

  const commonOldRows = legacyRows.filter((row) => commonQuarterSet.has(row.quarterKey));
  const commonFreshRows = freshRows.filter((row) => commonQuarterSet.has(quarterKeyFromMonth(row)));

  return {
    source: oldPayload?.source ?? 'unknown',
    sourceName: oldPayload?.tableName ?? oldPayload?.fileName ?? 'legacy controllable costs',
    rowCount: legacyRows.length,
    addressCount: new Set(legacyRows.map((row) => row.address)).size,
    costElementCount: new Set(legacyRows.map((row) => row.costElement)).size,
    quarterCount: legacyQuarterKeys.size,
    quarters: [...legacyQuarterKeys].sort(),
    totalNetCost: round(legacyRows.reduce((sum, row) => sum + row.cost, 0)),
    controllableNetCost: round(legacyRows.filter((row) => row.controllable === 'Controllable').reduce((sum, row) => sum + row.cost, 0)),
    uncontrollableNetCost: round(legacyRows.filter((row) => row.controllable !== 'Controllable').reduce((sum, row) => sum + row.cost, 0)),
    commonQuarterKeys,
    commonOldNetCost: round(commonOldRows.reduce((sum, row) => sum + row.cost, 0)),
    commonFreshRawNetCost: round(commonFreshRows.reduce((sum, row) => sum + row.netCost, 0)),
    quarterRows,
    topAddresses,
    topCategories: groupLegacyRows(legacyRows, (row) => row.costCategory).slice(0, 25)
  };
}

function buildPayload(sourceRows, oldPayload) {
  const candidateRows = sourceRows.map((row) => {
    const sapPlant = optionalText(row.sap_plant);
    const sapCity = optionalText(row.sap_city);
    const sapDistrict = optionalText(row.sap_district);

    return {
      year: number(row.year),
      month: number(row.month),
      division: text(row.division),
      businessUnit: text(row.business_unit),
      costCenter: text(row.cost_center),
      currentCostCenterFacility: optionalText(row.current_cost_center_facility),
      employeeMyidFacility: optionalText(row.employee_myid_facility),
      rosterLocationFacility: optionalText(row.roster_location_facility),
      sapPlant,
      sapCity,
      sapDistrict,
      sapKostlMatch: number(row.sap_kostl_match) === 1,
      sapPrctrMatch: number(row.sap_prctr_match) === 1,
      sapOrgCodeMatch: number(row.sap_orgcode_match) === 1,
      transactionRowCount: number(row.transaction_row_count),
      netCost: round(row.net_cost)
    };
  }).filter((row) => Number.isInteger(row.year) && row.month >= 1 && row.month <= 12);

  const rows = candidateRows.map((row) => ({
    ...row,
    ...chooseWaterfallFacility(row)
  }));

  const allMonths = new Set(rows.map(monthKey));
  const totalNetCost = round(rows.reduce((sum, row) => sum + row.netCost, 0));
  const totalAbsoluteCost = rows.reduce((sum, row) => sum + Math.abs(row.netCost), 0);
  const unmappedRows = rows.filter((row) => row.facility === 'Unmapped');
  const unmappedAbsoluteCost = unmappedRows.reduce((sum, row) => sum + Math.abs(row.netCost), 0);

  const methodCoverage = [
    summarizeMappingMethod(rows, 'currentCostCenterFacility', 'Cost center → Archibus (current card method)', totalAbsoluteCost),
    summarizeMappingMethod(rows, 'employeeMyidFacility', 'Transaction Employee MyID → Archibus', totalAbsoluteCost),
    summarizeMappingMethod(rows, 'rosterLocationFacility', 'Transaction Employee → Roster Location → Archibus', totalAbsoluteCost),
    summarizeMappingMethod(
      rows.map((row) => ({ ...row, combinedFacility: row.facility === 'Unmapped' ? null : row.facility })),
      'combinedFacility',
      'Combined waterfall: Employee → Roster Location → Cost Center',
      totalAbsoluteCost
    ),
    summarizeMappingMethod(rows, 'sapKostlMatch', 'SAP master key overlap: KOSTL', totalAbsoluteCost),
    summarizeMappingMethod(rows, 'sapPrctrMatch', 'SAP master key overlap: PRCTR', totalAbsoluteCost),
    summarizeMappingMethod(rows, 'sapOrgCodeMatch', 'SAP master key overlap: ZZORGCODE', totalAbsoluteCost)
  ];

  const divisions = appendMissingMonths(summarize(rows, (row) => row.division, allMonths));
  const businessUnits = appendMissingMonths(summarize(rows, (row) => `${row.division} | ${row.businessUnit}`, allMonths));
  const finalFacilities = summarize(rows, (row) => row.facility, allMonths).slice(0, 100);

  return {
    totalNetCost,
    totalAbsoluteCost: round(totalAbsoluteCost),
    monthCount: allMonths.size,
    divisionCount: new Set(rows.map((row) => row.division)).size,
    businessUnitCount: new Set(rows.map((row) => row.businessUnit)).size,
    facilityCount: new Set(rows.map((row) => row.facility).filter((value) => value !== 'Unmapped')).size,
    costCenterCount: new Set(rows.map((row) => row.costCenter)).size,
    unmapped: {
      costCenterCount: new Set(unmappedRows.map((row) => row.costCenter)).size,
      netCost: round(unmappedRows.reduce((sum, row) => sum + row.netCost, 0)),
      absoluteShare: totalAbsoluteCost > 0 ? unmappedAbsoluteCost / totalAbsoluteCost : 0
    },
    mappingMethods: methodCoverage,
    divisions,
    businessUnits,
    facilities: [...buildMappingMethodRows(methodCoverage), ...finalFacilities],
    unmappedCostCenters: buildUnmappedCostCenters(rows, allMonths),
    legacyComparison: buildLegacyComparison(oldPayload, rows)
  };
}

export async function readCostDimensionCoverageDiagnostics() {
  const { config, missing } = getConnectionConfig('dbm');

  if (missing.length > 0) {
    throw new Error(`DBM configuration is incomplete: ${missing.join(', ')}`);
  }

  const pool = await getPool(config, 'dbm');
  const [result, oldPayload] = await Promise.all([
    pool.request().query(COST_DIMENSION_COVERAGE_DBM_QUERY),
    readControllableCostsData()
  ]);

  return buildPayload(result.recordset, oldPayload);
}
