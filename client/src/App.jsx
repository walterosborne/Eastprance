import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faAsterisk,
  faCalculator,
  faChartColumn,
  faChartLine,
  faClipboardCheck,
  faMoon,
  faSeedling,
  faSun
} from '@fortawesome/free-solid-svg-icons';
import {
  FormControl,
  MenuItem,
  Paper,
  Select,
  Slider,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import {
  ChartsTooltipContainer,
  useAxesTooltip,
  useItemTooltip
} from '@mui/x-charts/ChartsTooltip';
import { DEFAULT_METRIC_INFO, METRIC_INFO } from './metricInfo';

const ALL_FILTER_VALUE = '__all__';
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
const LABOR_MONTH_COLUMNS = [
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
const SIF_KPI_ID = 5;
const POTENTIAL_SIF_KPI_ID = 6;
const NMFR_KPI_ID = 4;
const INCIDENT_ORG_UNIT_NAME = 'Defense';

const INCIDENT_VIEW_CONFIG = {
  monthly: {
    label: 'Monthly'
  },
  quarterly: {
    label: 'Quarterly'
  },
  yearly: {
    label: 'Annual'
  }
};

const OTD_VIEW_CONFIG = {
  monthly: {
    label: 'Monthly'
  },
  quarterly: {
    label: 'Quarterly'
  },
  yearly: {
    label: 'Annual'
  }
};

const CONTROLLABLE_COSTS_VIEW_CONFIG = {
  quarterly: {
    label: 'Quarterly'
  },
  yearly: {
    label: 'Annual'
  }
};

const CARD_CHIP_OPTIONS = [
  {
    key: 'all',
    label: 'All',
    icon: faAsterisk,
    cardKeys: ['controllableCosts', 'sif', 'potentialSif', 'nmfr', 'otd', 'labor']
  },
  {
    key: 'businessManagement',
    label: 'Business Management',
    icon: faCalculator,
    cardKeys: ['controllableCosts', 'labor']
  },
  {
    key: 'ehss',
    label: 'EHS&S',
    icon: faSeedling,
    cardKeys: ['sif', 'potentialSif', 'nmfr']
  },
  {
    key: 'programManagement',
    label: 'Program Management',
    icon: faClipboardCheck,
    cardKeys: ['otd']
  }
];

const DEFAULT_CHART_VARIANTS = {
  controllableCosts: 'line',
  sif: 'line',
  potentialSif: 'line',
  nmfr: 'line',
  otd: 'line',
  labor: 'line'
};

const LABOR_VIEW_CONFIG = {
  monthly: {
    label: 'Monthly',
    bucketSize: 1,
    bucketFormatter: (_month, index) => LABOR_MONTH_COLUMNS[index].label
  },
  quarterly: {
    label: 'Quarterly',
    bucketSize: 3,
    bucketFormatter: (_month, index) => `Q${Math.floor(index / 3) + 1} 2026`
  },
  yearly: {
    label: 'Annual',
    bucketSize: 12,
    bucketFormatter: () => '2026'
  }
};

const DEFAULT_CHART_MARGIN = { top: 12, right: 12, bottom: 20, left: 0 };
const INCIDENT_CHART_MARGIN = { top: 2, right: 12, bottom: 14, left: 0 };
const LABOR_CHART_MARGIN = { top: 12, right: 12, bottom: 20, left: 0 };
const CHART_HEIGHT = 332;
const INCIDENT_CHART_HEIGHT = 366;
const INCIDENT_X_AXIS_HEIGHT = 24;
const FIXED_MONTH_METRIC_YEAR = 2026;
const OTD_Y_AXIS = [
  {
    width: 66,
    valueFormatter: formatCompactNumber,
    tickLabelStyle: { fontSize: 11 }
  }
];
const SIF_Y_AXIS = [
  {
    width: 44,
    valueFormatter: formatIncidentCount,
    tickLabelStyle: { fontSize: 11 }
  }
];
const NMFR_Y_AXIS = [
  {
    width: 52,
    valueFormatter: formatNumber,
    tickLabelStyle: { fontSize: 11 }
  }
];
const LABOR_Y_AXIS = [
  {
    width: 52,
    valueFormatter: formatPercentAxis,
    tickLabelStyle: { fontSize: 11 }
  }
];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const wholeNumberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});
const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});
const monthYearFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
});

const sharedChartSx = {
  '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': {
    stroke: 'var(--chart-grid)'
  },
  '& .MuiChartsGrid-line': {
    stroke: 'var(--chart-grid)'
  },
  '& .MuiChartsAxis-tickLabel, & .MuiChartsLegend-label': {
    fill: 'var(--chart-text)'
  }
};

const timelineToggleGroupSx = {
  width: '100%',
  minWidth: 0,
  maxWidth: '100%',
  display: 'flex',
  alignItems: 'stretch',
  backgroundColor: 'var(--surface-muted)',
  border: '1px solid var(--border)',
  borderRadius: '18px',
  padding: '0.25rem',
  overflow: 'hidden',
  '& .MuiToggleButtonGroup-grouped': {
    flex: 1,
    minWidth: 0,
    margin: 0,
    border: 0
  }
};

const timelineToggleButtonSx = {
  width: '100%',
  minWidth: 0,
  border: 0,
  borderRadius: '14px !important',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  fontWeight: 600,
  lineHeight: 1.1,
  px: 0.6,
  py: 0.55,
  textTransform: 'none',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  '&.Mui-selected': {
    backgroundColor: 'var(--selected-bg)',
    color: 'var(--selected-text)'
  },
  '&.Mui-selected:hover': {
    backgroundColor: 'var(--selected-bg)'
  }
};

const chartTypeToggleGroupSx = {
  display: 'inline-flex',
  alignItems: 'center',
  minWidth: 0,
  backgroundColor: 'var(--surface-muted)',
  border: '1px solid var(--border)',
  borderRadius: '999px',
  padding: '0.16rem',
  overflow: 'hidden',
  '& .MuiToggleButtonGroup-grouped': {
    margin: 0,
    border: 0
  }
};

const chartTypeToggleButtonSx = {
  minWidth: 28,
  width: 28,
  height: 28,
  border: 0,
  borderRadius: '999px !important',
  color: 'var(--text-secondary)',
  padding: 0,
  '&.Mui-selected': {
    backgroundColor: 'var(--selected-bg)',
    color: 'var(--selected-text)'
  },
  '&.Mui-selected:hover': {
    backgroundColor: 'var(--selected-bg)'
  }
};

const dateSliderSx = {
  color: 'var(--selected-bg)',
  px: 1.1,
  py: 0.75,
  '& .MuiSlider-rail': {
    backgroundColor: 'var(--border)',
    opacity: 1
  },
  '& .MuiSlider-track': {
    border: 'none'
  },
  '& .MuiSlider-thumb': {
    width: 14,
    height: 14,
    backgroundColor: 'var(--selected-bg)',
    boxShadow: 'none',
    '&::before': {
      boxShadow: 'none'
    },
    '&:hover, &.Mui-focusVisible, &.Mui-active': {
      boxShadow: '0 0 0 8px color-mix(in srgb, var(--selected-bg) 18%, transparent)'
    }
  },
  '& .MuiSlider-markLabel': {
    color: 'var(--text-secondary)',
    fontSize: '0.68rem',
    lineHeight: 1.1
  },
  '& .MuiSlider-valueLabel': {
    backgroundColor: 'var(--selected-bg)',
    color: 'var(--selected-text)',
    fontSize: '0.68rem',
    fontWeight: 700
  }
};

function formatCurrency(value) {
  return currencyFormatter.format(value ?? 0);
}

function formatNumber(value) {
  return numberFormatter.format(value ?? 0);
}

function formatCompactNumber(value) {
  const numericValue = Number(value ?? 0);

  if (Math.abs(numericValue) >= 1000) {
    return `${compactNumberFormatter.format(numericValue / 1000)}k`;
  }

  return numberFormatter.format(numericValue);
}

function formatCompactCurrency(value) {
  const numericValue = Number(value ?? 0);

  if (Math.abs(numericValue) >= 1000) {
    const sign = numericValue < 0 ? '-' : '';

    return `${sign}$${formatCompactNumber(Math.abs(numericValue))}`;
  }

  return currencyFormatter.format(numericValue);
}

function formatCompactWholeNumber(value) {
  const roundedValue = Math.round(Number(value ?? 0));
  const sign = roundedValue < 0 ? '-' : '';
  const absoluteValue = Math.abs(roundedValue);

  if (absoluteValue >= 1000) {
    return `${sign}${wholeNumberFormatter.format(Math.round(absoluteValue / 1000))}k`;
  }

  return `${sign}${wholeNumberFormatter.format(absoluteValue)}`;
}

function formatHours(value) {
  return `${wholeNumberFormatter.format(Math.round(Number(value ?? 0)))} hours`;
}

function formatUnits(value) {
  return `${formatNumber(value)} units`;
}

function formatPercentOfTotal(value, total) {
  const numericValue = Number(value ?? 0);
  const numericTotal = Number(total ?? 0);

  if (!Number.isFinite(numericValue) || !Number.isFinite(numericTotal) || numericTotal <= 0) {
    return percentFormatter.format(0);
  }

  return percentFormatter.format(numericValue / numericTotal);
}

function formatPercentValue(value) {
  return percentFormatter.format(Number(value ?? 0));
}

function formatPercentAxis(value) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}

function formatIncidentCount(value) {
  return wholeNumberFormatter.format(Math.round(Number(value ?? 0)));
}

function formatCompactHours(value) {
  return `${formatCompactWholeNumber(value)} hours`;
}

function formatCompactHoursAxis(value) {
  return `${formatCompactWholeNumber(value)} hrs`;
}

function formatDebugDuration(durationMs) {
  return `${durationMs.toFixed(1)}ms`;
}

function sumActualValues(rows) {
  return rows.reduce((sum, row) => {
    const numericValue = Number(row.actual_value);
    return Number.isFinite(numericValue) ? sum + numericValue : sum;
  }, 0);
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

function logClientDebug(scope, message, metadata) {
  const prefix = `[${new Date().toISOString()}] [client:${scope}] ${message}`;

  if (metadata) {
    console.log(prefix, metadata);
    return;
  }

  console.log(prefix);
}

function getSourceLabel(source) {
  if (source === 'mssql') {
    return 'SQL Server data';
  }

  if (source === 'json') {
    return 'Local JSON data';
  }

  if (source === 'excel' || source === 'dummy') {
    return 'Local fallback data';
  }

  return '';
}

function getFilterOptions(rows, fieldName) {
  return Array.from(
    new Set(rows.map((row) => row[fieldName]).filter((value) => typeof value === 'string' && value))
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeFilterValue(value, options) {
  if (value === ALL_FILTER_VALUE) {
    return ALL_FILTER_VALUE;
  }

  return options.includes(value) ? value : ALL_FILTER_VALUE;
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
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

function formatMonthStamp(stamp) {
  return monthYearFormatter.format(new Date(stamp));
}

function getControllableCostsRowStamp(row) {
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

function isStampWithinDateRange(stamp, selectedDateRange) {
  if (!selectedDateRange) {
    return true;
  }

  if (stamp == null) {
    return false;
  }

  return stamp >= selectedDateRange.startStamp && stamp <= selectedDateRange.endStamp;
}

function getAvailableTimelineStamps({
  controllableCostsRows,
  sifRows,
  potentialSifRows,
  nmfrRows,
  hasOtdRows,
  hasLaborRows
}) {
  const stampSet = new Set();

  controllableCostsRows.forEach((row) => {
    const stamp = getControllableCostsRowStamp(row);

    if (stamp != null) {
      stampSet.add(stamp);
    }
  });

  [sifRows, potentialSifRows, nmfrRows].forEach((rows) => {
    rows.forEach((row) => {
      const stamp = getIncidentRowStamp(row);

      if (stamp != null) {
        stampSet.add(stamp);
      }
    });
  });

  if (hasOtdRows) {
    OTD_MONTH_COLUMNS.forEach((_month, monthIndex) => {
      stampSet.add(getFixedMonthStamp(FIXED_MONTH_METRIC_YEAR, monthIndex));
    });
  }

  if (hasLaborRows) {
    LABOR_MONTH_COLUMNS.forEach((_month, monthIndex) => {
      stampSet.add(getFixedMonthStamp(FIXED_MONTH_METRIC_YEAR, monthIndex));
    });
  }

  return Array.from(stampSet).sort((left, right) => left - right);
}

function getYtdRangeIndices(availableTimelineStamps) {
  if (availableTimelineStamps.length === 0) {
    return [0, 0];
  }

  const currentMonthStamp = getMonthStartStamp(new Date());
  let endIndex = -1;

  for (let index = availableTimelineStamps.length - 1; index >= 0; index -= 1) {
    if (availableTimelineStamps[index] <= currentMonthStamp) {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1) {
    endIndex = availableTimelineStamps.length - 1;
  }

  const endYear = new Date(availableTimelineStamps[endIndex]).getUTCFullYear();
  const startIndex = availableTimelineStamps.findIndex(
    (stamp) => new Date(stamp).getUTCFullYear() === endYear
  );

  return [startIndex === -1 ? 0 : startIndex, endIndex];
}

function buildControllableCostsChartData(rows, viewMode, selectedDateRange) {
  const buckets = new Map();

  rows.forEach((row) => {
    const cost = Number(row.cost);
    const year = Number(row.year);
    const stamp = getControllableCostsRowStamp(row);

    if (
      !Number.isFinite(cost) ||
      !Number.isInteger(year) ||
      !isStampWithinDateRange(stamp, selectedDateRange)
    ) {
      return;
    }

    let bucketKey = '';
    let bucketLabel = '';
    let sortValue = 0;

    if (viewMode === 'quarterly') {
      const quarterNumber = getQuarterNumber(row.quarter);

      if (quarterNumber == null) {
        return;
      }

      bucketKey = `${year}-Q${quarterNumber}`;
      bucketLabel = `Q${quarterNumber} ${year}`;
      sortValue = year * 10 + quarterNumber;
    } else {
      bucketKey = String(year);
      bucketLabel = String(year);
      sortValue = year;
    }

    const currentBucket = buckets.get(bucketKey) ?? {
      label: bucketLabel,
      sortValue,
      controllable: 0,
      uncontrollable: 0
    };

    if (row.controllable === 'Controllable') {
      currentBucket.controllable += cost;
    } else {
      currentBucket.uncontrollable += cost;
    }

    buckets.set(bucketKey, currentBucket);
  });

  const sortedBuckets = Array.from(buckets.values()).sort(
    (left, right) => left.sortValue - right.sortValue
  );

  return {
    labels: sortedBuckets.map((bucket) => bucket.label),
    controllable: sortedBuckets.map((bucket) => Number(bucket.controllable.toFixed(2))),
    uncontrollable: sortedBuckets.map((bucket) => Number(bucket.uncontrollable.toFixed(2)))
  };
}

function buildIncidentChartData(
  rows,
  kpiId,
  orgUnitName,
  viewMode,
  selectedDateRange,
  aggregationMode = 'sum'
) {
  const buckets = new Map();

  rows.forEach((row) => {
    if (Number(row.kpi_id) !== kpiId || normalizeText(row.org_unit_name) !== orgUnitName) {
      return;
    }

    const actualValue = Number(row.actual_value);
    const stamp = getIncidentRowStamp(row);
    const referenceDate = stamp == null ? new Date('') : new Date(stamp);

    if (
      !Number.isFinite(actualValue) ||
      Number.isNaN(referenceDate.getTime()) ||
      !isStampWithinDateRange(stamp, selectedDateRange)
    ) {
      return;
    }

    const year = referenceDate.getUTCFullYear();
    const monthIndex = referenceDate.getUTCMonth();
    let bucketKey = '';
    let bucketLabel = '';
    let sortValue = 0;

    if (viewMode === 'quarterly') {
      const quarterNumber = Math.floor(monthIndex / 3) + 1;
      bucketKey = `${year}-Q${quarterNumber}`;
      bucketLabel = `Q${quarterNumber} ${year}`;
      sortValue = year * 10 + quarterNumber;
    } else if (viewMode === 'yearly') {
      bucketKey = String(year);
      bucketLabel = String(year);
      sortValue = year;
    } else {
      const bucketDate = new Date(Date.UTC(year, monthIndex, 1));
      bucketKey = bucketDate.toISOString().slice(0, 10);
      bucketLabel = monthYearFormatter.format(bucketDate);
      sortValue = bucketDate.getTime();
    }

    const currentBucket = buckets.get(bucketKey) ?? {
      label: bucketLabel,
      sortValue,
      total: 0,
      count: 0
    };

    currentBucket.total += actualValue;
    currentBucket.count += 1;
    buckets.set(bucketKey, currentBucket);
  });

  return Array.from(buckets.values())
    .sort((left, right) => left.sortValue - right.sortValue)
    .map((bucket) => ({
      label: bucket.label,
      total:
        aggregationMode === 'average'
          ? Number((bucket.total / Math.max(bucket.count, 1)).toFixed(2))
          : Math.round(bucket.total)
    }));
}

function getOtdBuckets(viewMode, selectedDateRange) {
  const monthIndicesInRange = OTD_MONTH_COLUMNS.map((_month, monthIndex) => monthIndex).filter(
    (monthIndex) =>
      isStampWithinDateRange(
        getFixedMonthStamp(FIXED_MONTH_METRIC_YEAR, monthIndex),
        selectedDateRange
      )
  );

  if (viewMode === 'monthly') {
    return monthIndicesInRange.map((monthIndex) => ({
      label: OTD_MONTH_COLUMNS[monthIndex].label,
      monthIndices: [monthIndex]
    }));
  }

  if (viewMode === 'quarterly') {
    return [0, 3, 6, 9]
      .map((startIndex, quarterIndex) => {
        const quarterMonthIndices = [startIndex, startIndex + 1, startIndex + 2].filter(
          (monthIndex) => monthIndicesInRange.includes(monthIndex)
        );

        if (quarterMonthIndices.length === 0) {
          return null;
        }

        return {
          label: `Q${quarterIndex + 1} ${FIXED_MONTH_METRIC_YEAR}`,
          monthIndices: quarterMonthIndices
        };
      })
      .filter(Boolean);
  }

  return monthIndicesInRange.length > 0
    ? [
      {
        label: String(FIXED_MONTH_METRIC_YEAR),
        monthIndices: monthIndicesInRange
      }
    ]
    : [];
}

function buildOtdChartData(rows, viewMode, selectedDateRange) {
  const contractTotals = OTD_MONTH_COLUMNS.map(() => 0);
  const deliveredTotals = OTD_MONTH_COLUMNS.map(() => 0);

  rows.forEach((row) => {
    const targetSeries =
      row.measure_type === 'Contract Commitment'
        ? contractTotals
        : row.measure_type === 'Actuals Delivered' || row.measure_type === 'Actual Delivered'
          ? deliveredTotals
          : null;

    if (!targetSeries) {
      return;
    }

    OTD_MONTH_COLUMNS.forEach(({ key }, index) => {
      const value = Number(row[key]);

      if (Number.isFinite(value)) {
        targetSeries[index] += value;
      }
    });
  });

  const buckets = getOtdBuckets(viewMode, selectedDateRange);

  return {
    labels: buckets.map((bucket) => bucket.label),
    contract: buckets.map((bucket) =>
      Number(
        bucket.monthIndices
          .reduce((sum, monthIndex) => sum + contractTotals[monthIndex], 0)
          .toFixed(2)
      )
    ),
    delivered: buckets.map((bucket) =>
      Number(
        bucket.monthIndices
          .reduce((sum, monthIndex) => sum + deliveredTotals[monthIndex], 0)
          .toFixed(2)
      )
    )
  };
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

function getLaborBuckets(viewMode, selectedDateRange) {
  const bucketConfig = LABOR_VIEW_CONFIG[viewMode];
  const buckets = [];

  for (
    let startIndex = 0;
    startIndex < LABOR_MONTH_COLUMNS.length;
    startIndex += bucketConfig.bucketSize
  ) {
    const monthIndices = [];

    for (
      let monthIndex = startIndex;
      monthIndex < Math.min(startIndex + bucketConfig.bucketSize, LABOR_MONTH_COLUMNS.length);
      monthIndex += 1
    ) {
      if (
        isStampWithinDateRange(
          getFixedMonthStamp(FIXED_MONTH_METRIC_YEAR, monthIndex),
          selectedDateRange
        )
      ) {
        monthIndices.push(monthIndex);
      }
    }

    if (monthIndices.length === 0) {
      continue;
    }

    buckets.push({
      label: bucketConfig.bucketFormatter(LABOR_MONTH_COLUMNS[startIndex], startIndex),
      monthIndices
    });
  }

  return buckets;
}

function buildLaborUtilizationChartData(rows, viewMode, selectedDateRange) {
  const directMonthlyTotals = LABOR_MONTH_COLUMNS.map(() => 0);
  const indirectMonthlyTotals = LABOR_MONTH_COLUMNS.map(() => 0);
  const otherMonthlyTotals = LABOR_MONTH_COLUMNS.map(() => 0);
  let directRowCount = 0;
  let indirectRowCount = 0;
  let otherRowCount = 0;

  rows.forEach((row) => {
    const laborCategoryGroup = getLaborCategoryGroup(row.labor_category);

    if (laborCategoryGroup === 'direct') {
      directRowCount += 1;
    } else if (laborCategoryGroup === 'indirect') {
      indirectRowCount += 1;
    } else {
      otherRowCount += 1;
    }

    const targetSeries =
      laborCategoryGroup === 'direct'
        ? directMonthlyTotals
        : laborCategoryGroup === 'indirect'
          ? indirectMonthlyTotals
          : otherMonthlyTotals;

    LABOR_MONTH_COLUMNS.forEach(({ key }, index) => {
      const value = Number(row[key]);

      if (Number.isFinite(value)) {
        targetSeries[index] += value;
      }
    });
  });

  const buckets = getLaborBuckets(viewMode, selectedDateRange);
  const tooltipLookup = {};

  const direct = buckets.map(({ label, monthIndices }) => {
    const total = monthIndices.reduce(
      (sum, monthIndex) => sum + directMonthlyTotals[monthIndex],
      0
    );
    const normalizedTotal = Math.round(total);

    tooltipLookup[label] = {
      ...(tooltipLookup[label] || {}),
      direct: normalizedTotal
    };

    return normalizedTotal;
  });

  const indirect = buckets.map(({ label, monthIndices }) => {
    const total = monthIndices.reduce(
      (sum, monthIndex) => sum + indirectMonthlyTotals[monthIndex],
      0
    );
    const normalizedTotal = Math.round(total);

    tooltipLookup[label] = {
      ...(tooltipLookup[label] || {}),
      indirect: normalizedTotal
    };

    return normalizedTotal;
  });

  const other = buckets.map(({ label, monthIndices }) => {
    const total = monthIndices.reduce(
      (sum, monthIndex) => sum + otherMonthlyTotals[monthIndex],
      0
    );
    const normalizedTotal = Math.round(total);

    tooltipLookup[label] = {
      ...(tooltipLookup[label] || {}),
      other: normalizedTotal
    };

    return normalizedTotal;
  });

  const totals = buckets.map(({ label }, index) => {
    const total = Math.round(direct[index] + indirect[index] + other[index]);

    tooltipLookup[label] = {
      ...tooltipLookup[label],
      total
    };

    return total;
  });

  const directShare = buckets.map(({ label }, index) => {
    const total = totals[index];
    const share = total > 0 ? direct[index] / total : 0;

    tooltipLookup[label] = {
      ...tooltipLookup[label],
      directShare: share
    };

    return share;
  });

  return {
    labels: buckets.map((bucket) => bucket.label),
    totals,
    direct,
    indirect,
    other,
    directShare,
    directRowCount,
    indirectRowCount,
    otherRowCount,
    tooltipLookup
  };
}

function TooltipMark({ color }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        marginRight: 10,
        borderRadius: '999px',
        backgroundColor: color,
        verticalAlign: 'middle'
      }}
    />
  );
}

function renderTooltipTable({ axisId, bucketLabel, seriesItems, extraRows = [] }) {
  return (
    <table
      key={axisId}
      style={{
        borderCollapse: 'collapse',
        borderSpacing: 0,
        minWidth: 220
      }}
    >
      <caption
        style={{
          padding: '8px 12px',
          textAlign: 'left',
          borderBottom: '1px solid var(--border)',
          color: 'var(--input-text)',
          fontWeight: 600
        }}
      >
        {bucketLabel}
      </caption>
      <tbody>
        {seriesItems
          .filter((seriesItem) => seriesItem.formattedValue != null)
          .map((seriesItem) => (
            <tr key={seriesItem.seriesId}>
              <th
                style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontWeight: 500,
                  whiteSpace: 'nowrap'
                }}
              >
                <TooltipMark color={seriesItem.color} />
                {seriesItem.formattedLabel || ''}
              </th>
              <td
                style={{
                  padding: '8px 12px',
                  textAlign: 'right',
                  fontWeight: 600,
                  whiteSpace: 'nowrap'
                }}
              >
                {seriesItem.formattedValue}
              </td>
            </tr>
          ))}
        {extraRows.map((row) => (
          <tr key={row.label}>
            <th
              style={{
                padding: '8px 12px',
                textAlign: 'left',
                fontWeight: 500,
                whiteSpace: 'nowrap'
              }}
            >
              <TooltipMark color={row.color} />
              {row.label}
            </th>
            <td
              style={{
                padding: '8px 12px',
                textAlign: 'right',
                fontWeight: 600,
                whiteSpace: 'nowrap'
              }}
            >
              {row.formattedValue}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StandardChartTooltip(props) {
  const tooltipData = useAxesTooltip();

  if (!tooltipData?.length) {
    return null;
  }

  return (
    <ChartsTooltipContainer {...props}>
      <Paper
        elevation={6}
        sx={{
          overflow: 'hidden',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--input-bg)',
          color: 'var(--input-text)'
        }}
      >
        {tooltipData.map(({ axisId, axisFormattedValue, seriesItems }) =>
          renderTooltipTable({
            axisId,
            bucketLabel: String(axisFormattedValue),
            seriesItems
          })
        )}
      </Paper>
    </ChartsTooltipContainer>
  );
}

function MetricTrendChart({
  variant,
  width,
  height,
  margin,
  labels,
  xAxisHeight = 28,
  yAxis,
  series,
  hideLegend = false,
  tooltipComponent = StandardChartTooltip,
  tooltipTrigger = 'axis',
  tooltipProps = {},
  sx = sharedChartSx
}) {
  const chartProps = {
    width,
    height,
    hideLegend,
    margin,
    xAxis: [
      {
        scaleType: variant === 'bar' ? 'band' : 'point',
        height: xAxisHeight,
        data: labels
      }
    ],
    yAxis,
    series:
      variant === 'bar'
        ? series.map(({ showMark, ...seriesConfig }) => seriesConfig)
        : series.map((seriesConfig) => ({
          ...seriesConfig,
          showMark: seriesConfig.showMark ?? false
        })),
    grid: { horizontal: true },
    sx,
    slots: {
      tooltip: tooltipComponent
    },
    slotProps: {
      tooltip: {
        trigger: tooltipTrigger,
        ...tooltipProps
      }
    }
  };

  if (variant === 'bar') {
    return <BarChart {...chartProps} />;
  }

  return <LineChart {...chartProps} />;
}

function ChartTypeToggle({ value, onChange }) {
  return (
    <div className="chart-type-toggle-bar">
      <ToggleButtonGroup
        value={value}
        exclusive
        size="small"
        onChange={(_event, nextVariant) => {
          if (nextVariant) {
            onChange(nextVariant);
          }
        }}
        sx={chartTypeToggleGroupSx}
        aria-label="Chart type"
      >
        <ToggleButton value="line" sx={chartTypeToggleButtonSx} aria-label="Line chart">
          <FontAwesomeIcon icon={faChartLine} />
        </ToggleButton>
        <ToggleButton value="bar" sx={chartTypeToggleButtonSx} aria-label="Bar chart">
          <FontAwesomeIcon icon={faChartColumn} />
        </ToggleButton>
      </ToggleButtonGroup>
    </div>
  );
}

function CardHeader({ title, info }) {
  const metricInfo = info || DEFAULT_METRIC_INFO;

  return (
    <div className="card-header">
      <h2 className="card-title">{title}</h2>
      <div className="card-info">
        <button
          type="button"
          className="card-info-trigger"
          aria-label={`${title} metric info`}
        >
          ?
        </button>
        <div className="card-info-tooltip" role="tooltip">
          {metricInfo}
        </div>
      </div>
    </div>
  );
}

function MetricSummaryPanel({ title, value }) {
  return (
    <section className="filter-panel filter-panel-collapsed metric-summary-panel">
      <p className="metric-summary-title">{title}</p>
      <p className="metric-summary-value">{value}</p>
    </section>
  );
}

function LaborChartTooltip(props) {
  const { chartData, ...tooltipProps } = props;
  const tooltipData = useAxesTooltip();

  if (!tooltipData?.length) {
    return null;
  }

  return (
    <ChartsTooltipContainer {...tooltipProps}>
      <Paper
        elevation={6}
        sx={{
          overflow: 'hidden',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--input-bg)',
          color: 'var(--input-text)'
        }}
      >
        {tooltipData.map(({ axisId, axisFormattedValue, seriesItems }) => {
          const bucketLabel = String(axisFormattedValue);
          const bucketValues = chartData.tooltipLookup[bucketLabel];
          const directHours = bucketValues?.direct ?? 0;
          const totalHours = bucketValues?.total ?? 0;
          const directShare = bucketValues?.directShare ?? 0;
          const seriesItem = seriesItems[0];

          return renderTooltipTable({
            axisId,
            bucketLabel,
            seriesItems: seriesItem
              ? [
                {
                  ...seriesItem,
                  formattedValue: formatPercentValue(directShare)
                }
              ]
              : [],
            extraRows: [
              {
                label: 'Direct hours',
                color: 'var(--chart-accent-line)',
                formattedValue: formatHours(directHours)
              },
              {
                label: 'Total hours',
                color: 'var(--chart-secondary-line)',
                formattedValue: formatHours(totalHours)
              }
            ]
          });
        })}
      </Paper>
    </ChartsTooltipContainer>
  );
}

function LaborBarChartTooltip(props) {
  const { chartData, ...tooltipProps } = props;
  const tooltipItem = useItemTooltip();

  if (!tooltipItem) {
    return null;
  }

  const dataIndex = tooltipItem.identifier?.dataIndex ?? -1;
  const bucketLabel = chartData.labels[dataIndex] ?? '';
  const bucketValues = chartData.tooltipLookup[bucketLabel];
  const directShare = bucketValues?.directShare ?? Number(tooltipItem.value ?? 0);
  const directHours = bucketValues?.direct ?? 0;
  const totalHours = bucketValues?.total ?? 0;

  return (
    <ChartsTooltipContainer {...tooltipProps}>
      <Paper
        elevation={6}
        sx={{
          overflow: 'hidden',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--input-bg)',
          color: 'var(--input-text)'
        }}
      >
        {renderTooltipTable({
          axisId: `directShare-${dataIndex}`,
          bucketLabel,
          seriesItems: [
            {
              seriesId: 'directShare',
              color: tooltipItem.color,
              formattedLabel: tooltipItem.label ?? '',
              formattedValue: formatPercentValue(directShare)
            }
          ],
          extraRows: [
            {
              label: 'Direct hours',
              color: 'var(--chart-accent-line)',
              formattedValue: formatHours(directHours)
            },
            {
              label: 'Total hours',
              color: 'var(--chart-secondary-line)',
              formattedValue: formatHours(totalHours)
            }
          ]
        })}
      </Paper>
    </ChartsTooltipContainer>
  );
}

function useChartWidth() {
  const [chartHost, setChartHost] = useState(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    if (!chartHost) {
      return undefined;
    }

    const updateChartWidth = (width) => {
      setChartWidth(Math.max(0, Math.floor(width)));
    };

    const measureChartWidth = () => {
      updateChartWidth(chartHost.clientWidth);
    };

    measureChartWidth();

    const frameId =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(measureChartWidth)
        : null;

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        if (frameId != null && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(frameId);
        }
      };
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry) {
        updateChartWidth(entry.contentRect.width);
      }
    });

    observer.observe(chartHost);

    return () => {
      observer.disconnect();

      if (frameId != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frameId);
      }
    };
  }, [chartHost]);

  return { chartHostRef: setChartHost, chartWidth };
}

async function fetchJson(scope, url) {
  const startTime = performance.now();

  logClientDebug(scope, 'Starting fetch.', { url });

  const response = await fetch(url);

  logClientDebug(scope, 'Received HTTP response.', {
    url,
    status: response.status,
    ok: response.ok,
    duration: formatDebugDuration(performance.now() - startTime)
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const payload = await response.json();

  logClientDebug(scope, 'Parsed JSON payload.', {
    source: payload.source,
    rowCount: payload.rowCount,
    tableName: payload.tableName,
    fileName: payload.fileName,
    fallbackReason: payload.fallbackReason,
    totalDuration: formatDebugDuration(performance.now() - startTime)
  });

  return payload;
}

export default function App() {
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    return window.localStorage.getItem('expense-theme-mode') === 'dark' ? 'dark' : 'light';
  });
  const [controllableCostsState, setControllableCostsState] = useState({
    rows: [],
    loading: true,
    error: '',
    source: ''
  });
  const [sifState, setSifState] = useState({
    rows: [],
    loading: true,
    error: '',
    source: ''
  });
  const [potentialSifState, setPotentialSifState] = useState({
    rows: [],
    loading: true,
    error: '',
    source: ''
  });
  const [nmfrState, setNmfrState] = useState({
    rows: [],
    loading: true,
    error: '',
    source: ''
  });
  const [otdState, setOtdState] = useState({
    rows: [],
    loading: true,
    error: '',
    source: ''
  });
  const [laborState, setLaborState] = useState({
    rows: [],
    loading: true,
    error: '',
    source: ''
  });
  const [selectedControllableAddress, setSelectedControllableAddress] = useState(ALL_FILTER_VALUE);
  const [selectedControllableCostElementDescription, setSelectedControllableCostElementDescription] =
    useState(ALL_FILTER_VALUE);
  const [controllableCostsViewMode, setControllableCostsViewMode] = useState('quarterly');
  const [sifViewMode, setSifViewMode] = useState('monthly');
  const [potentialSifViewMode, setPotentialSifViewMode] = useState('monthly');
  const [nmfrViewMode, setNmfrViewMode] = useState('monthly');
  const [selectedProgram, setSelectedProgram] = useState(ALL_FILTER_VALUE);
  const [selectedSite, setSelectedSite] = useState(ALL_FILTER_VALUE);
  const [selectedOtdType, setSelectedOtdType] = useState(ALL_FILTER_VALUE);
  const [otdViewMode, setOtdViewMode] = useState('monthly');
  const [selectedForecastedCc, setSelectedForecastedCc] = useState(ALL_FILTER_VALUE);
  const [selectedPool, setSelectedPool] = useState(ALL_FILTER_VALUE);
  const [selectedUnionType, setSelectedUnionType] = useState(ALL_FILTER_VALUE);
  const [selectedWorkerType, setSelectedWorkerType] = useState(ALL_FILTER_VALUE);
  const [selectedTimeType, setSelectedTimeType] = useState(ALL_FILTER_VALUE);
  const [laborViewMode, setLaborViewMode] = useState('monthly');
  const [selectedCardGroup, setSelectedCardGroup] = useState('all');
  const [chartVariants, setChartVariants] = useState(DEFAULT_CHART_VARIANTS);
  const [selectedDateRangeIndices, setSelectedDateRangeIndices] = useState([0, 0]);
  const [hasCustomizedDateRange, setHasCustomizedDateRange] = useState(false);
  const [isControllableCostsFiltersOpen, setIsControllableCostsFiltersOpen] = useState(false);
  const [isOtdFiltersOpen, setIsOtdFiltersOpen] = useState(false);
  const [isLaborFiltersOpen, setIsLaborFiltersOpen] = useState(false);
  const {
    chartHostRef: controllableCostsChartHostRef,
    chartWidth: controllableCostsChartWidth
  } = useChartWidth();
  const { chartHostRef: sifChartHostRef, chartWidth: sifChartWidth } = useChartWidth();
  const { chartHostRef: potentialSifChartHostRef, chartWidth: potentialSifChartWidth } =
    useChartWidth();
  const { chartHostRef: nmfrChartHostRef, chartWidth: nmfrChartWidth } = useChartWidth();
  const { chartHostRef: otdChartHostRef, chartWidth: otdChartWidth } = useChartWidth();
  const { chartHostRef: laborChartHostRef, chartWidth: laborChartWidth } = useChartWidth();

  useEffect(() => {
    let isMounted = true;

    async function loadControllableCostsData() {
      const startTime = performance.now();

      try {
        const payload = await fetchJson('controllable-costs', '/api/controllable-costs');

        if (!isMounted) {
          logClientDebug(
            'controllable-costs',
            'Component unmounted before controllable costs state update.'
          );
          return;
        }

        setControllableCostsState({
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          loading: false,
          error: '',
          source: getSourceLabel(payload.source)
        });
        setSelectedControllableAddress(ALL_FILTER_VALUE);
        setSelectedControllableCostElementDescription(ALL_FILTER_VALUE);
        setControllableCostsViewMode('quarterly');

        logClientDebug('controllable-costs', 'Controllable costs state updated.', {
          rowCount: Array.isArray(payload.rows) ? payload.rows.length : 0,
          source: payload.source,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          logClientDebug(
            'controllable-costs',
            'Component unmounted after controllable costs load failure.',
            {
              error: error.message
            }
          );
          return;
        }

        setControllableCostsState({
          rows: [],
          loading: false,
          error: error.message || 'Unable to load controllable costs data.',
          source: ''
        });

        logClientDebug('controllable-costs', 'Controllable costs load failed.', {
          error: error.message,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      }
    }

    async function loadSifData() {
      const startTime = performance.now();

      try {
        const payload = await fetchJson('sif', '/api/sif-incidents');

        if (!isMounted) {
          logClientDebug('sif', 'Component unmounted before SIF state update.');
          return;
        }

        setSifState({
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          loading: false,
          error: '',
          source: getSourceLabel(payload.source)
        });
        setSifViewMode('monthly');

        logClientDebug('sif', 'SIF state updated.', {
          rowCount: Array.isArray(payload.rows) ? payload.rows.length : 0,
          source: payload.source,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          logClientDebug('sif', 'Component unmounted after SIF load failure.', {
            error: error.message
          });
          return;
        }

        setSifState({
          rows: [],
          loading: false,
          error: error.message || 'Unable to load SIF data.',
          source: ''
        });

        logClientDebug('sif', 'SIF load failed.', {
          error: error.message,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      }
    }

    async function loadPotentialSifData() {
      const startTime = performance.now();

      try {
        const payload = await fetchJson('potential-sif', '/api/potential-sif-incidents');

        if (!isMounted) {
          logClientDebug('potential-sif', 'Component unmounted before potential SIF state update.');
          return;
        }

        setPotentialSifState({
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          loading: false,
          error: '',
          source: getSourceLabel(payload.source)
        });
        setPotentialSifViewMode('monthly');

        logClientDebug('potential-sif', 'Potential SIF state updated.', {
          rowCount: Array.isArray(payload.rows) ? payload.rows.length : 0,
          source: payload.source,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          logClientDebug('potential-sif', 'Component unmounted after potential SIF load failure.', {
            error: error.message
          });
          return;
        }

        setPotentialSifState({
          rows: [],
          loading: false,
          error: error.message || 'Unable to load potential SIF data.',
          source: ''
        });

        logClientDebug('potential-sif', 'Potential SIF load failed.', {
          error: error.message,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      }
    }

    async function loadNmfrData() {
      const startTime = performance.now();

      try {
        const payload = await fetchJson('nmfr', '/api/nmfr');

        if (!isMounted) {
          logClientDebug('nmfr', 'Component unmounted before NMFR state update.');
          return;
        }

        setNmfrState({
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          loading: false,
          error: '',
          source: getSourceLabel(payload.source)
        });
        setNmfrViewMode('monthly');

        logClientDebug('nmfr', 'NMFR state updated.', {
          rowCount: Array.isArray(payload.rows) ? payload.rows.length : 0,
          source: payload.source,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          logClientDebug('nmfr', 'Component unmounted after NMFR load failure.', {
            error: error.message
          });
          return;
        }

        setNmfrState({
          rows: [],
          loading: false,
          error: error.message || 'Unable to load NMFR data.',
          source: ''
        });

        logClientDebug('nmfr', 'NMFR load failed.', {
          error: error.message,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      }
    }

    async function loadOtdData() {
      const startTime = performance.now();

      try {
        const payload = await fetchJson('otd', '/api/otd');

        if (!isMounted) {
          logClientDebug('otd', 'Component unmounted before OTD state update.');
          return;
        }

        setOtdState({
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          loading: false,
          error: '',
          source: getSourceLabel(payload.source)
        });
        setSelectedProgram(ALL_FILTER_VALUE);
        setSelectedSite(ALL_FILTER_VALUE);
        setSelectedOtdType(ALL_FILTER_VALUE);
        setOtdViewMode('monthly');

        logClientDebug('otd', 'OTD state updated.', {
          rowCount: Array.isArray(payload.rows) ? payload.rows.length : 0,
          source: payload.source,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          logClientDebug('otd', 'Component unmounted after OTD load failure.', {
            error: error.message
          });
          return;
        }

        setOtdState({
          rows: [],
          loading: false,
          error: error.message || 'Unable to load OTD data.',
          source: ''
        });

        logClientDebug('otd', 'OTD load failed.', {
          error: error.message,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      }
    }

    async function loadLaborData() {
      const startTime = performance.now();

      try {
        const payload = await fetchJson('labor', '/api/labor-utilization');

        if (!isMounted) {
          logClientDebug('labor', 'Component unmounted before labor state update.');
          return;
        }

        setLaborState({
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          loading: false,
          error: '',
          source: getSourceLabel(payload.source)
        });
        setSelectedForecastedCc(ALL_FILTER_VALUE);
        setSelectedPool(ALL_FILTER_VALUE);
        setSelectedUnionType(ALL_FILTER_VALUE);
        setSelectedWorkerType(ALL_FILTER_VALUE);
        setSelectedTimeType(ALL_FILTER_VALUE);
        setLaborViewMode('monthly');

        logClientDebug('labor', 'Labor state updated.', {
          rowCount: Array.isArray(payload.rows) ? payload.rows.length : 0,
          source: payload.source,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          logClientDebug('labor', 'Component unmounted after labor load failure.', {
            error: error.message
          });
          return;
        }

        setLaborState({
          rows: [],
          loading: false,
          error: error.message || 'Unable to load labor utilization data.',
          source: ''
        });

        logClientDebug('labor', 'Labor load failed.', {
          error: error.message,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      }
    }

    logClientDebug('dashboard', 'Starting dashboard data load.');

    loadControllableCostsData();
    loadSifData();
    loadPotentialSifData();
    loadNmfrData();
    loadOtdData();
    loadLaborData();

    return () => {
      isMounted = false;
      logClientDebug('dashboard', 'Dashboard component unmounted.');
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    window.localStorage.setItem('expense-theme-mode', themeMode);
  }, [themeMode]);

  const availableTimelineStamps = getAvailableTimelineStamps({
    controllableCostsRows: controllableCostsState.rows,
    sifRows: sifState.rows,
    potentialSifRows: potentialSifState.rows,
    nmfrRows: nmfrState.rows,
    hasOtdRows: otdState.rows.length > 0,
    hasLaborRows: laborState.rows.length > 0
  });
  const availableTimelineKey = availableTimelineStamps.join('|');

  useEffect(() => {
    if (availableTimelineStamps.length === 0) {
      return;
    }

    const maxIndex = availableTimelineStamps.length - 1;

    setSelectedDateRangeIndices((currentRange) => {
      const normalizedCurrentRange =
        Array.isArray(currentRange) && currentRange.length === 2 ? currentRange : [0, maxIndex];
      const nextRange = hasCustomizedDateRange
        ? [
          Math.max(0, Math.min(normalizedCurrentRange[0], maxIndex)),
          Math.max(0, Math.min(normalizedCurrentRange[1], maxIndex))
        ]
        : [0, maxIndex];

      if (nextRange[0] > nextRange[1]) {
        nextRange[0] = nextRange[1];
      }

      if (
        nextRange[0] === normalizedCurrentRange[0] &&
        nextRange[1] === normalizedCurrentRange[1]
      ) {
        return normalizedCurrentRange;
      }

      return nextRange;
    });
  }, [availableTimelineKey, availableTimelineStamps.length, hasCustomizedDateRange]);

  const controllableAddressOptions = getFilterOptions(controllableCostsState.rows, 'address');
  const maximumDateIndex = Math.max(availableTimelineStamps.length - 1, 0);
  const ytdRangeIndices = getYtdRangeIndices(availableTimelineStamps);
  const activeDateRangeIndices = [
    Math.max(0, Math.min(selectedDateRangeIndices[0] ?? 0, maximumDateIndex)),
    Math.max(0, Math.min(selectedDateRangeIndices[1] ?? maximumDateIndex, maximumDateIndex))
  ];
  const isYtdRangeActive =
    activeDateRangeIndices[0] === ytdRangeIndices[0] &&
    activeDateRangeIndices[1] === ytdRangeIndices[1];
  const selectedDateRange =
    availableTimelineStamps.length > 0
      ? {
        startStamp: availableTimelineStamps[activeDateRangeIndices[0]],
        endStamp: availableTimelineStamps[activeDateRangeIndices[1]]
      }
      : null;
  const dateSliderMarks =
    availableTimelineStamps.length > 1
      ? [
        { value: 0 },
        { value: maximumDateIndex }
      ]
      : [];
  const dateSliderStartLabel =
    availableTimelineStamps.length > 0 ? formatMonthStamp(availableTimelineStamps[0]) : '';
  const dateSliderEndLabel =
    availableTimelineStamps.length > 0
      ? formatMonthStamp(availableTimelineStamps[maximumDateIndex])
      : '';
  const controllableCostElementDescriptionOptions = getFilterOptions(
    controllableCostsState.rows,
    'cost_element_description'
  );
  const activeControllableAddress = normalizeFilterValue(
    selectedControllableAddress,
    controllableAddressOptions
  );
  const activeControllableCostElementDescription = normalizeFilterValue(
    selectedControllableCostElementDescription,
    controllableCostElementDescriptionOptions
  );
  const filteredControllableCostsRows = controllableCostsState.rows.filter((row) => {
    const addressMatches =
      activeControllableAddress === ALL_FILTER_VALUE || row.address === activeControllableAddress;
    const costElementDescriptionMatches =
      activeControllableCostElementDescription === ALL_FILTER_VALUE ||
      row.cost_element_description === activeControllableCostElementDescription;

    return addressMatches && costElementDescriptionMatches;
  });
  const globallyFilteredControllableCostsRows = filteredControllableCostsRows.filter((row) =>
    isStampWithinDateRange(getControllableCostsRowStamp(row), selectedDateRange)
  );
  const controllableCostsChartData = buildControllableCostsChartData(
    filteredControllableCostsRows,
    controllableCostsViewMode,
    selectedDateRange
  );
  const filteredSifRows = sifState.rows.filter(
    (row) => Number(row.kpi_id) === SIF_KPI_ID && normalizeText(row.org_unit_name) === INCIDENT_ORG_UNIT_NAME
  );
  const globallyFilteredSifRows = filteredSifRows.filter((row) =>
    isStampWithinDateRange(getIncidentRowStamp(row), selectedDateRange)
  );
  const sifChartData = buildIncidentChartData(
    filteredSifRows,
    SIF_KPI_ID,
    INCIDENT_ORG_UNIT_NAME,
    sifViewMode,
    selectedDateRange
  );
  const sifSummaryValue = formatIncidentCount(sumActualValues(globallyFilteredSifRows));
  const filteredPotentialSifRows = potentialSifState.rows.filter(
    (row) =>
      Number(row.kpi_id) === POTENTIAL_SIF_KPI_ID &&
      normalizeText(row.org_unit_name) === INCIDENT_ORG_UNIT_NAME
  );
  const globallyFilteredPotentialSifRows = filteredPotentialSifRows.filter((row) =>
    isStampWithinDateRange(getIncidentRowStamp(row), selectedDateRange)
  );
  const potentialSifChartData = buildIncidentChartData(
    filteredPotentialSifRows,
    POTENTIAL_SIF_KPI_ID,
    INCIDENT_ORG_UNIT_NAME,
    potentialSifViewMode,
    selectedDateRange
  );
  const potentialSifSummaryValue = formatIncidentCount(
    sumActualValues(globallyFilteredPotentialSifRows)
  );
  const filteredNmfrRows = nmfrState.rows.filter(
    (row) => Number(row.kpi_id) === NMFR_KPI_ID && normalizeText(row.org_unit_name) === INCIDENT_ORG_UNIT_NAME
  );
  const globallyFilteredNmfrRows = filteredNmfrRows.filter((row) =>
    isStampWithinDateRange(getIncidentRowStamp(row), selectedDateRange)
  );
  const nmfrChartData = buildIncidentChartData(
    filteredNmfrRows,
    NMFR_KPI_ID,
    INCIDENT_ORG_UNIT_NAME,
    nmfrViewMode,
    selectedDateRange,
    'average'
  );
  const nmfrAverageValue = averageActualValues(globallyFilteredNmfrRows);
  const nmfrSummaryValue = nmfrAverageValue == null ? '--' : formatNumber(nmfrAverageValue);

  const programOptions = getFilterOptions(otdState.rows, 'program');
  const siteOptions = getFilterOptions(otdState.rows, 'site');
  const otdTypeOptions = getFilterOptions(otdState.rows, 'type');
  const activeProgram = normalizeFilterValue(selectedProgram, programOptions);
  const activeSite = normalizeFilterValue(selectedSite, siteOptions);
  const activeOtdType = normalizeFilterValue(selectedOtdType, otdTypeOptions);
  const filteredOtdRows = otdState.rows.filter((row) => {
    const programMatches = activeProgram === ALL_FILTER_VALUE || row.program === activeProgram;
    const siteMatches = activeSite === ALL_FILTER_VALUE || row.site === activeSite;
    const typeMatches = activeOtdType === ALL_FILTER_VALUE || row.type === activeOtdType;

    return programMatches && siteMatches && typeMatches;
  });
  const otdChartData = buildOtdChartData(filteredOtdRows, otdViewMode, selectedDateRange);

  const forecastedCcOptions = getFilterOptions(laborState.rows, 'forecasted_cc');
  const poolOptions = getFilterOptions(laborState.rows, 'pool');
  const unionTypeOptions = getFilterOptions(laborState.rows, 'union_type');
  const workerTypeOptions = getFilterOptions(laborState.rows, 'worker_type');
  const timeTypeOptions = getFilterOptions(laborState.rows, 'time_type');
  const activeForecastedCc = normalizeFilterValue(selectedForecastedCc, forecastedCcOptions);
  const activePool = normalizeFilterValue(selectedPool, poolOptions);
  const activeUnionType = normalizeFilterValue(selectedUnionType, unionTypeOptions);
  const activeWorkerType = normalizeFilterValue(selectedWorkerType, workerTypeOptions);
  const activeTimeType = normalizeFilterValue(selectedTimeType, timeTypeOptions);
  const filteredLaborRows = laborState.rows.filter((row) => {
    const facilityMatches =
      activeForecastedCc === ALL_FILTER_VALUE || row.forecasted_cc === activeForecastedCc;
    const poolMatches = activePool === ALL_FILTER_VALUE || row.pool === activePool;
    const unionTypeMatches =
      activeUnionType === ALL_FILTER_VALUE || row.union_type === activeUnionType;
    const workerTypeMatches =
      activeWorkerType === ALL_FILTER_VALUE || row.worker_type === activeWorkerType;
    const timeTypeMatches =
      activeTimeType === ALL_FILTER_VALUE || row.time_type === activeTimeType;

    return (
      facilityMatches &&
      poolMatches &&
      unionTypeMatches &&
      workerTypeMatches &&
      timeTypeMatches
    );
  });
  const laborChartData = buildLaborUtilizationChartData(
    filteredLaborRows,
    laborViewMode,
    selectedDateRange
  );
  const isLaborBarChart = chartVariants.labor === 'bar';
  const laborChartSeries = [
    {
      id: 'directShare',
      data: laborChartData.directShare,
      label: 'Direct labor share',
      color: 'var(--chart-line)',
      valueFormatter: formatPercentValue,
      showMark: false
    }
  ];
  const activeCardKeys = new Set(
    (CARD_CHIP_OPTIONS.find((cardGroup) => cardGroup.key === selectedCardGroup) ?? CARD_CHIP_OPTIONS[0])
      .cardKeys
  );
  const visibleCards = {
    controllableCosts: activeCardKeys.has('controllableCosts'),
    sif: activeCardKeys.has('sif'),
    potentialSif: activeCardKeys.has('potentialSif'),
    nmfr: activeCardKeys.has('nmfr'),
    otd: activeCardKeys.has('otd'),
    labor: activeCardKeys.has('labor')
  };
  const hasVisibleCards = activeCardKeys.size > 0;
  const nextThemeLabel = themeMode === 'light' ? 'Dark' : 'Light';
  const nextThemeIcon = themeMode === 'light' ? faMoon : faSun;
  const isChipActive = (cardGroupKey) => selectedCardGroup === cardGroupKey;
  const allChartsLine = Object.values(chartVariants).every((variant) => variant === 'line');
  const allChartsBar = Object.values(chartVariants).every((variant) => variant === 'bar');

  const setAllChartVariants = (nextVariant) => {
    setChartVariants({
      controllableCosts: nextVariant,
      sif: nextVariant,
      potentialSif: nextVariant,
      nmfr: nextVariant,
      otd: nextVariant,
      labor: nextVariant
    });
  };

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="page-layout">
          <div className="page-header">
            <div className="page-actions">
              <div className="global-date-filter">
                <div className="global-date-filter-control">
                  <div className="global-date-filter-main">
                    <p className="global-date-filter-label">Date range</p>
                    {availableTimelineStamps.length > 0 ? (
                      <div className="global-date-filter-slider-wrap">
                        <Slider
                          className="global-date-filter-slider"
                          value={activeDateRangeIndices}
                          min={0}
                          max={maximumDateIndex}
                          step={1}
                          marks={dateSliderMarks}
                          disableSwap
                          valueLabelDisplay="off"
                          onChange={(_event, nextValue) => {
                            if (Array.isArray(nextValue)) {
                              setSelectedDateRangeIndices(nextValue);
                              setHasCustomizedDateRange(true);
                            }
                          }}
                          sx={dateSliderSx}
                        />
                        <div className="global-date-filter-boundary-labels" aria-hidden="true">
                          <span className="global-date-filter-boundary-label">
                            {dateSliderStartLabel}
                          </span>
                          <span className="global-date-filter-boundary-label global-date-filter-boundary-label-end">
                            {dateSliderEndLabel}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="global-date-filter-loading">Loading date range...</p>
                    )}
                  </div>

                  {availableTimelineStamps.length > 0 && (
                    <div className="global-date-filter-actions">
                      <button
                        type="button"
                        className={`global-date-filter-shortcut${isYtdRangeActive ? ' global-date-filter-shortcut-active' : ''}`}
                        onClick={() => {
                          setSelectedDateRangeIndices(ytdRangeIndices);
                          setHasCustomizedDateRange(true);
                        }}
                      >
                        YTD
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="card-chip-panel">
                {CARD_CHIP_OPTIONS.map((cardGroup) => (
                  <button
                    key={cardGroup.key}
                    type="button"
                    className={`card-chip${isChipActive(cardGroup.key) ? ' card-chip-active' : ''}`}
                    aria-pressed={isChipActive(cardGroup.key)}
                    onClick={() => {
                      setSelectedCardGroup(cardGroup.key);
                    }}
                  >
                    <FontAwesomeIcon icon={cardGroup.icon} className="card-chip-icon" />
                    <span className="card-chip-label">{cardGroup.label}</span>
                  </button>
                ))}
              </div>

              <div className="display-controls" aria-label="Display controls">
                <div className="chart-mode-controls" aria-label="Chart type">
                  <button
                    type="button"
                    className={`chart-mode-button${allChartsLine ? ' chart-mode-button-active' : ''}`}
                    aria-label="Show all line charts"
                    aria-pressed={allChartsLine}
                    onClick={() => {
                      setAllChartVariants('line');
                    }}
                  >
                    <FontAwesomeIcon icon={faChartLine} className="chart-mode-icon" />
                  </button>
                  <button
                    type="button"
                    className={`chart-mode-button${allChartsBar ? ' chart-mode-button-active' : ''}`}
                    aria-label="Show all bar charts"
                    aria-pressed={allChartsBar}
                    onClick={() => {
                      setAllChartVariants('bar');
                    }}
                  >
                    <FontAwesomeIcon icon={faChartColumn} className="chart-mode-icon" />
                  </button>
                </div>

                <button
                  type="button"
                  className="theme-toggle"
                  aria-label={`Switch to ${nextThemeLabel.toLowerCase()} mode`}
                  onClick={() => {
                    setThemeMode((currentMode) => (currentMode === 'light' ? 'dark' : 'light'));
                  }}
                >
                  <FontAwesomeIcon icon={nextThemeIcon} className="theme-toggle-icon" />
                  <span className="theme-toggle-label">{nextThemeLabel}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="cards-grid">
            {visibleCards.controllableCosts && (
              <article className="analytics-card" style={{ order: 1 }}>
                <CardHeader
                  title="Controllable Costs"
                  info={METRIC_INFO.controllableCosts}
                />

                <div className="dashboard-grid">
                  <aside
                    className={`filter-panel${isControllableCostsFiltersOpen ? '' : ' filter-panel-collapsed'}`}
                  >
                    <div className="filter-panel-header">
                      <div className="filter-panel-title-row">
                        <p className="filter-heading">Filters</p>
                        <button
                          type="button"
                          className="filter-toggle"
                          onClick={() => {
                            setIsControllableCostsFiltersOpen((currentValue) => !currentValue);
                          }}
                        >
                          {isControllableCostsFiltersOpen ? 'Hide filters' : 'Show filters'}
                        </button>
                      </div>

                      {isControllableCostsFiltersOpen && (
                        <p className="filter-copy">
                          Narrow the controllable costs chart by address and cost element
                          description.
                        </p>
                      )}
                    </div>

                    {isControllableCostsFiltersOpen && (
                      <div className="filter-panel-body">
                        <div className="filter-fields">
                          <div className="filter-group">
                            <label className="filter-label" htmlFor="controllable-address-filter">
                              Address
                            </label>
                            <FormControl fullWidth size="small" sx={filterSelectStyles}>
                              <Select
                                id="controllable-address-filter"
                                value={activeControllableAddress}
                                displayEmpty
                                onChange={(event) => {
                                  setSelectedControllableAddress(event.target.value);
                                }}
                                renderValue={(value) =>
                                  value === ALL_FILTER_VALUE ? 'All addresses' : value
                                }
                                MenuProps={selectMenuProps}
                              >
                                <MenuItem value={ALL_FILTER_VALUE}>All addresses</MenuItem>
                                {controllableAddressOptions.map((option) => (
                                  <MenuItem key={option} value={option}>
                                    {option}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </div>

                          <div className="filter-group">
                            <label
                              className="filter-label"
                              htmlFor="controllable-cost-element-description-filter"
                            >
                              Cost element description
                            </label>
                            <FormControl fullWidth size="small" sx={filterSelectStyles}>
                              <Select
                                id="controllable-cost-element-description-filter"
                                value={activeControllableCostElementDescription}
                                displayEmpty
                                onChange={(event) => {
                                  setSelectedControllableCostElementDescription(
                                    event.target.value
                                  );
                                }}
                                renderValue={(value) =>
                                  value === ALL_FILTER_VALUE ? 'All descriptions' : value
                                }
                                MenuProps={selectMenuProps}
                              >
                                <MenuItem value={ALL_FILTER_VALUE}>All descriptions</MenuItem>
                                {controllableCostElementDescriptionOptions.map((option) => (
                                  <MenuItem key={option} value={option}>
                                    {option}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </div>
                        </div>

                        <p className="filter-summary">
                          Showing {filteredControllableCostsRows.length} of{' '}
                          {controllableCostsState.rows.length} controllable cost rows.
                        </p>
                      </div>
                    )}
                  </aside>

                  <div className="visual-column">
                    <div ref={controllableCostsChartHostRef} className="chart-host">
                      {controllableCostsState.loading && (
                        <p className="chart-message">Loading controllable costs data...</p>
                      )}

                      {!controllableCostsState.loading && controllableCostsState.error && (
                        <p className="chart-message chart-message-error">
                          {controllableCostsState.error}
                        </p>
                      )}

                      {!controllableCostsState.loading &&
                        !controllableCostsState.error &&
                        (filteredControllableCostsRows.length === 0 ||
                          globallyFilteredControllableCostsRows.length === 0) && (
                          <p className="chart-message">
                            {controllableCostsState.rows.length === 0
                              ? 'No controllable cost rows are available for charting.'
                              : filteredControllableCostsRows.length === 0
                                ? 'No controllable cost rows match the selected filters.'
                                : 'No controllable cost rows fall within the selected date range.'}
                          </p>
                        )}

                      {!controllableCostsState.loading &&
                        !controllableCostsState.error &&
                        controllableCostsChartData.labels.length > 0 &&
                        controllableCostsChartWidth > 0 && (
                          <MetricTrendChart
                            variant={chartVariants.controllableCosts}
                            width={controllableCostsChartWidth}
                            height={CHART_HEIGHT}
                            margin={DEFAULT_CHART_MARGIN}
                            labels={controllableCostsChartData.labels}
                            yAxis={OTD_Y_AXIS}
                            series={[
                              {
                                data: controllableCostsChartData.controllable,
                                label: 'Controllable',
                                color: 'var(--chart-line)',
                                valueFormatter: formatCurrency,
                                showMark: false
                              },
                              {
                                data: controllableCostsChartData.uncontrollable,
                                label: 'Uncontrollable',
                                color: 'var(--chart-accent-line)',
                                valueFormatter: formatCurrency,
                                showMark: false
                              }
                            ]}
                            sx={sharedChartSx}
                          />
                        )}
                    </div>

                    <ChartTypeToggle
                      value={chartVariants.controllableCosts}
                      onChange={(nextVariant) => {
                        setChartVariants((currentValue) => ({
                          ...currentValue,
                          controllableCosts: nextVariant
                        }));
                      }}
                    />

                    <div className="chart-footer chart-footer-match-labor">
                      <div className="chart-note-shell">
                        <p className="chart-note">
                          {CONTROLLABLE_COSTS_VIEW_CONFIG[controllableCostsViewMode].label} totals
                          compare controllable and uncontrollable costs for the selected filters.
                        </p>
                      </div>

                      <ToggleButtonGroup
                        value={controllableCostsViewMode}
                        exclusive
                        fullWidth
                        onChange={(_event, nextMode) => {
                          if (nextMode) {
                            setControllableCostsViewMode(nextMode);
                          }
                        }}
                        sx={timelineToggleGroupSx}
                      >
                        {Object.entries(CONTROLLABLE_COSTS_VIEW_CONFIG).map(([mode, config]) => (
                          <ToggleButton key={mode} value={mode} sx={timelineToggleButtonSx}>
                            {config.label}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {visibleCards.sif && (
              <article className="analytics-card" style={{ order: 6 }}>
                <CardHeader title="SIF Incidents" info={METRIC_INFO.sif} />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <div ref={sifChartHostRef} className="chart-host">
                      {sifState.loading && <p className="chart-message">Loading SIF data...</p>}

                      {!sifState.loading && sifState.error && (
                        <p className="chart-message chart-message-error">{sifState.error}</p>
                      )}

                      {!sifState.loading && !sifState.error && sifChartData.length === 0 && (
                        <p className="chart-message">
                          {filteredSifRows.length === 0
                            ? 'No Defense SIF rows are available for charting.'
                            : 'No Defense SIF rows fall within the selected date range.'}
                        </p>
                      )}

                      {!sifState.loading &&
                        !sifState.error &&
                        sifChartData.length > 0 &&
                        sifChartWidth > 0 && (
                          <MetricTrendChart
                            variant={chartVariants.sif}
                            width={sifChartWidth}
                            height={INCIDENT_CHART_HEIGHT}
                            hideLegend
                            margin={INCIDENT_CHART_MARGIN}
                            labels={sifChartData.map((bucket) => bucket.label)}
                            xAxisHeight={INCIDENT_X_AXIS_HEIGHT}
                            yAxis={SIF_Y_AXIS}
                            series={[
                              {
                                data: sifChartData.map((bucket) => bucket.total),
                                label: 'SIF Incidents',
                                color: 'var(--chart-line)',
                                valueFormatter: formatIncidentCount,
                                showMark: false
                              }
                            ]}
                            sx={sharedChartSx}
                          />
                        )}
                    </div>

                    <ChartTypeToggle
                      value={chartVariants.sif}
                      onChange={(nextVariant) => {
                        setChartVariants((currentValue) => ({
                          ...currentValue,
                          sif: nextVariant
                        }));
                      }}
                    />

                    <MetricSummaryPanel
                      title="SIF Incidents"
                      value={sifState.loading || sifState.error ? '--' : sifSummaryValue}
                    />

                    <div className="chart-footer chart-footer-match-labor">
                      <div className="chart-note-shell">
                        <p className="chart-note">
                          {INCIDENT_VIEW_CONFIG[sifViewMode].label} totals sum Defense SIF incidents
                          for the selected KPI.
                        </p>
                      </div>

                      <ToggleButtonGroup
                        value={sifViewMode}
                        exclusive
                        fullWidth
                        onChange={(_event, nextMode) => {
                          if (nextMode) {
                            setSifViewMode(nextMode);
                          }
                        }}
                        sx={timelineToggleGroupSx}
                      >
                        {Object.entries(INCIDENT_VIEW_CONFIG).map(([mode, config]) => (
                          <ToggleButton key={mode} value={mode} sx={timelineToggleButtonSx}>
                            {config.label}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {visibleCards.potentialSif && (
              <article className="analytics-card" style={{ order: 5 }}>
                <CardHeader
                  title="Potential SIF Incidents"
                  info={METRIC_INFO.potentialSif}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <div ref={potentialSifChartHostRef} className="chart-host">
                      {potentialSifState.loading && (
                        <p className="chart-message">Loading potential SIF data...</p>
                      )}

                      {!potentialSifState.loading && potentialSifState.error && (
                        <p className="chart-message chart-message-error">
                          {potentialSifState.error}
                        </p>
                      )}

                      {!potentialSifState.loading &&
                        !potentialSifState.error &&
                        potentialSifChartData.length === 0 && (
                          <p className="chart-message">
                            {filteredPotentialSifRows.length === 0
                              ? 'No Defense potential SIF rows are available for charting.'
                              : 'No Defense potential SIF rows fall within the selected date range.'}
                          </p>
                        )}

                      {!potentialSifState.loading &&
                        !potentialSifState.error &&
                        potentialSifChartData.length > 0 &&
                        potentialSifChartWidth > 0 && (
                          <MetricTrendChart
                            variant={chartVariants.potentialSif}
                            width={potentialSifChartWidth}
                            height={INCIDENT_CHART_HEIGHT}
                            hideLegend
                            margin={INCIDENT_CHART_MARGIN}
                            labels={potentialSifChartData.map((bucket) => bucket.label)}
                            xAxisHeight={INCIDENT_X_AXIS_HEIGHT}
                            yAxis={SIF_Y_AXIS}
                            series={[
                              {
                                data: potentialSifChartData.map((bucket) => bucket.total),
                                label: 'Potential SIF Incidents',
                                color: 'var(--chart-line)',
                                valueFormatter: formatIncidentCount,
                                showMark: false
                              }
                            ]}
                            sx={sharedChartSx}
                          />
                        )}
                    </div>

                    <ChartTypeToggle
                      value={chartVariants.potentialSif}
                      onChange={(nextVariant) => {
                        setChartVariants((currentValue) => ({
                          ...currentValue,
                          potentialSif: nextVariant
                        }));
                      }}
                    />

                    <MetricSummaryPanel
                      title="Potential SIF Incidents"
                      value={
                        potentialSifState.loading || potentialSifState.error
                          ? '--'
                          : potentialSifSummaryValue
                      }
                    />

                    <div className="chart-footer chart-footer-match-labor">
                      <div className="chart-note-shell">
                        <p className="chart-note">
                          {INCIDENT_VIEW_CONFIG[potentialSifViewMode].label} totals sum Defense
                          potential SIF incidents for the selected KPI.
                        </p>
                      </div>

                      <ToggleButtonGroup
                        value={potentialSifViewMode}
                        exclusive
                        fullWidth
                        onChange={(_event, nextMode) => {
                          if (nextMode) {
                            setPotentialSifViewMode(nextMode);
                          }
                        }}
                        sx={timelineToggleGroupSx}
                      >
                        {Object.entries(INCIDENT_VIEW_CONFIG).map(([mode, config]) => (
                          <ToggleButton key={mode} value={mode} sx={timelineToggleButtonSx}>
                            {config.label}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {visibleCards.nmfr && (
              <article className="analytics-card" style={{ order: 3 }}>
                <CardHeader
                  title="Near Miss Frequency Rate"
                  info={METRIC_INFO.nmfr}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <div ref={nmfrChartHostRef} className="chart-host">
                      {nmfrState.loading && <p className="chart-message">Loading NMFR data...</p>}

                      {!nmfrState.loading && nmfrState.error && (
                        <p className="chart-message chart-message-error">{nmfrState.error}</p>
                      )}

                      {!nmfrState.loading && !nmfrState.error && nmfrChartData.length === 0 && (
                        <p className="chart-message">
                          {filteredNmfrRows.length === 0
                            ? 'No Defense NMFR rows are available for charting.'
                            : 'No Defense NMFR rows fall within the selected date range.'}
                        </p>
                      )}

                      {!nmfrState.loading &&
                        !nmfrState.error &&
                        nmfrChartData.length > 0 &&
                        nmfrChartWidth > 0 && (
                          <MetricTrendChart
                            variant={chartVariants.nmfr}
                            width={nmfrChartWidth}
                            height={INCIDENT_CHART_HEIGHT}
                            hideLegend
                            margin={INCIDENT_CHART_MARGIN}
                            labels={nmfrChartData.map((bucket) => bucket.label)}
                            xAxisHeight={INCIDENT_X_AXIS_HEIGHT}
                            yAxis={NMFR_Y_AXIS}
                            series={[
                              {
                                data: nmfrChartData.map((bucket) => bucket.total),
                                label: 'Near Miss Frequency Rate',
                                color: 'var(--chart-line)',
                                valueFormatter: formatNumber,
                                showMark: false
                              }
                            ]}
                            sx={sharedChartSx}
                          />
                        )}
                    </div>

                    <ChartTypeToggle
                      value={chartVariants.nmfr}
                      onChange={(nextVariant) => {
                        setChartVariants((currentValue) => ({
                          ...currentValue,
                          nmfr: nextVariant
                        }));
                      }}
                    />

                    <MetricSummaryPanel
                      title="Near Miss Frequency Rate"
                      value={nmfrState.loading || nmfrState.error ? '--' : nmfrSummaryValue}
                    />

                    <div className="chart-footer chart-footer-match-labor">
                      <div className="chart-note-shell">
                        <p className="chart-note">
                          Monthly values show Defense NMFR. Quarterly and annual views average the
                          included months.
                        </p>
                      </div>

                      <ToggleButtonGroup
                        value={nmfrViewMode}
                        exclusive
                        fullWidth
                        onChange={(_event, nextMode) => {
                          if (nextMode) {
                            setNmfrViewMode(nextMode);
                          }
                        }}
                        sx={timelineToggleGroupSx}
                      >
                        {Object.entries(INCIDENT_VIEW_CONFIG).map(([mode, config]) => (
                          <ToggleButton key={mode} value={mode} sx={timelineToggleButtonSx}>
                            {config.label}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {visibleCards.otd && (
              <article className="analytics-card" style={{ order: 4 }}>
                <CardHeader
                  title="On Time Delivery (OTD)"
                  info={METRIC_INFO.otd}
                />

                <div className="dashboard-grid">
                  <aside
                    className={`filter-panel${isOtdFiltersOpen ? '' : ' filter-panel-collapsed'}`}
                  >
                    <div className="filter-panel-header">
                      <div className="filter-panel-title-row">
                        <p className="filter-heading">Filters</p>
                        <button
                          type="button"
                          className="filter-toggle"
                          onClick={() => {
                            setIsOtdFiltersOpen((currentValue) => !currentValue);
                          }}
                        >
                          {isOtdFiltersOpen ? 'Hide filters' : 'Show filters'}
                        </button>
                      </div>

                      {isOtdFiltersOpen && (
                        <p className="filter-copy">
                          Narrow the OTD chart by program, site, and type.
                        </p>
                      )}
                    </div>

                    {isOtdFiltersOpen && (
                      <div className="filter-panel-body">
                        <div className="filter-fields">
                          <div className="filter-group">
                            <label className="filter-label" htmlFor="program-filter">
                              Program
                            </label>
                            <FormControl fullWidth size="small" sx={filterSelectStyles}>
                              <Select
                                id="program-filter"
                                value={activeProgram}
                                displayEmpty
                                onChange={(event) => {
                                  setSelectedProgram(event.target.value);
                                }}
                                renderValue={(value) =>
                                  value === ALL_FILTER_VALUE ? 'All programs' : value
                                }
                                MenuProps={selectMenuProps}
                              >
                                <MenuItem value={ALL_FILTER_VALUE}>All programs</MenuItem>
                                {programOptions.map((option) => (
                                  <MenuItem key={option} value={option}>
                                    {option}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </div>

                          <div className="filter-group">
                            <label className="filter-label" htmlFor="site-filter">
                              Site
                            </label>
                            <FormControl fullWidth size="small" sx={filterSelectStyles}>
                              <Select
                                id="site-filter"
                                value={activeSite}
                                displayEmpty
                                onChange={(event) => {
                                  setSelectedSite(event.target.value);
                                }}
                                renderValue={(value) =>
                                  value === ALL_FILTER_VALUE ? 'All sites' : value
                                }
                                MenuProps={selectMenuProps}
                              >
                                <MenuItem value={ALL_FILTER_VALUE}>All sites</MenuItem>
                                {siteOptions.map((option) => (
                                  <MenuItem key={option} value={option}>
                                    {option}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </div>

                          <div className="filter-group">
                            <label className="filter-label" htmlFor="otd-type-filter">
                              Type
                            </label>
                            <FormControl fullWidth size="small" sx={filterSelectStyles}>
                              <Select
                                id="otd-type-filter"
                                value={activeOtdType}
                                displayEmpty
                                onChange={(event) => {
                                  setSelectedOtdType(event.target.value);
                                }}
                                renderValue={(value) =>
                                  value === ALL_FILTER_VALUE ? 'All types' : value
                                }
                                MenuProps={selectMenuProps}
                              >
                                <MenuItem value={ALL_FILTER_VALUE}>All types</MenuItem>
                                {otdTypeOptions.map((option) => (
                                  <MenuItem key={option} value={option}>
                                    {option}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </div>
                        </div>

                        <p className="filter-summary">
                          Showing {filteredOtdRows.length} of {otdState.rows.length} OTD rows.
                        </p>
                      </div>
                    )}
                  </aside>

                  <div className="visual-column">
                    <div ref={otdChartHostRef} className="chart-host">
                      {otdState.loading && <p className="chart-message">Loading OTD data...</p>}

                      {!otdState.loading && otdState.error && (
                        <p className="chart-message chart-message-error">{otdState.error}</p>
                      )}

                      {!otdState.loading &&
                        !otdState.error &&
                        (filteredOtdRows.length === 0 || otdChartData.labels.length === 0) && (
                          <p className="chart-message">
                            {otdState.rows.length === 0
                              ? 'No OTD rows are available for charting.'
                              : filteredOtdRows.length === 0
                                ? 'No OTD rows match the selected filters.'
                                : 'No OTD months fall within the selected date range.'}
                          </p>
                        )}

                      {!otdState.loading &&
                        !otdState.error &&
                        otdChartData.labels.length > 0 &&
                        otdChartWidth > 0 && (
                          <MetricTrendChart
                            variant={chartVariants.otd}
                            width={otdChartWidth}
                            height={CHART_HEIGHT}
                            margin={DEFAULT_CHART_MARGIN}
                            labels={otdChartData.labels}
                            yAxis={OTD_Y_AXIS}
                            series={[
                              {
                                data: otdChartData.contract,
                                label: 'Contract Commitment',
                                color: 'var(--chart-line)',
                                valueFormatter: formatUnits,
                                showMark: false
                              },
                              {
                                data: otdChartData.delivered,
                                label: 'Actuals Delivered',
                                color: 'var(--chart-accent-line)',
                                valueFormatter: formatUnits,
                                showMark: false
                              }
                            ]}
                            sx={sharedChartSx}
                          />
                        )}
                    </div>

                    <ChartTypeToggle
                      value={chartVariants.otd}
                      onChange={(nextVariant) => {
                        setChartVariants((currentValue) => ({
                          ...currentValue,
                          otd: nextVariant
                        }));
                      }}
                    />

                    <div className="chart-footer chart-footer-match-labor">
                      <div className="chart-note-shell">
                        <p className="chart-note">
                          {OTD_VIEW_CONFIG[otdViewMode].label} totals compare commitment and actual
                          delivery.
                        </p>
                      </div>

                      <ToggleButtonGroup
                        value={otdViewMode}
                        exclusive
                        fullWidth
                        onChange={(_event, nextMode) => {
                          if (nextMode) {
                            setOtdViewMode(nextMode);
                          }
                        }}
                        sx={timelineToggleGroupSx}
                      >
                        {Object.entries(OTD_VIEW_CONFIG).map(([mode, config]) => (
                          <ToggleButton key={mode} value={mode} sx={timelineToggleButtonSx}>
                            {config.label}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {visibleCards.labor && (
              <article className="analytics-card" style={{ order: 2 }}>
                <CardHeader
                  title="Direct Labor Utilization"
                  info={METRIC_INFO.labor}
                />

                <div className="dashboard-grid">
                  <aside
                    className={`filter-panel${isLaborFiltersOpen ? '' : ' filter-panel-collapsed'}`}
                  >
                    <div className="filter-panel-header">
                      <div className="filter-panel-title-row">
                        <p className="filter-heading">Filters</p>
                        <button
                          type="button"
                          className="filter-toggle"
                          onClick={() => {
                            setIsLaborFiltersOpen((currentValue) => !currentValue);
                          }}
                        >
                          {isLaborFiltersOpen ? 'Hide filters' : 'Show filters'}
                        </button>
                      </div>

                      {isLaborFiltersOpen && (
                        <p className="filter-copy">
                          Narrow the labor utilization chart by facility, pool, union status, worker
                          type, and time type.
                        </p>
                      )}
                    </div>

                    {isLaborFiltersOpen && (
                      <div className="filter-panel-body">
                        <div className="filter-fields">
                          <div className="filter-group">
                            <label className="filter-label" htmlFor="forecasted-cc-filter">
                              Forecasted CC
                            </label>
                            <FormControl fullWidth size="small" sx={filterSelectStyles}>
                              <Select
                                id="forecasted-cc-filter"
                                value={activeForecastedCc}
                                displayEmpty
                                onChange={(event) => {
                                  setSelectedForecastedCc(event.target.value);
                                }}
                                renderValue={(value) =>
                                  value === ALL_FILTER_VALUE ? 'All facilities' : value
                                }
                                MenuProps={selectMenuProps}
                              >
                                <MenuItem value={ALL_FILTER_VALUE}>All facilities</MenuItem>
                                {forecastedCcOptions.map((option) => (
                                  <MenuItem key={option} value={option}>
                                    {option}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </div>

                          <div className="filter-group">
                            <label className="filter-label" htmlFor="pool-filter">
                              Pool
                            </label>
                            <FormControl fullWidth size="small" sx={filterSelectStyles}>
                              <Select
                                id="pool-filter"
                                value={activePool}
                                displayEmpty
                                onChange={(event) => {
                                  setSelectedPool(event.target.value);
                                }}
                                renderValue={(value) =>
                                  value === ALL_FILTER_VALUE ? 'All pools' : value
                                }
                                MenuProps={selectMenuProps}
                              >
                                <MenuItem value={ALL_FILTER_VALUE}>All pools</MenuItem>
                                {poolOptions.map((option) => (
                                  <MenuItem key={option} value={option}>
                                    {option}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </div>

                          <div className="filter-group">
                            <label className="filter-label" htmlFor="union-type-filter">
                              Union type
                            </label>
                            <FormControl fullWidth size="small" sx={filterSelectStyles}>
                              <Select
                                id="union-type-filter"
                                value={activeUnionType}
                                displayEmpty
                                onChange={(event) => {
                                  setSelectedUnionType(event.target.value);
                                }}
                                renderValue={(value) =>
                                  value === ALL_FILTER_VALUE ? 'All union types' : value
                                }
                                MenuProps={selectMenuProps}
                              >
                                <MenuItem value={ALL_FILTER_VALUE}>All union types</MenuItem>
                                {unionTypeOptions.map((option) => (
                                  <MenuItem key={option} value={option}>
                                    {option}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </div>

                          <div className="filter-group">
                            <label className="filter-label" htmlFor="worker-type-filter">
                              Worker type
                            </label>
                            <FormControl fullWidth size="small" sx={filterSelectStyles}>
                              <Select
                                id="worker-type-filter"
                                value={activeWorkerType}
                                displayEmpty
                                onChange={(event) => {
                                  setSelectedWorkerType(event.target.value);
                                }}
                                renderValue={(value) =>
                                  value === ALL_FILTER_VALUE ? 'All worker types' : value
                                }
                                MenuProps={selectMenuProps}
                              >
                                <MenuItem value={ALL_FILTER_VALUE}>All worker types</MenuItem>
                                {workerTypeOptions.map((option) => (
                                  <MenuItem key={option} value={option}>
                                    {option}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </div>

                          <div className="filter-group">
                            <label className="filter-label" htmlFor="time-type-filter">
                              Time type
                            </label>
                            <FormControl fullWidth size="small" sx={filterSelectStyles}>
                              <Select
                                id="time-type-filter"
                                value={activeTimeType}
                                displayEmpty
                                onChange={(event) => {
                                  setSelectedTimeType(event.target.value);
                                }}
                                renderValue={(value) =>
                                  value === ALL_FILTER_VALUE ? 'All time types' : value
                                }
                                MenuProps={selectMenuProps}
                              >
                                <MenuItem value={ALL_FILTER_VALUE}>All time types</MenuItem>
                                {timeTypeOptions.map((option) => (
                                  <MenuItem key={option} value={option}>
                                    {option}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </div>
                        </div>

                        <p className="filter-summary">
                          Using {filteredLaborRows.length} filtered labor rows:{' '}
                          {laborChartData.directRowCount} direct, {laborChartData.indirectRowCount}{' '}
                          indirect, {laborChartData.otherRowCount} other.
                        </p>
                      </div>
                    )}
                  </aside>

                  <div className="visual-column">
                    <div ref={laborChartHostRef} className="chart-host chart-host-with-axis-unit">
                      {laborState.loading && (
                        <p className="chart-message">Loading labor utilization data...</p>
                      )}

                      {!laborState.loading && laborState.error && (
                        <p className="chart-message chart-message-error">{laborState.error}</p>
                      )}

                      {!laborState.loading &&
                        !laborState.error &&
                        (filteredLaborRows.length === 0 || laborChartData.labels.length === 0) && (
                          <p className="chart-message">
                            {filteredLaborRows.length === 0
                              ? 'No labor rows match the selected filters.'
                              : 'No labor months fall within the selected date range.'}
                          </p>
                        )}

                      {!laborState.loading &&
                        !laborState.error &&
                        laborChartData.labels.length > 0 &&
                        laborChartWidth > 0 && (
                          <>
                            <span className="chart-axis-unit-label">Direct %</span>
                            <MetricTrendChart
                              variant={chartVariants.labor}
                              width={laborChartWidth}
                              height={CHART_HEIGHT}
                              margin={LABOR_CHART_MARGIN}
                              labels={laborChartData.labels}
                              yAxis={LABOR_Y_AXIS}
                              series={laborChartSeries}
                              sx={sharedChartSx}
                              tooltipComponent={
                                isLaborBarChart ? LaborBarChartTooltip : LaborChartTooltip
                              }
                              tooltipTrigger={isLaborBarChart ? 'item' : 'axis'}
                              tooltipProps={{
                                chartData: laborChartData
                              }}
                            />
                          </>
                        )}
                    </div>

                    <ChartTypeToggle
                      value={chartVariants.labor}
                      onChange={(nextVariant) => {
                        setChartVariants((currentValue) => ({
                          ...currentValue,
                          labor: nextVariant
                        }));
                      }}
                    />

                    <div className="chart-footer chart-footer-match-labor">
                      <div className="chart-note-shell">
                        <p className="chart-note">
                          Displays the percentage of total hours that are direct labor for the
                          selected cadence.
                        </p>
                      </div>

                      <ToggleButtonGroup
                        value={laborViewMode}
                        exclusive
                        fullWidth
                        onChange={(_event, nextMode) => {
                          if (nextMode) {
                            setLaborViewMode(nextMode);
                          }
                        }}
                        sx={timelineToggleGroupSx}
                      >
                        {Object.entries(LABOR_VIEW_CONFIG).map(([mode, config]) => (
                          <ToggleButton key={mode} value={mode} sx={timelineToggleButtonSx}>
                            {config.label}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {!hasVisibleCards && (
              <div className="cards-empty-state">Select a card above to show it again.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

const selectMenuProps = {
  PaperProps: {
    sx: {
      mt: 1,
      borderRadius: '14px',
      border: '1px solid var(--border)',
      backgroundColor: 'var(--input-bg)',
      color: 'var(--input-text)',
      boxShadow: '0 12px 28px rgba(0, 0, 0, 0.08)'
    }
  }
};

const filterSelectStyles = {
  '& .MuiOutlinedInput-root': {
    minHeight: 40,
    borderRadius: '12px',
    fontSize: '0.85rem',
    color: 'var(--input-text)',
    backgroundColor: 'var(--input-bg)'
  },
  '& .MuiSelect-select': {
    padding: '9px 12px',
    fontWeight: 600
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--input-border)'
  },
  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--text-primary)'
  },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--text-primary)'
  },
  '& .MuiSvgIcon-root': {
    color: 'var(--input-text)',
    fontSize: '1rem'
  }
};
