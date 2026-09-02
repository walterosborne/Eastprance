import { COST_DIMENSION_COVERAGE_DBM_QUERY } from './dbmQueries/costDimensionCoverageQuery.js';
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
  const parts = [];
  if (row.sapPlant) parts.push(`plant ${row.sapPlant}`);
  if (row.sapCity) parts.push(`city ${row.sapCity}`);
  if (row.sapDistrict) parts.push(`district ${row.sapDistrict}`);
  return parts.join(' · ');
}

function buildUnmappedCostCenters(rows, allMonthKeys) {
  const unmappedRows = rows.filter((row) => row.facility === 'Unmapped');
  const hintsByCostCenter = new Map();

  unmappedRows.forEach((row) => {
    const hint = formatSapMasterHint(row);
    if (hint && !hintsByCostCenter.has(row.costCenter)) {
      hintsByCostCenter.set(row.costCenter, hint);
    }
  });

  return summarize(unmappedRows, (row) => row.costCenter, allMonthKeys)
    .slice(0, 30)
    .map((row) => ({
      ...row,
      key: `${row.key} · ${hintsByCostCenter.get(row.key) || 'SAP master location blank'}`
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

function buildPayload(sourceRows) {
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
      sapMasterLocation: [sapPlant, sapCity, sapDistrict].filter(Boolean).join(' | ') || null,
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
    summarizeMappingMethod(
      rows,
      'currentCostCenterFacility',
      'Cost center → Archibus (current card method)',
      totalAbsoluteCost
    ),
    summarizeMappingMethod(
      rows,
      'employeeMyidFacility',
      'Transaction Employee MyID → Archibus',
      totalAbsoluteCost
    ),
    summarizeMappingMethod(
      rows,
      'rosterLocationFacility',
      'Transaction Employee → Roster Location → Archibus',
      totalAbsoluteCost
    ),
    summarizeMappingMethod(
      rows.map((row) => ({ ...row, combinedFacility: row.facility === 'Unmapped' ? null : row.facility })),
      'combinedFacility',
      'Combined waterfall: Employee → Roster Location → Cost Center',
      totalAbsoluteCost
    ),
    summarizeMappingMethod(
      rows,
      'sapMasterLocation',
      'SAP cost-center master has location fields (diagnostic only)',
      totalAbsoluteCost
    )
  ];

  const divisions = appendMissingMonths(summarize(rows, (row) => row.division, allMonths));
  const businessUnits = appendMissingMonths(
    summarize(rows, (row) => `${row.division} | ${row.businessUnit}`, allMonths)
  );
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
    facilities: [
      ...buildMappingMethodRows(methodCoverage),
      ...finalFacilities
    ],
    unmappedCostCenters: buildUnmappedCostCenters(rows, allMonths)
  };
}

export async function readCostDimensionCoverageDiagnostics() {
  const { config, missing } = getConnectionConfig('dbm');

  if (missing.length > 0) {
    throw new Error(`DBM configuration is incomplete: ${missing.join(', ')}`);
  }

  const pool = await getPool(config, 'dbm');
  const result = await pool.request().query(COST_DIMENSION_COVERAGE_DBM_QUERY);
  return buildPayload(result.recordset);
}
