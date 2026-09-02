import { COST_DIMENSION_COVERAGE_DBM_QUERY } from './dbmQueries/costDimensionCoverageQuery.js';
import { getConnectionConfig, getPool } from './sqlConnection.js';

function text(value, fallback = 'Unmapped') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
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

function summarize(rows, keySelector) {
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

  const totalAbsolute = [...groups.values()].reduce((sum, row) => sum + row.absoluteCost, 0);

  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      netCost: round(group.netCost),
      absoluteCost: round(group.absoluteCost),
      absoluteShare: totalAbsolute > 0 ? group.absoluteCost / totalAbsolute : 0,
      transactionRows: group.transactionRows,
      monthCount: group.months.size,
      divisionCount: group.divisions.size,
      businessUnitCount: group.businessUnits.size,
      facilityCount: group.facilities.size,
      costCenterCount: group.costCenters.size
    }))
    .sort((a, b) => b.absoluteCost - a.absoluteCost || a.key.localeCompare(b.key));
}

function buildUnmappedCostCenters(rows) {
  return summarize(
    rows.filter((row) => row.facility === 'Unmapped'),
    (row) => row.costCenter
  ).slice(0, 30);
}

function buildPayload(sourceRows) {
  const rows = sourceRows.map((row) => ({
    year: number(row.year),
    month: number(row.month),
    division: text(row.division),
    businessUnit: text(row.business_unit),
    facility: text(row.facility),
    costCenter: text(row.cost_center),
    transactionRowCount: number(row.transaction_row_count),
    netCost: round(row.net_cost)
  })).filter((row) => Number.isInteger(row.year) && row.month >= 1 && row.month <= 12);

  const allMonths = new Set(rows.map(monthKey));
  const totalNetCost = round(rows.reduce((sum, row) => sum + row.netCost, 0));
  const totalAbsoluteCost = rows.reduce((sum, row) => sum + Math.abs(row.netCost), 0);
  const unmappedRows = rows.filter((row) => row.facility === 'Unmapped');
  const unmappedAbsoluteCost = unmappedRows.reduce((sum, row) => sum + Math.abs(row.netCost), 0);

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
    divisions: summarize(rows, (row) => row.division),
    businessUnits: summarize(rows, (row) => `${row.division} | ${row.businessUnit}`),
    facilities: summarize(rows, (row) => row.facility).slice(0, 100),
    unmappedCostCenters: buildUnmappedCostCenters(rows)
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
