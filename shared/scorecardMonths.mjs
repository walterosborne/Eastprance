import { assessLatestMonth, getLastCompletedMonthStamp } from './latestMonthOutlier.mjs';

const OTD_MONTH_COLUMNS = [
  { key: 'JAN', label: 'Jan' },
  { key: 'FEB', label: 'Feb' },
  { key: 'MAR', label: 'Mar' },
  { key: 'APR', label: 'Apr' },
  { key: 'MAY', label: 'May' },
  { key: 'JUN', label: 'Jun' },
  { key: 'JUL', label: 'Jul' },
  { key: 'AUG', label: 'Aug' },
  { key: 'SEP', label: 'Sep' },
  { key: 'OCT', label: 'Oct' },
  { key: 'NOV', label: 'Nov' },
  { key: 'DEC', label: 'Dec' }
];
const LABOR_MONTH_COLUMNS = OTD_MONTH_COLUMNS;
const SIF_KPI_ID = 5;
const POTENTIAL_SIF_KPI_ID = 6;
const NMFR_KPI_ID = 4;
const INCIDENT_ORG_UNIT_NAME = 'Defense';

const FIXED_MONTH_METRIC_YEAR = 2026;
const SCORECARD_START_STAMP = Date.UTC(2025, 0, 1);

function hasKpiValue(value) {
  return value != null && value !== '' && Number.isFinite(Number(value));
}

function averageActualValues(rows) {
  const numericValues = rows
    .map((row) => Number(row.actual_value))
    .filter((value) => Number.isFinite(value));

  if (numericValues.length === 0) {
    return null;
  }

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function calculateNmfrValueFromRows(rows) {
  let totalNearMissCount = 0;
  let hasFormulaInputs = false;
  const exposureHoursByMonth = new Map();

  rows.forEach((row) => {
    const nearMissCount = Number(row.near_miss_count);
    const employeeCount = Number(row.employee_count);
    const workingDays = Number(row.working_days);
    const monthStamp = getIncidentRowStamp(row);

    if (
      Number.isFinite(nearMissCount) &&
      Number.isFinite(employeeCount) &&
      employeeCount > 0 &&
      Number.isFinite(workingDays) &&
      workingDays > 0 &&
      monthStamp != null
    ) {
      totalNearMissCount += nearMissCount;
      if (!exposureHoursByMonth.has(monthStamp)) {
        exposureHoursByMonth.set(monthStamp, employeeCount * 8 * workingDays);
      }
      hasFormulaInputs = true;
    }
  });

  const totalExposureHours = Array.from(exposureHoursByMonth.values()).reduce(
    (sum, exposureHours) => sum + exposureHours,
    0
  );

  if (hasFormulaInputs && totalExposureHours > 0) {
    return Number(((200000 * totalNearMissCount) / totalExposureHours).toFixed(2));
  }

  return averageActualValues(rows);
}

function normalizeDivisionValue(value) {
  return (typeof value === 'string' ? value.trim() : '').replace(/^DS\s+/i, '').trim();
}

function isExcludedDivision(value) {
  return normalizeDivisionValue(value).toLowerCase() === 'future concepts';
}

function getQuarterNumber(value) {
  const match = /^Q\s*([1-4])$/i.exec(String(value ?? '').trim());
  return match ? Number(match[1]) : null;
}

function getMonthStartStamp(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function getFixedMonthStamp(year, monthIndex) {
  return Date.UTC(year, monthIndex, 1);
}

function getOtdRowYear(row) {
  const year = Number(row?.year);
  return Number.isInteger(year) ? year : FIXED_MONTH_METRIC_YEAR;
}

function getControllableCostsRowStamp(row) {
  const documentDateStamp = getMonthStartStamp(row.date);

  if (documentDateStamp != null) {
    return documentDateStamp;
  }

  const year = Number(row.year);
  const quarterNumber = getQuarterNumber(row.quarter);

  if (!Number.isInteger(year) || quarterNumber == null) {
    return null;
  }

  return getFixedMonthStamp(year, (quarterNumber - 1) * 3);
}

function getIncidentRowStamp(row) {
  return getMonthStartStamp(row.date);
}

function getLaborNewRowStamp(row) {
  const year = Number(row?.year);
  const month = Number(row?.month);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return getFixedMonthStamp(year, month - 1);
}

function getLaborCategoryGroup(laborCategory) {
  const normalizedValue = String(laborCategory ?? '').toLowerCase();

  if (normalizedValue.includes('labor direct')) {
    return 'direct';
  }

  if (normalizedValue.includes('labor indirect')) {
    return 'indirect';
  }

  return 'other';
}

function getLaborUtilizationNewCategoryGroup(laborCategory) {
  const normalizedValue = String(laborCategory ?? '').trim().toLowerCase();

  if (normalizedValue.includes('indirect')) {
    return 'indirect';
  }

  if (normalizedValue.includes('direct')) {
    return 'direct';
  }

  return 'other';
}

function getLaborRowYear(row) {
  const year = Number(row?.year);
  return Number.isInteger(year) ? year : FIXED_MONTH_METRIC_YEAR;
}

function getCardMonthConfig(metricKey) {
  if (metricKey.startsWith('controllableCosts')) {
    return { getStamp: getControllableCostsRowStamp, valueField: 'cost', kind: 'sum', minAbsoluteChange: 1 };
  }
  if (metricKey === 'customerEscapes') {
    return {
      getStamp: (row) => getMonthStartStamp(String(row.data_month ?? '').slice(0, 10)),
      kind: 'escapes', minAbsoluteChange: 3
    };
  }
  if (metricKey === 'otd') {
    return { monthColumns: OTD_MONTH_COLUMNS, getYear: getOtdRowYear, kind: 'otd', minAbsoluteChange: 0.05 };
  }
  if (metricKey === 'labor' || metricKey === 'laborHana') {
    return { monthColumns: LABOR_MONTH_COLUMNS, getYear: getLaborRowYear, kind: 'labor', minAbsoluteChange: 0.05 };
  }
  if (metricKey === 'laborDatabricks') {
    return { getStamp: getLaborNewRowStamp, valueField: 'entered_hours', kind: 'sum', minAbsoluteChange: 1 };
  }
  if (metricKey === 'laborNew') {
    return { getStamp: getLaborNewRowStamp, valueField: 'entered_hours', kind: 'laborNew', minAbsoluteChange: 0.05, minRelativeChange: 0 };
  }
  return {
    getStamp: getIncidentRowStamp, valueField: 'actual_value',
    kind: metricKey === 'nmfr' ? 'nmfr' : 'sum',
    minAbsoluteChange: metricKey === 'nmfr' ? 0.05 : 3
  };
}

function buildCardMonthlyPoints(rows, metricKey, lastCompletedMonth = getLastCompletedMonthStamp()) {
  const config = getCardMonthConfig(metricKey);
  const months = new Map();
  const add = (stamp, row, value) => {
    if (!Number.isFinite(stamp) || stamp < SCORECARD_START_STAMP || stamp > lastCompletedMonth) return;
    const entries = months.get(stamp) ?? [];
    entries.push({ row, value });
    months.set(stamp, entries);
  };
  for (const row of rows) {
    if (config.monthColumns) {
      config.monthColumns.forEach(({ key }, index) => {
        // Missing cells are not observed zero months.
        if (hasKpiValue(row[key])) add(getFixedMonthStamp(config.getYear(row), index), row, Number(row[key]));
      });
    } else if (config.kind === 'escapes') {
      const fields = ['software_escapes', 'hardware_escapes', 'documentation_escapes'];
      if (fields.some((field) => hasKpiValue(row[field]))) {
        add(config.getStamp(row), row, fields.reduce((sum, field) => sum + (Number(row[field]) || 0), 0));
      }
    } else if (hasKpiValue(row[config.valueField]) || (config.kind === 'nmfr'
      && hasKpiValue(row.near_miss_count) && Number(row.employee_count) > 0 && Number(row.working_days) > 0)) {
      add(config.getStamp(row), row, Number(row[config.valueField]));
    }
  }
  return [...months].map(([stamp, entries]) => {
    let value;
    if (config.kind === 'otd') {
      const actual = entries.filter(({ row }) => ['Actual Delivered', 'Actuals Delivered'].includes(row.measure_type));
      const contract = entries.filter(({ row }) => row.measure_type === 'Contract Commitment')
        .reduce((sum, entry) => sum + entry.value, 0);
      value = actual.length && contract > 0
        ? actual.reduce((sum, entry) => sum + entry.value, 0) / contract : null;
    } else if (config.kind === 'labor' || config.kind === 'laborNew') {
      const classify = config.kind === 'laborNew' ? getLaborUtilizationNewCategoryGroup : getLaborCategoryGroup;
      const total = entries.reduce((sum, entry) => sum + entry.value, 0);
      const direct = entries.filter(({ row }) => classify(row.labor_category) === 'direct')
        .reduce((sum, entry) => sum + entry.value, 0);
      value = total > 0 ? direct / total : null;
    } else if (config.kind === 'nmfr') {
      value = calculateNmfrValueFromRows(entries.map(({ row }) => row));
    } else {
      value = entries.reduce((sum, entry) => sum + entry.value, 0);
    }
    return { stamp, value };
  });
}

const safetyKpis = { sif: SIF_KPI_ID, potentialSif: POTENTIAL_SIF_KPI_ID, nmfr: NMFR_KPI_ID };

export function isScorecardSourceRow(row, metricKey, divisionField = 'division') {
  if (divisionField && isExcludedDivision(row[divisionField])) return false;
  const kpi = safetyKpis[metricKey];
  return kpi === undefined || (Number(row.kpi_id) === kpi
    && String(row.org_unit_name ?? '').trim() === INCIDENT_ORG_UNIT_NAME);
}

export function assessCardMonth(rows, metricKey, lastCompletedMonth = getLastCompletedMonthStamp()) {
  const { minAbsoluteChange, minRelativeChange } = getCardMonthConfig(metricKey);
  return assessLatestMonth(buildCardMonthlyPoints(rows, metricKey, lastCompletedMonth),
    { lastCompletedMonth, minAbsoluteChange, minRelativeChange });
}

export {
  OTD_MONTH_COLUMNS, LABOR_MONTH_COLUMNS, SIF_KPI_ID, POTENTIAL_SIF_KPI_ID, NMFR_KPI_ID,
  INCIDENT_ORG_UNIT_NAME, FIXED_MONTH_METRIC_YEAR, SCORECARD_START_STAMP,
  normalizeDivisionValue, isExcludedDivision, getQuarterNumber, getMonthStartStamp,
  getFixedMonthStamp, getOtdRowYear, getLaborRowYear, getIncidentRowStamp,
  getControllableCostsRowStamp, getLaborNewRowStamp, getLaborCategoryGroup,
  getLaborUtilizationNewCategoryGroup, calculateNmfrValueFromRows,
  getCardMonthConfig, buildCardMonthlyPoints, hasKpiValue
};
