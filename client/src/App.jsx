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
  BarPlot,
  ChartsContainer,
  ChartsGrid,
  ChartsReferenceLine,
  ChartsTooltipContainer,
  ChartsXAxis,
  ChartsYAxis,
  LinePlot,
  MarkPlot,
  useAxesTooltip,
  useItemTooltip
} from '@mui/x-charts';
import { toast } from 'react-toastify';
import { forecastNmfrGoalLineFromSeries } from './arimaGoalLines';
import { DEFAULT_METRIC_INFO, METRIC_INFO } from './metricInfo';
import { getMetricGoalLine } from './metricGoals';
import { SITE_BRANDING } from './siteBranding';

const ALL_FILTER_VALUE = '__all__';
const PALETTE_MAX_GROUPS = 20;
const MAX_TOOLTIP_ITEMS = 20;
const MAX_TOOLTIP_LABEL_LENGTH = 20;
const PALETTE_INFO_TOAST_SESSION_KEY = 'westmarch-palette-info-toast-shown';
const NG_TOAST_BLUE = '#0057b8';
const PALETTE_INFO_TOAST_OPTIONS = {
  autoClose: 10000,
  progressStyle: { backgroundColor: NG_TOAST_BLUE },
  style: { borderLeft: `4px solid ${NG_TOAST_BLUE}` }
};
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

const CONTROLLABLE_CHART_FILTER_FIELDS = [
  {
    value: 'address',
    label: 'Facility',
    allLabel: 'All facilities'
  },
  {
    value: 'cost_category',
    label: 'Cost category',
    allLabel: 'All cost categories'
  }
];

const CONTROLLABLE_PALETTE_FIELDS = [
  {
    value: 'address',
    label: 'Facility'
  },
  {
    value: 'cost_category',
    label: 'Cost category'
  },
  {
    value: 'controllable',
    label: 'Controllability'
  }
];

const SAFETY_CHART_FILTER_FIELDS = [
  {
    value: 'division',
    label: 'Division',
    allLabel: 'All divisions'
  },
  {
    value: 'site',
    label: 'Site',
    allLabel: 'All sites'
  }
];

const SAFETY_PALETTE_FIELDS = [
  {
    value: 'division',
    label: 'Division'
  },
  {
    value: 'site',
    label: 'Site'
  }
];

const SAFETY_PARETO_FILTER_FIELDS = SAFETY_CHART_FILTER_FIELDS;

const OTD_CHART_FILTER_FIELDS = [
  {
    value: 'program',
    label: 'Program',
    allLabel: 'All programs'
  },
  {
    value: 'bu',
    label: 'BU',
    allLabel: 'All BUs'
  },
  {
    value: 'site',
    label: 'Site',
    allLabel: 'All sites'
  },
  {
    value: 'type',
    label: 'Type',
    allLabel: 'All types'
  }
];

const OTD_PARETO_FILTER_FIELDS = [OTD_CHART_FILTER_FIELDS[1]];
const OTD_PALETTE_FIELDS = OTD_CHART_FILTER_FIELDS.map((option) => ({
  value: option.value,
  label: option.label
}));

const LABOR_CHART_FILTER_FIELDS = [
  {
    value: 'forecasted_cc',
    label: 'Facility',
    allLabel: 'All facilities'
  },
  {
    value: 'pool',
    label: 'Pool',
    allLabel: 'All pools'
  },
  {
    value: 'union_type',
    label: 'Union type',
    allLabel: 'All union types'
  },
  {
    value: 'worker_type',
    label: 'Worker type',
    allLabel: 'All worker types'
  },
  {
    value: 'time_type',
    label: 'Time type',
    allLabel: 'All time types'
  }
];
const LABOR_PALETTE_FIELDS = LABOR_CHART_FILTER_FIELDS.map((option) => ({
  value: option.value,
  label: option.label
}));
const LABOR_PARETO_FILTER_FIELDS = [LABOR_CHART_FILTER_FIELDS[0]];

const CONTROLLABLE_PARETO_FILTER_FIELDS = [CONTROLLABLE_CHART_FILTER_FIELDS[0]];

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
const CARD_VARIANT_OPTIONS_BY_METRIC = {
  controllableCosts: ['line', 'bar', 'palette', 'pareto'],
  sif: ['line', 'bar', 'palette', 'pareto'],
  potentialSif: ['line', 'bar', 'palette', 'pareto'],
  nmfr: ['line', 'bar', 'palette', 'pareto'],
  otd: ['line', 'bar', 'palette', 'pareto'],
  labor: ['line', 'bar', 'palette', 'pareto']
};
const PRESET_SLOT_OPTIONS = [1, 2, 3];
const CONTROLLABLE_PALETTE_COLORS = [
  '#28223c',
  '#111827',
  '#1f3b5c',
  '#284b74',
  '#34618d',
  '#4a79a8',
  '#5f8fc0',
  '#7ba7d1',
  '#9fc0e3',
  '#343046',
  '#403b50',
  '#4b5563',
  '#5b6170',
  '#6b7280',
  '#7c8591',
  '#374151',
  '#9aa4b3',
  '#cbd5e1',
  '#e7edf5'
];

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
const CONTROLLABLE_COSTS_Y_AXIS = [
  {
    width: 66,
    valueFormatter: formatCompactCurrency,
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
const LABOR_HOURS_Y_AXIS = [
  {
    width: 60,
    valueFormatter: formatCompactHoursAxis,
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

const goalLineStyle = {
  stroke: 'var(--text-primary)',
  strokeDasharray: '6 4',
  strokeWidth: 1.5
};

const goalLabelStyle = {
  fill: 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 600
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

const chartTypeToggleGroupFilterSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gridAutoRows: 'minmax(0, 1fr)',
  width: '88px',
  minWidth: '88px',
  padding: '0.18rem',
  gap: '0.18rem',
  borderRadius: '14px',
  '& .MuiToggleButtonGroup-grouped': {
    flex: 'none',
    width: '100%',
    minWidth: 0,
    margin: 0,
    border: 0
  },
  '& .MuiToggleButton-root': {
    width: '100%',
    minWidth: 0
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

function clampGoalLineToVisibleSeries(goalLine, seriesCollections, maxScaleMultiplier = 5) {
  if (!goalLine) {
    return null;
  }

  const numericValues = seriesCollections
    .flatMap((seriesValues) => seriesValues)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (numericValues.length === 0) {
    return null;
  }

  const maxAbsoluteValue = numericValues.reduce(
    (maxValue, value) => Math.max(maxValue, Math.abs(value)),
    0
  );

  if (maxAbsoluteValue <= 0) {
    return null;
  }

  return Math.abs(Number(goalLine.value)) > maxAbsoluteValue * maxScaleMultiplier
    ? null
    : goalLine;
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

function formatFixedMonthLabel(year, monthIndex) {
  return formatMonthStamp(getFixedMonthStamp(year, monthIndex));
}

function getTooltipBucketLabel(bucketLabel, bucketLabelLookup = null) {
  if (!bucketLabelLookup || typeof bucketLabelLookup !== 'object') {
    return bucketLabel;
  }

  return bucketLabelLookup[bucketLabel] ?? bucketLabel;
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

function buildNmfrChartData(rows, kpiId, orgUnitName, viewMode, selectedDateRange) {
  const buckets = new Map();

  rows.forEach((row) => {
    if (Number(row.kpi_id) !== kpiId || normalizeText(row.org_unit_name) !== orgUnitName) {
      return;
    }

    const stamp = getIncidentRowStamp(row);
    const referenceDate = stamp == null ? new Date('') : new Date(stamp);

    if (
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
      rows: []
    };

    currentBucket.rows.push(row);
    buckets.set(bucketKey, currentBucket);
  });

  return Array.from(buckets.values())
    .sort((left, right) => left.sortValue - right.sortValue)
    .map((bucket) => ({
      label: bucket.label,
      total: Number((calculateNmfrValueFromRows(bucket.rows) ?? 0).toFixed(2))
    }));
}

function getSafetyChartValue(row, metricKey) {
  if (metricKey === 'nmfr') {
    return Number(row.near_miss_count ?? 0);
  }

  return Number(row.actual_value ?? 0);
}

function getNmfrExposureHours(rows, selectedDateRange) {
  const exposureHoursByMonth = new Map();

  rows.forEach((row) => {
    const monthStamp = getIncidentRowStamp(row);
    const employeeCount = Number(row.employee_count);
    const workingDays = Number(row.working_days);

    if (
      monthStamp == null ||
      !isStampWithinDateRange(monthStamp, selectedDateRange) ||
      !Number.isFinite(employeeCount) ||
      employeeCount <= 0 ||
      !Number.isFinite(workingDays) ||
      workingDays <= 0
    ) {
      return;
    }

    if (!exposureHoursByMonth.has(monthStamp)) {
      exposureHoursByMonth.set(monthStamp, employeeCount * 8 * workingDays);
    }
  });

  return Array.from(exposureHoursByMonth.values()).reduce(
    (sum, exposureHours) => sum + exposureHours,
    0
  );
}

function calculateNmfrFromNearMissCount(nearMissCount, exposureHours) {
  if (!Number.isFinite(exposureHours) || exposureHours <= 0) {
    return 0;
  }

  return Number(((200000 * nearMissCount) / exposureHours).toFixed(2));
}

function buildSafetyParetoChartData(rows, fieldName, selectedDateRange, metricKey) {
  const rowsWithinRange = rows.filter((row) =>
    isStampWithinDateRange(getIncidentRowStamp(row), selectedDateRange)
  );

  if (metricKey === 'nmfr') {
    const exposureHours = getNmfrExposureHours(rowsWithinRange, selectedDateRange);
    const nearMissTotalsByCategory = new Map();

    rowsWithinRange.forEach((row) => {
      const nearMissCount = Number(row.near_miss_count);

      if (!Number.isFinite(nearMissCount) || nearMissCount <= 0) {
        return;
      }

      const categoryLabel = normalizeParetoCategoryLabel(row[fieldName]);
      nearMissTotalsByCategory.set(
        categoryLabel,
        (nearMissTotalsByCategory.get(categoryLabel) ?? 0) + nearMissCount
      );
    });

    return buildParetoChartData(
      Array.from(nearMissTotalsByCategory.entries()).map(([category, nearMissCount]) => ({
        category,
        value: calculateNmfrFromNearMissCount(nearMissCount, exposureHours)
      }))
    );
  }

  return buildParetoChartData(
    rowsWithinRange.map((row) => ({
      category: row[fieldName],
      value: row.actual_value
    }))
  );
}

function buildSafetyPaletteChartData(
  rows,
  groupFieldName,
  colorFieldName,
  selectedDateRange,
  metricKey
) {
  const rowsWithinRange = rows.filter((row) =>
    isStampWithinDateRange(getIncidentRowStamp(row), selectedDateRange)
  );
  const groups = new Map();
  const colorTotals = new Map();
  const exposureHours = metricKey === 'nmfr'
    ? getNmfrExposureHours(rowsWithinRange, selectedDateRange)
    : 0;

  rowsWithinRange.forEach((row) => {
    const numericValue = getSafetyChartValue(row, metricKey);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return;
    }

    const groupLabel = normalizeParetoCategoryLabel(row[groupFieldName]);
    const colorLabel = normalizeParetoCategoryLabel(row[colorFieldName]);
    const currentGroup =
      groups.get(groupLabel)
      ?? {
        label: groupLabel,
        total: 0,
        breakdown: new Map()
      };

    currentGroup.total += numericValue;
    currentGroup.breakdown.set(
      colorLabel,
      (currentGroup.breakdown.get(colorLabel) ?? 0) + numericValue
    );
    groups.set(groupLabel, currentGroup);
    colorTotals.set(colorLabel, (colorTotals.get(colorLabel) ?? 0) + numericValue);
  });

  const sortedGroups = Array.from(groups.values()).sort((left, right) => {
    if (right.total !== left.total) {
      return right.total - left.total;
    }

    return left.label.localeCompare(right.label);
  });
  const { visibleGroups, visibleColorLabels } = getVisiblePaletteGroupsAndColorLabels(
    sortedGroups,
    colorTotals
  );

  return {
    labels: visibleGroups.map((group) => group.label),
    series: visibleColorLabels.map((colorLabel, index) => ({
      id: `safety-palette-${metricKey}-${colorLabel}`,
      label: colorLabel,
      color: CONTROLLABLE_PALETTE_COLORS[index % CONTROLLABLE_PALETTE_COLORS.length],
      data: visibleGroups.map((group) => {
        const rawValue = group.breakdown.get(colorLabel) ?? 0;
        const chartValue =
          metricKey === 'nmfr'
            ? calculateNmfrFromNearMissCount(rawValue, exposureHours)
            : Number(rawValue.toFixed(2));

        return metricKey === 'nmfr' ? chartValue : Number(chartValue.toFixed(2));
      })
    }))
  };
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
      tooltipLabel: formatFixedMonthLabel(FIXED_MONTH_METRIC_YEAR, monthIndex),
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
          tooltipLabel: `Q${quarterIndex + 1} ${FIXED_MONTH_METRIC_YEAR}`,
          monthIndices: quarterMonthIndices
        };
      })
      .filter(Boolean);
  }

  return monthIndicesInRange.length > 0
    ? [
      {
        label: String(FIXED_MONTH_METRIC_YEAR),
        tooltipLabel: String(FIXED_MONTH_METRIC_YEAR),
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
  const tooltipLabelLookup = Object.fromEntries(
    buckets.map((bucket) => [bucket.label, bucket.tooltipLabel ?? bucket.label])
  );

  return {
    labels: buckets.map((bucket) => bucket.label),
    tooltipLabelLookup,
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

function normalizeParetoCategoryLabel(value) {
  const normalizedValue = String(value ?? '').trim();
  return normalizedValue || 'Unspecified';
}

function getVisiblePaletteGroupsAndColorLabels(sortedGroups, colorTotals, maxGroups = PALETTE_MAX_GROUPS) {
  const visibleGroups = sortedGroups.slice(0, maxGroups);
  const visibleColorLabelSet = new Set();

  visibleGroups.forEach((group) => {
    group.breakdown.forEach((value, label) => {
      if (Number.isFinite(value) && value > 0) {
        visibleColorLabelSet.add(label);
      }
    });
  });

  return {
    visibleGroups,
    visibleColorLabels: Array.from(colorTotals.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }

        return left[0].localeCompare(right[0]);
      })
      .map(([label]) => label)
      .filter((label) => visibleColorLabelSet.has(label))
  };
}

function buildParetoChartData(entries, maxEntries = null) {
  const totalsByCategory = new Map();

  entries.forEach(({ category, value }) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return;
    }

    const categoryLabel = normalizeParetoCategoryLabel(category);
    totalsByCategory.set(categoryLabel, (totalsByCategory.get(categoryLabel) ?? 0) + numericValue);
  });

  const sortedEntries = Array.from(totalsByCategory.entries())
    .map(([label, total]) => ({
      label,
      total: Number(total.toFixed(2))
    }))
    .sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }

      return left.label.localeCompare(right.label);
    });

  const visibleEntries =
    Number.isInteger(maxEntries) && maxEntries > 0
      ? sortedEntries.slice(0, maxEntries)
      : sortedEntries;

  const grandTotal = visibleEntries.reduce((sum, entry) => sum + entry.total, 0);
  let runningTotal = 0;

  return {
    labels: visibleEntries.map((entry) => entry.label),
    values: visibleEntries.map((entry) => entry.total),
    cumulativeShares: visibleEntries.map((entry) => {
      runningTotal += entry.total;
      return grandTotal > 0 ? Number((runningTotal / grandTotal).toFixed(4)) : 0;
    })
  };
}

function buildControllableCostsParetoChartData(rows, fieldName, selectedDateRange) {
  return buildParetoChartData(
    rows
      .filter((row) => isStampWithinDateRange(getControllableCostsRowStamp(row), selectedDateRange))
      .map((row) => ({
        category: row[fieldName],
        value: row.cost
      })),
    PALETTE_MAX_GROUPS
  );
}

function buildControllableCostsPaletteChartData(
  rows,
  groupFieldName,
  colorFieldName,
  selectedDateRange
) {
  const groups = new Map();
  const colorTotals = new Map();

  rows.forEach((row) => {
    const cost = Number(row.cost);

    if (
      !Number.isFinite(cost)
      || !isStampWithinDateRange(getControllableCostsRowStamp(row), selectedDateRange)
    ) {
      return;
    }

    const groupLabel = normalizeParetoCategoryLabel(row[groupFieldName]);
    const colorLabel = normalizeParetoCategoryLabel(row[colorFieldName]);
    const currentGroup =
      groups.get(groupLabel)
      ?? {
        label: groupLabel,
        total: 0,
        breakdown: new Map()
      };

    currentGroup.total += cost;
    currentGroup.breakdown.set(
      colorLabel,
      (currentGroup.breakdown.get(colorLabel) ?? 0) + cost
    );
    groups.set(groupLabel, currentGroup);
    colorTotals.set(colorLabel, (colorTotals.get(colorLabel) ?? 0) + cost);
  });

  const sortedGroups = Array.from(groups.values()).sort((left, right) => {
    if (right.total !== left.total) {
      return right.total - left.total;
    }

    return left.label.localeCompare(right.label);
  });
  const { visibleGroups, visibleColorLabels } = getVisiblePaletteGroupsAndColorLabels(
    sortedGroups,
    colorTotals
  );

  return {
    labels: visibleGroups.map((group) => group.label),
    series: visibleColorLabels.map((colorLabel, index) => ({
      id: `controllable-palette-${colorLabel}`,
      label: colorLabel,
      color: CONTROLLABLE_PALETTE_COLORS[index % CONTROLLABLE_PALETTE_COLORS.length],
      data: visibleGroups.map((group) =>
        Number((group.breakdown.get(colorLabel) ?? 0).toFixed(2))
      )
    }))
  };
}

function buildOtdParetoChartData(rows, fieldName, selectedDateRange) {
  const monthIndicesInRange = OTD_MONTH_COLUMNS.map((_month, monthIndex) => monthIndex).filter(
    (monthIndex) =>
      isStampWithinDateRange(
        getFixedMonthStamp(FIXED_MONTH_METRIC_YEAR, monthIndex),
        selectedDateRange
      )
  );

  return buildParetoChartData(
    rows
      .filter((row) => row.measure_type === 'Actuals Delivered')
      .map((row) => ({
        category: row[fieldName],
        value: monthIndicesInRange.reduce((sum, monthIndex) => {
          const numericValue = Number(row[OTD_MONTH_COLUMNS[monthIndex].key]);
          return Number.isFinite(numericValue) ? sum + numericValue : sum;
        }, 0)
      }))
  );
}

function buildOtdPaletteChartData(rows, groupFieldName, colorFieldName, selectedDateRange) {
  const monthIndicesInRange = OTD_MONTH_COLUMNS.map((_month, monthIndex) => monthIndex).filter(
    (monthIndex) =>
      isStampWithinDateRange(
        getFixedMonthStamp(FIXED_MONTH_METRIC_YEAR, monthIndex),
        selectedDateRange
      )
  );
  const groups = new Map();
  const colorTotals = new Map();

  rows.forEach((row) => {
    if (row.measure_type !== 'Actuals Delivered') {
      return;
    }

    const deliveredTotal = monthIndicesInRange.reduce((sum, monthIndex) => {
      const numericValue = Number(row[OTD_MONTH_COLUMNS[monthIndex].key]);
      return Number.isFinite(numericValue) ? sum + numericValue : sum;
    }, 0);

    if (!Number.isFinite(deliveredTotal) || deliveredTotal <= 0) {
      return;
    }

    const groupLabel = normalizeParetoCategoryLabel(row[groupFieldName]);
    const colorLabel = normalizeParetoCategoryLabel(row[colorFieldName]);
    const currentGroup =
      groups.get(groupLabel)
      ?? {
        label: groupLabel,
        total: 0,
        breakdown: new Map()
      };

    currentGroup.total += deliveredTotal;
    currentGroup.breakdown.set(
      colorLabel,
      (currentGroup.breakdown.get(colorLabel) ?? 0) + deliveredTotal
    );
    groups.set(groupLabel, currentGroup);
    colorTotals.set(colorLabel, (colorTotals.get(colorLabel) ?? 0) + deliveredTotal);
  });

  const sortedGroups = Array.from(groups.values()).sort((left, right) => {
    if (right.total !== left.total) {
      return right.total - left.total;
    }

    return left.label.localeCompare(right.label);
  });
  const { visibleGroups, visibleColorLabels } = getVisiblePaletteGroupsAndColorLabels(
    sortedGroups,
    colorTotals
  );

  return {
    labels: visibleGroups.map((group) => group.label),
    series: visibleColorLabels.map((colorLabel, index) => ({
      id: `otd-palette-${colorLabel}`,
      label: colorLabel,
      color: CONTROLLABLE_PALETTE_COLORS[index % CONTROLLABLE_PALETTE_COLORS.length],
      data: visibleGroups.map((group) =>
        Number((group.breakdown.get(colorLabel) ?? 0).toFixed(2))
      )
    }))
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
      tooltipLabel:
        viewMode === 'monthly'
          ? formatFixedMonthLabel(FIXED_MONTH_METRIC_YEAR, startIndex)
          : bucketConfig.bucketFormatter(LABOR_MONTH_COLUMNS[startIndex], startIndex),
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
  const tooltipLabelLookup = Object.fromEntries(
    buckets.map((bucket) => [bucket.label, bucket.tooltipLabel ?? bucket.label])
  );

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
    tooltipLabelLookup,
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

function sumLaborHoursForRow(row, selectedDateRange) {
  return LABOR_MONTH_COLUMNS.reduce((sum, { key }, monthIndex) => {
    if (
      !isStampWithinDateRange(
        getFixedMonthStamp(FIXED_MONTH_METRIC_YEAR, monthIndex),
        selectedDateRange
      )
    ) {
      return sum;
    }

    const numericValue = Number(row[key]);
    return Number.isFinite(numericValue) ? sum + numericValue : sum;
  }, 0);
}

function buildLaborParetoChartData(rows, fieldName, selectedDateRange) {
  return buildParetoChartData(
    rows
      .filter((row) => getLaborCategoryGroup(row.labor_category) === 'direct')
      .map((row) => ({
        category: row[fieldName],
        value: sumLaborHoursForRow(row, selectedDateRange)
      })),
    PALETTE_MAX_GROUPS
  );
}

function buildLaborPaletteChartData(rows, groupFieldName, colorFieldName, selectedDateRange) {
  const groups = new Map();
  const colorTotals = new Map();

  rows.forEach((row) => {
    if (getLaborCategoryGroup(row.labor_category) !== 'direct') {
      return;
    }

    const directHours = sumLaborHoursForRow(row, selectedDateRange);

    if (!Number.isFinite(directHours) || directHours <= 0) {
      return;
    }

    const groupLabel = normalizeParetoCategoryLabel(row[groupFieldName]);
    const colorLabel = normalizeParetoCategoryLabel(row[colorFieldName]);
    const currentGroup =
      groups.get(groupLabel)
      ?? {
        label: groupLabel,
        total: 0,
        breakdown: new Map()
      };

    currentGroup.total += directHours;
    currentGroup.breakdown.set(
      colorLabel,
      (currentGroup.breakdown.get(colorLabel) ?? 0) + directHours
    );
    groups.set(groupLabel, currentGroup);
    colorTotals.set(colorLabel, (colorTotals.get(colorLabel) ?? 0) + directHours);
  });

  const sortedGroups = Array.from(groups.values()).sort((left, right) => {
    if (right.total !== left.total) {
      return right.total - left.total;
    }

    return left.label.localeCompare(right.label);
  });
  const { visibleGroups, visibleColorLabels } = getVisiblePaletteGroupsAndColorLabels(
    sortedGroups,
    colorTotals
  );

  return {
    labels: visibleGroups.map((group) => group.label),
    series: visibleColorLabels.map((colorLabel, index) => ({
      id: `labor-palette-${colorLabel}`,
      label: colorLabel,
      color: CONTROLLABLE_PALETTE_COLORS[index % CONTROLLABLE_PALETTE_COLORS.length],
      data: visibleGroups.map((group) =>
        Number((group.breakdown.get(colorLabel) ?? 0).toFixed(0))
      )
    }))
  };
}

function hasSeenPaletteInfoToast() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.sessionStorage.getItem(PALETTE_INFO_TOAST_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function markPaletteInfoToastSeen() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(PALETTE_INFO_TOAST_SESSION_KEY, 'true');
  } catch {
    // Ignore storage failures and continue for the current page session.
  }
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

function PaletteChartToggleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8" y="3.5" width="8" height="4" rx="1" fill="currentColor" stroke="none" />
      <rect x="8" y="9.8" width="8" height="4" rx="1" fill="currentColor" opacity="0.8" stroke="none" />
      <rect x="8" y="16.1" width="8" height="4" rx="1" fill="currentColor" opacity="0.6" stroke="none" />
    </svg>
  );
}

function ParetoChartToggleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 20.5H20.5" />
      <rect x="5" y="12.5" width="3.2" height="8" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="10.4" y="9.5" width="3.2" height="11" rx="0.8" fill="currentColor" opacity="0.82" stroke="none" />
      <rect x="15.8" y="6.5" width="3.2" height="14" rx="0.8" fill="currentColor" opacity="0.64" stroke="none" />
      <path d="M4.5 8.8L9.4 10.2L14 7.1L19.5 5.2" />
    </svg>
  );
}

function getTooltipSeriesNumericValue(seriesItem) {
  const numericValue = Number(seriesItem?.value);

  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const rawValue = seriesItem?.rawValue ?? seriesItem?.formattedValue;
  const fallbackNumericValue = Number(rawValue);
  return Number.isFinite(fallbackNumericValue) ? fallbackNumericValue : null;
}

function truncateTooltipLabel(label, maxLength = MAX_TOOLTIP_LABEL_LENGTH) {
  const normalizedLabel = String(label ?? '');

  if (normalizedLabel.length <= maxLength) {
    return normalizedLabel;
  }

  return `${normalizedLabel.slice(0, Math.max(maxLength - 3, 0)).trimEnd()}...`;
}

function prepareTooltipSeriesItems(
  seriesItems,
  {
    sortSeriesItems = false,
    excludeZeroSeriesItems = false
  } = {}
) {
  const normalizedItems = (seriesItems ?? [])
    .filter((seriesItem) => seriesItem?.formattedValue != null)
    .map((seriesItem, index) => ({
      seriesItem,
      numericValue: getTooltipSeriesNumericValue(seriesItem),
      index
    }))
    .filter(({ numericValue }) => !excludeZeroSeriesItems || numericValue == null || numericValue !== 0);

  if (!sortSeriesItems) {
    return normalizedItems
      .slice(0, MAX_TOOLTIP_ITEMS)
      .map(({ seriesItem }) => seriesItem);
  }

  return normalizedItems
    .sort((left, right) => {
      const leftHasNumericValue = Number.isFinite(left.numericValue);
      const rightHasNumericValue = Number.isFinite(right.numericValue);

      if (leftHasNumericValue && rightHasNumericValue && left.numericValue !== right.numericValue) {
        return right.numericValue - left.numericValue;
      }

      if (leftHasNumericValue !== rightHasNumericValue) {
        return leftHasNumericValue ? -1 : 1;
      }

      return left.index - right.index;
    })
    .slice(0, MAX_TOOLTIP_ITEMS)
    .map(({ seriesItem }) => seriesItem);
}

function renderTooltipTable({
  axisId,
  bucketLabel,
  seriesItems,
  extraRows = [],
  sortSeriesItems = false,
  excludeZeroSeriesItems = false
}) {
  const visibleSeriesItems = prepareTooltipSeriesItems(seriesItems, {
    sortSeriesItems,
    excludeZeroSeriesItems
  });

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
        {visibleSeriesItems.map((seriesItem) => (
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
                <span title={seriesItem.formattedLabel || ''}>
                  {truncateTooltipLabel(seriesItem.formattedLabel || '')}
                </span>
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
                <span title={row.label}>
                  {truncateTooltipLabel(row.label)}
                </span>
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
  const {
    sortSeriesItems = false,
    excludeZeroSeriesItems = false,
    bucketLabelLookup = null,
    ...tooltipContainerProps
  } = props;
  const tooltipData = useAxesTooltip();

  if (!tooltipData?.length) {
    return null;
  }

  return (
    <ChartsTooltipContainer {...tooltipContainerProps}>
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
            bucketLabel: getTooltipBucketLabel(String(axisFormattedValue), bucketLabelLookup),
            seriesItems,
            sortSeriesItems,
            excludeZeroSeriesItems
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
  goalLine = null,
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
        sortSeriesItems: variant === 'bar',
        excludeZeroSeriesItems: variant === 'bar',
        ...tooltipProps
      }
    },
    children: goalLine ? (
      <ChartsReferenceLine
        y={goalLine.value}
        label={goalLine.label}
        labelAlign="end"
        lineStyle={goalLineStyle}
        labelStyle={goalLabelStyle}
      />
    ) : null
  };

  if (variant === 'bar') {
    return <BarChart {...chartProps} />;
  }

  return <LineChart {...chartProps} />;
}

function StackedCategoryBarChart({
  width,
  height,
  margin,
  labels,
  yAxis,
  series,
  sx = sharedChartSx
}) {
  return (
    <BarChart
      width={width}
      height={height}
      margin={margin}
      hideLegend
      xAxis={[
        {
          scaleType: 'band',
          height: 28,
          data: labels
        }
      ]}
      yAxis={yAxis.map((axisConfig) => ({
        ...axisConfig,
        min: axisConfig.min ?? 0
      }))}
      series={series.map((seriesConfig) => ({
        ...seriesConfig,
        stack: 'total'
      }))}
      grid={{ horizontal: true }}
      sx={sx}
      slots={{
        tooltip: StandardChartTooltip
      }}
      slotProps={{
        tooltip: {
          trigger: 'axis',
          sortSeriesItems: true,
          excludeZeroSeriesItems: true
        }
      }}
    />
  );
}

function buildTooltipLegend(title, series) {
  if (!Array.isArray(series) || series.length === 0) {
    return null;
  }

  return {
    title,
    items: series.map((seriesItem) => ({
      label: seriesItem.label,
      color: seriesItem.color
    }))
  };
}

function ParetoMetricChart({
  width,
  height,
  margin,
  labels,
  values,
  cumulativeShares,
  barLabel,
  barColor,
  barAxis,
  barValueFormatter,
  goalLine = null,
  sx = sharedChartSx
}) {
  return (
    <ChartsContainer
      width={width}
      height={height}
      margin={margin}
      series={[
        {
          type: 'bar',
          id: 'pareto-bars',
          data: values,
          label: barLabel,
          color: barColor,
          valueFormatter: barValueFormatter,
          yAxisId: 'value-axis'
        },
        {
          type: 'line',
          id: 'pareto-cumulative',
          data: cumulativeShares,
          label: 'Cumulative share',
          color: 'var(--chart-accent-line)',
          valueFormatter: formatPercentValue,
          yAxisId: 'cumulative-axis',
          showMark: false
        }
      ]}
      xAxis={[
        {
          id: 'pareto-categories',
          scaleType: 'band',
          height: 28,
          data: labels
        }
      ]}
      yAxis={[
        {
          id: 'value-axis',
          ...barAxis[0]
        },
        {
          id: 'cumulative-axis',
          position: 'right',
          min: 0,
          max: 1,
          width: 44,
          valueFormatter: formatPercentAxis,
          tickLabelStyle: { fontSize: 11 }
        }
      ]}
      sx={sx}
    >
      <ChartsGrid horizontal />
      <BarPlot />
      <LinePlot />
      <MarkPlot />
      <ChartsXAxis axisId="pareto-categories" />
      <ChartsYAxis axisId="value-axis" />
      <ChartsYAxis axisId="cumulative-axis" />
      {goalLine ? (
        <ChartsReferenceLine
          axisId="value-axis"
          y={goalLine.value}
          label={goalLine.label}
          labelAlign="end"
          lineStyle={goalLineStyle}
          labelStyle={goalLabelStyle}
        />
      ) : null}
      <StandardChartTooltip trigger="axis" />
    </ChartsContainer>
  );
}

function ChartTypeToggle(props) {
  return (
    <ChartTypeToggleWithFilter
      {...props}
    />
  );
}

function ChartTypeToggleWithFilter({
  value,
  onChange,
  showLine = true,
  showBar = true,
  alwaysGridToggle = false,
  supportsFilter = false,
  supportsPalette = false,
  supportsPareto = false,
  filterToggleAriaLabel = 'Filter chart',
  filterFieldValue = '',
  filterFieldOptions = [],
  paretoFieldOptions = [],
  filterFieldAriaLabel = 'Filter field',
  onFilterFieldChange = null,
  filterValue = ALL_FILTER_VALUE,
  filterValueOptions = [],
  filterValueAllLabel = 'All',
  filterValueAriaLabel = 'Filter value',
  onFilterValueChange = null,
  paletteToggleAriaLabel = 'Palette chart',
  paletteGroupFieldValue = '',
  paletteGroupFieldOptions = [],
  paletteGroupFieldAriaLabel = 'Group field',
  onPaletteGroupFieldChange = null,
  paletteColorFieldValue = '',
  paletteColorFieldOptions = [],
  paletteColorFieldAriaLabel = 'Color field',
  onPaletteColorFieldChange = null
}) {
  const isLineFilterMode = supportsFilter && value === 'line';
  const isBarFilterMode = supportsFilter && value === 'bar';
  const isPaletteMode = supportsPalette && value === 'palette';
  const isParetoMode = supportsPareto && value === 'pareto';
  const isExpandedFilterMode =
    isLineFilterMode || isBarFilterMode || isPaletteMode || isParetoMode;
  const useGridToggleGroup = alwaysGridToggle || isExpandedFilterMode;
  const activeFieldOptions =
    isParetoMode && paretoFieldOptions.length > 0 ? paretoFieldOptions : filterFieldOptions;
  const activeFilterFieldLabel =
    activeFieldOptions.find((option) => option.value === filterFieldValue)?.label ??
    activeFieldOptions[0]?.label ??
    'Field';
  const activePaletteGroupLabel =
    paletteGroupFieldOptions.find((option) => option.value === paletteGroupFieldValue)?.label ??
    paletteGroupFieldOptions[0]?.label ??
    'Group by';
  const activePaletteColorLabel =
    paletteColorFieldOptions.find((option) => option.value === paletteColorFieldValue)?.label ??
    paletteColorFieldOptions[0]?.label ??
    'Color by';

  return (
    <div
      className={`chart-type-toggle-bar${isExpandedFilterMode ? ' chart-type-toggle-bar-with-filter' : ''}`}
    >
      <ToggleButtonGroup
        value={value}
        exclusive
        size="small"
        onChange={(_event, nextVariant) => {
          if (nextVariant) {
            onChange(nextVariant);
          }
        }}
        sx={useGridToggleGroup ? [chartTypeToggleGroupSx, chartTypeToggleGroupFilterSx] : chartTypeToggleGroupSx}
        aria-label="Chart type"
      >
        {showLine && (
          <ToggleButton value="line" sx={chartTypeToggleButtonSx} aria-label="Line chart">
            <FontAwesomeIcon icon={faChartLine} />
          </ToggleButton>
        )}
        {showBar && (
          <ToggleButton value="bar" sx={chartTypeToggleButtonSx} aria-label="Bar chart">
            <FontAwesomeIcon icon={faChartColumn} />
          </ToggleButton>
        )}
        {supportsPalette && (
          <ToggleButton
            value="palette"
            sx={chartTypeToggleButtonSx}
            aria-label={paletteToggleAriaLabel}
          >
            <PaletteChartToggleIcon />
          </ToggleButton>
        )}
        {supportsPareto && (
          <ToggleButton value="pareto" sx={chartTypeToggleButtonSx} aria-label="Pareto chart">
            <ParetoChartToggleIcon />
          </ToggleButton>
        )}
      </ToggleButtonGroup>

      {(supportsFilter || supportsPalette) && (
        <div
          className={`chart-type-inline-filter${isExpandedFilterMode ? ' chart-type-inline-filter-visible' : ''}${isParetoMode ? ' chart-type-inline-filter-single' : ''}`}
        >
          {(isLineFilterMode || isBarFilterMode || isParetoMode) && (
            <FormControl fullWidth size="small" sx={inlineChartFilterSelectStyles}>
              <Select
                value={filterFieldValue}
                onChange={(event) => {
                  onFilterFieldChange?.(event.target.value);
                }}
                renderValue={() => activeFilterFieldLabel}
                MenuProps={selectMenuProps}
                inputProps={{ 'aria-label': filterFieldAriaLabel }}
              >
                {activeFieldOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {(isLineFilterMode || isBarFilterMode) && (
            <FormControl fullWidth size="small" sx={inlineChartFilterSelectStyles}>
              <Select
                value={filterValue}
                displayEmpty
                onChange={(event) => {
                  onFilterValueChange?.(event.target.value);
                }}
                renderValue={(selectedValue) =>
                  selectedValue === ALL_FILTER_VALUE ? filterValueAllLabel : selectedValue
                }
                MenuProps={selectMenuProps}
                inputProps={{ 'aria-label': filterValueAriaLabel }}
              >
                <MenuItem value={ALL_FILTER_VALUE}>{filterValueAllLabel}</MenuItem>
                {filterValueOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {isPaletteMode && (
            <>
              <div className="chart-type-inline-field">
                <span className="chart-type-inline-field-label">Group by</span>
                <FormControl fullWidth size="small" sx={inlineChartFilterSelectStyles}>
                  <Select
                    value={paletteGroupFieldValue}
                    onChange={(event) => {
                      onPaletteGroupFieldChange?.(event.target.value);
                    }}
                    renderValue={() => activePaletteGroupLabel}
                    MenuProps={selectMenuProps}
                    inputProps={{ 'aria-label': paletteGroupFieldAriaLabel }}
                  >
                    {paletteGroupFieldOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </div>

              <div className="chart-type-inline-field">
                <span className="chart-type-inline-field-label">Color by</span>
                <FormControl fullWidth size="small" sx={inlineChartFilterSelectStyles}>
                  <Select
                    value={paletteColorFieldValue}
                    onChange={(event) => {
                      onPaletteColorFieldChange?.(event.target.value);
                    }}
                    renderValue={() => activePaletteColorLabel}
                    MenuProps={selectMenuProps}
                    inputProps={{ 'aria-label': paletteColorFieldAriaLabel }}
                  >
                    {paletteColorFieldOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function buildDynamicNumericYAxis(
  baseAxis,
  seriesCollections,
  { includeZero = false, goalLine = null, paddingRatio = 0.08 } = {}
) {
  const numericValues = seriesCollections
    .flatMap((seriesValues) => seriesValues)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const numericGoalValue = Number(goalLine?.value);

  if (Number.isFinite(numericGoalValue)) {
    numericValues.push(numericGoalValue);
  }

  if (numericValues.length === 0) {
    return baseAxis;
  }

  let minValue = Math.min(...numericValues);
  let maxValue = Math.max(...numericValues);

  if (includeZero) {
    minValue = Math.min(minValue, 0);
    maxValue = Math.max(maxValue, 0);
  }

  if (minValue === maxValue) {
    const fallbackPadding = Math.max(Math.abs(minValue) * paddingRatio, 1);
    minValue -= fallbackPadding;
    maxValue += fallbackPadding;
  } else {
    const valueRange = maxValue - minValue;
    const padding = Math.max(valueRange * paddingRatio, 1);
    minValue -= padding;
    maxValue += padding;
  }

  return baseAxis.map((axisConfig) => ({
    ...axisConfig,
    min: minValue,
    max: maxValue
  }));
}

function renderMetricInfoContent(info) {
  function normalizeMetricInfoEntry(item, { defaultBullet = false } = {}) {
    if (item == null) {
      return null;
    }

    if (typeof item === 'object' && !Array.isArray(item)) {
      const text = String(item.text ?? '').trim();

      if (!text) {
        return null;
      }

      return {
        text,
        bullet: item.bullet ?? defaultBullet,
        bold: Boolean(item.bold),
        underline: Boolean(item.underline)
      };
    }

    const rawText = String(item).trim();

    if (!rawText) {
      return null;
    }

    const bulletMatch = /^(?:[-*•])\s+(.+)$/.exec(rawText);
    const bullet = bulletMatch ? true : defaultBullet;
    let text = (bulletMatch ? bulletMatch[1] : rawText).trim();
    let bold = false;
    let underline = false;
    let hasChanged = true;

    while (hasChanged && text.length > 0) {
      hasChanged = false;

      if (text.startsWith('**') && text.endsWith('**') && text.length > 4) {
        text = text.slice(2, -2).trim();
        bold = true;
        hasChanged = true;
      }

      if (text.startsWith('__') && text.endsWith('__') && text.length > 4) {
        text = text.slice(2, -2).trim();
        underline = true;
        hasChanged = true;
      }
    }

    return text
      ? {
        text,
        bullet,
        bold,
        underline
      }
      : null;
  }

  function renderMetricInfoText(entry) {
    let content = entry.text;

    if (entry.underline) {
      content = <span className="metric-info-underline">{content}</span>;
    }

    if (entry.bold) {
      content = <strong className="metric-info-strong">{content}</strong>;
    }

    return content;
  }

  const normalizedEntries = Array.isArray(info)
    ? info.flatMap((item) => {
      if (item == null) {
        return [];
      }

      if (typeof item === 'object' && !Array.isArray(item)) {
        const normalizedEntry = normalizeMetricInfoEntry(item);
        return normalizedEntry ? [normalizedEntry] : [];
      }

      return String(item)
        .split('\n')
        .map((line) => normalizeMetricInfoEntry(line))
        .filter(Boolean);
    })
    : typeof info === 'object' && info !== null
      ? [normalizeMetricInfoEntry(info)].filter(Boolean)
      : String(info || DEFAULT_METRIC_INFO)
        .split('\n')
        .map((line) => normalizeMetricInfoEntry(line))
        .filter(Boolean);

  if (normalizedEntries.length === 0) {
    return <p className="metric-info-paragraph">{DEFAULT_METRIC_INFO}</p>;
  }

  if (normalizedEntries.length === 1 && !normalizedEntries[0].bullet) {
    return <p className="metric-info-paragraph">{renderMetricInfoText(normalizedEntries[0])}</p>;
  }

  const contentBlocks = [];
  let bulletGroup = [];

  const flushBulletGroup = () => {
    if (bulletGroup.length === 0) {
      return;
    }

    const groupKey = bulletGroup
      .map((entry) => `${entry.text}-${entry.bold}-${entry.underline}`)
      .join('|');

    contentBlocks.push(
      <ul key={`bullets-${groupKey}`} className="metric-info-list">
        {bulletGroup.map((item) => (
          <li key={`${item.text}-${item.bold}-${item.underline}`}>
            {renderMetricInfoText(item)}
          </li>
        ))}
      </ul>
    );

    bulletGroup = [];
  };

  normalizedEntries.forEach((entry) => {
    if (entry.bullet) {
      bulletGroup.push(entry);
      return;
    }

    flushBulletGroup();
    contentBlocks.push(
      <p
        key={`paragraph-${entry.text}-${entry.bold}-${entry.underline}`}
        className="metric-info-paragraph"
      >
        {renderMetricInfoText(entry)}
      </p>
    );
  });

  flushBulletGroup();

  return (
    <div className="metric-info-copy">{contentBlocks}</div>
  );
}

function CardHeader({ title, info, tooltipLegend = null, summaryValue = null, summaryAriaLabel = '' }) {
  const metricInfo = info || DEFAULT_METRIC_INFO;

  return (
    <div className="card-header">
      <div className="card-header-main">
        <h2 className="card-title">{title}</h2>
        {summaryValue != null && (
          <MetricSummaryPanel
            title=""
            value={summaryValue}
            showTitle={false}
            ariaLabel={summaryAriaLabel || `${title} overall value`}
            className="metric-summary-panel-header"
          />
        )}
      </div>
      <div className="card-info">
        <button
          type="button"
          className="card-info-trigger"
          aria-label={`${title} metric info`}
        >
          ?
        </button>
        <div className="card-info-tooltip" role="tooltip">
          {renderMetricInfoContent(metricInfo)}
          {tooltipLegend?.items?.length > 0 && (
            <div className="metric-info-legend">
              <p className="metric-info-legend-title">{tooltipLegend.title || 'Color legend'}</p>
              <div className="metric-info-legend-list">
                {tooltipLegend.items.map((item) => (
                  <div key={`${item.label}-${item.color}`} className="metric-info-legend-item">
                    <span
                      aria-hidden="true"
                      className="metric-info-legend-swatch"
                      style={{ backgroundColor: item.color }}
                    />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricSummaryPanel({
  title,
  value,
  className = '',
  showTitle = true,
  ariaLabel = ''
}) {
  return (
    <section
      className={`filter-panel metric-summary-panel ${className}`.trim()}
      aria-label={ariaLabel || undefined}
    >
      {showTitle && title ? <p className="metric-summary-title">{title}</p> : null}
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
          const tooltipBucketLabel = getTooltipBucketLabel(
            bucketLabel,
            chartData.tooltipLabelLookup
          );
          const directHours = bucketValues?.direct ?? 0;
          const totalHours = bucketValues?.total ?? 0;
          const directShare = bucketValues?.directShare ?? 0;
          const seriesItem = seriesItems[0];

          return renderTooltipTable({
            axisId,
            bucketLabel: tooltipBucketLabel,
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
  const tooltipBucketLabel = getTooltipBucketLabel(
    bucketLabel,
    chartData.tooltipLabelLookup
  );
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
          bucketLabel: tooltipBucketLabel,
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

async function fetchApiJson(scope, url, options = {}) {
  const startTime = performance.now();

  logClientDebug(scope, 'Starting API fetch.', {
    url,
    method: options.method || 'GET'
  });

  const response = await fetch(url, options);
  const responseText = await response.text();
  let payload = null;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  logClientDebug(scope, 'Received API response.', {
    url,
    status: response.status,
    ok: response.ok,
    duration: formatDebugDuration(performance.now() - startTime)
  });

  if (!response.ok) {
    throw new Error(
      payload?.error
      || payload?.message
      || `Request failed with status ${response.status}`
    );
  }

  return payload;
}

function buildDashboardPresetState({
  themeMode,
  selectedCardGroup,
  chartVariants,
  controllableCostsViewMode,
  selectedControllableChartFilterField,
  selectedControllableChartFilterValue,
  selectedControllablePaletteGroupField,
  selectedControllablePaletteColorField,
  sifViewMode,
  selectedSifChartFilterField,
  selectedSifChartFilterValue,
  selectedSifPaletteGroupField,
  selectedSifPaletteColorField,
  potentialSifViewMode,
  selectedPotentialSifChartFilterField,
  selectedPotentialSifChartFilterValue,
  selectedPotentialSifPaletteGroupField,
  selectedPotentialSifPaletteColorField,
  nmfrViewMode,
  selectedNmfrChartFilterField,
  selectedNmfrChartFilterValue,
  selectedNmfrPaletteGroupField,
  selectedNmfrPaletteColorField,
  otdViewMode,
  selectedOtdChartFilterField,
  selectedOtdChartFilterValue,
  selectedOtdPaletteGroupField,
  selectedOtdPaletteColorField,
  laborViewMode,
  selectedLaborChartFilterField,
  selectedLaborChartFilterValue,
  selectedLaborPaletteGroupField,
  selectedLaborPaletteColorField,
  hasCustomizedDateRange,
  selectedDateRange
}) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    themeMode,
    selectedCardGroup,
    chartVariants,
    dateRange: {
      hasCustomizedDateRange,
      startStamp: selectedDateRange?.startStamp ?? null,
      endStamp: selectedDateRange?.endStamp ?? null
    },
    controllableCosts: {
      viewMode: controllableCostsViewMode,
      filterField: selectedControllableChartFilterField,
      filterValue: selectedControllableChartFilterValue,
      paletteGroupField: selectedControllablePaletteGroupField,
      paletteColorField: selectedControllablePaletteColorField
    },
    sif: {
      viewMode: sifViewMode,
      filterField: selectedSifChartFilterField,
      filterValue: selectedSifChartFilterValue,
      paletteGroupField: selectedSifPaletteGroupField,
      paletteColorField: selectedSifPaletteColorField
    },
    potentialSif: {
      viewMode: potentialSifViewMode,
      filterField: selectedPotentialSifChartFilterField,
      filterValue: selectedPotentialSifChartFilterValue,
      paletteGroupField: selectedPotentialSifPaletteGroupField,
      paletteColorField: selectedPotentialSifPaletteColorField
    },
    nmfr: {
      viewMode: nmfrViewMode,
      filterField: selectedNmfrChartFilterField,
      filterValue: selectedNmfrChartFilterValue,
      paletteGroupField: selectedNmfrPaletteGroupField,
      paletteColorField: selectedNmfrPaletteColorField
    },
    otd: {
      viewMode: otdViewMode,
      filterField: selectedOtdChartFilterField,
      filterValue: selectedOtdChartFilterValue,
      paletteGroupField: selectedOtdPaletteGroupField,
      paletteColorField: selectedOtdPaletteColorField
    },
    labor: {
      viewMode: laborViewMode,
      filterField: selectedLaborChartFilterField,
      filterValue: selectedLaborChartFilterValue,
      paletteGroupField: selectedLaborPaletteGroupField,
      paletteColorField: selectedLaborPaletteColorField
    }
  };
}

function resolvePresetDateRangeIndices(availableTimelineStamps, presetState) {
  const presetDateRange = presetState?.dateRange;

  if (
    !presetDateRange?.hasCustomizedDateRange
    || !Number.isFinite(presetDateRange.startStamp)
    || !Number.isFinite(presetDateRange.endStamp)
    || availableTimelineStamps.length === 0
  ) {
    return null;
  }

  let startIndex = availableTimelineStamps.findIndex(
    (stamp) => stamp >= presetDateRange.startStamp
  );

  if (startIndex === -1) {
    startIndex = availableTimelineStamps.length - 1;
  }

  let endIndex = -1;

  for (let index = availableTimelineStamps.length - 1; index >= 0; index -= 1) {
    if (availableTimelineStamps[index] <= presetDateRange.endStamp) {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1) {
    endIndex = 0;
  }

  if (startIndex > endIndex) {
    return [0, availableTimelineStamps.length - 1];
  }

  return [startIndex, endIndex];
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
  const [nmfrArimaGoalLine, setNmfrArimaGoalLine] = useState(null);
  const [selectedControllableChartFilterField, setSelectedControllableChartFilterField] = useState(
    CONTROLLABLE_CHART_FILTER_FIELDS[0].value
  );
  const [selectedControllableChartFilterValue, setSelectedControllableChartFilterValue] =
    useState(ALL_FILTER_VALUE);
  const [selectedControllablePaletteGroupField, setSelectedControllablePaletteGroupField] =
    useState(CONTROLLABLE_PALETTE_FIELDS[0].value);
  const [selectedControllablePaletteColorField, setSelectedControllablePaletteColorField] =
    useState(CONTROLLABLE_PALETTE_FIELDS[1].value);
  const [controllableCostsViewMode, setControllableCostsViewMode] = useState('quarterly');
  const [sifViewMode, setSifViewMode] = useState('monthly');
  const [potentialSifViewMode, setPotentialSifViewMode] = useState('monthly');
  const [nmfrViewMode, setNmfrViewMode] = useState('monthly');
  const [selectedSifChartFilterField, setSelectedSifChartFilterField] = useState(
    SAFETY_CHART_FILTER_FIELDS[0].value
  );
  const [selectedSifChartFilterValue, setSelectedSifChartFilterValue] = useState(ALL_FILTER_VALUE);
  const [selectedSifPaletteGroupField, setSelectedSifPaletteGroupField] = useState(
    SAFETY_PALETTE_FIELDS[0].value
  );
  const [selectedSifPaletteColorField, setSelectedSifPaletteColorField] = useState(
    SAFETY_PALETTE_FIELDS[1].value
  );
  const [selectedPotentialSifChartFilterField, setSelectedPotentialSifChartFilterField] =
    useState(SAFETY_CHART_FILTER_FIELDS[0].value);
  const [selectedPotentialSifChartFilterValue, setSelectedPotentialSifChartFilterValue] =
    useState(ALL_FILTER_VALUE);
  const [selectedPotentialSifPaletteGroupField, setSelectedPotentialSifPaletteGroupField] =
    useState(SAFETY_PALETTE_FIELDS[0].value);
  const [selectedPotentialSifPaletteColorField, setSelectedPotentialSifPaletteColorField] =
    useState(SAFETY_PALETTE_FIELDS[1].value);
  const [selectedNmfrChartFilterField, setSelectedNmfrChartFilterField] = useState(
    SAFETY_CHART_FILTER_FIELDS[0].value
  );
  const [selectedNmfrChartFilterValue, setSelectedNmfrChartFilterValue] = useState(ALL_FILTER_VALUE);
  const [selectedNmfrPaletteGroupField, setSelectedNmfrPaletteGroupField] = useState(
    SAFETY_PALETTE_FIELDS[0].value
  );
  const [selectedNmfrPaletteColorField, setSelectedNmfrPaletteColorField] = useState(
    SAFETY_PALETTE_FIELDS[1].value
  );
  const [selectedOtdChartFilterField, setSelectedOtdChartFilterField] = useState(
    OTD_CHART_FILTER_FIELDS.find((option) => option.value === 'bu')?.value ?? OTD_CHART_FILTER_FIELDS[0].value
  );
  const [selectedOtdChartFilterValue, setSelectedOtdChartFilterValue] = useState(ALL_FILTER_VALUE);
  const [selectedOtdPaletteGroupField, setSelectedOtdPaletteGroupField] = useState(
    OTD_PALETTE_FIELDS[0].value
  );
  const [selectedOtdPaletteColorField, setSelectedOtdPaletteColorField] = useState(
    OTD_PALETTE_FIELDS[1].value
  );
  const [otdViewMode, setOtdViewMode] = useState('monthly');
  const [selectedLaborChartFilterField, setSelectedLaborChartFilterField] = useState(
    LABOR_CHART_FILTER_FIELDS[0].value
  );
  const [selectedLaborChartFilterValue, setSelectedLaborChartFilterValue] =
    useState(ALL_FILTER_VALUE);
  const [selectedLaborPaletteGroupField, setSelectedLaborPaletteGroupField] = useState(
    LABOR_PALETTE_FIELDS[0].value
  );
  const [selectedLaborPaletteColorField, setSelectedLaborPaletteColorField] = useState(
    LABOR_PALETTE_FIELDS[1].value
  );
  const [laborViewMode, setLaborViewMode] = useState('monthly');
  const [selectedCardGroup, setSelectedCardGroup] = useState('all');
  const [chartVariants, setChartVariants] = useState(DEFAULT_CHART_VARIANTS);
  const [selectedDateRangeIndices, setSelectedDateRangeIndices] = useState([0, 0]);
  const [hasCustomizedDateRange, setHasCustomizedDateRange] = useState(false);
  const [pendingPresetDateRange, setPendingPresetDateRange] = useState(null);
  const [dashboardPresetsState, setDashboardPresetsState] = useState({
    currentUser: null,
    presets: [],
    loading: true,
    error: '',
    storageAvailable: false,
    storageMessage: ''
  });
  const [selectedPresetSlot, setSelectedPresetSlot] = useState(1);
  const [presetNameInput, setPresetNameInput] = useState('Preset 1');
  const [presetStatus, setPresetStatus] = useState({
    kind: '',
    message: ''
  });
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isPresetToolbarOpen, setIsPresetToolbarOpen] = useState(false);
  const [hasShownPaletteInfoToast, setHasShownPaletteInfoToast] = useState(() =>
    hasSeenPaletteInfoToast()
  );
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
    let isMounted = true;

    async function loadDashboardPresets() {
      const startTime = performance.now();

      try {
        const payload = await fetchApiJson('presets', '/api/dashboard-presets');

        if (!isMounted) {
          logClientDebug('presets', 'Component unmounted before presets state update.');
          return;
        }

        const presets = Array.isArray(payload?.presets) ? payload.presets : [];

        setDashboardPresetsState({
          currentUser: payload?.currentUser ?? null,
          presets,
          loading: false,
          error: '',
          storageAvailable: Boolean(payload?.storageAvailable),
          storageMessage: payload?.storageMessage ?? ''
        });

        if (presets.length > 0) {
          setSelectedPresetSlot((currentValue) =>
            presets.some((preset) => preset.slot === currentValue)
              ? currentValue
              : presets[0].slot
          );
        }

        logClientDebug('presets', 'Dashboard presets state updated.', {
          presetCount: presets.length,
          storageAvailable: Boolean(payload?.storageAvailable),
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          logClientDebug('presets', 'Component unmounted after presets load failure.', {
            error: error.message
          });
          return;
        }

        setDashboardPresetsState({
          currentUser: null,
          presets: [],
          loading: false,
          error: error.message || 'Unable to load dashboard presets.',
          storageAvailable: false,
          storageMessage: ''
        });

        logClientDebug('presets', 'Dashboard presets load failed.', {
          error: error.message,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      }
    }

    loadDashboardPresets();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const selectedPreset =
      dashboardPresetsState.presets.find((preset) => preset.slot === selectedPresetSlot) ?? null;

    setPresetNameInput(selectedPreset?.name ?? `Preset ${selectedPresetSlot}`);
  }, [dashboardPresetsState.presets, selectedPresetSlot]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    window.localStorage.setItem('expense-theme-mode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (hasShownPaletteInfoToast) {
      return;
    }

    const hasActivePaletteView = Object.values(chartVariants).some((variant) => variant === 'palette');

    if (!hasActivePaletteView) {
      return;
    }

    toast.info(
      'Color view shows the top 20 groups. Hover over the ? icon in the card\'s top right corner to view the color legend.',
      PALETTE_INFO_TOAST_OPTIONS
    );
    markPaletteInfoToastSeen();
    setHasShownPaletteInfoToast(true);
  }, [chartVariants, hasShownPaletteInfoToast]);

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

  const maximumDateIndex = Math.max(availableTimelineStamps.length - 1, 0);
  const ytdRangeIndices = getYtdRangeIndices(availableTimelineStamps);
  const activeDateRangeIndices = [
    Math.max(0, Math.min(selectedDateRangeIndices[0] ?? 0, maximumDateIndex)),
    Math.max(0, Math.min(selectedDateRangeIndices[1] ?? maximumDateIndex, maximumDateIndex))
  ];
  const isAllDateRangeActive =
    availableTimelineStamps.length > 0
    && activeDateRangeIndices[0] === 0
    && activeDateRangeIndices[1] === maximumDateIndex;
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

  useEffect(() => {
    if (!pendingPresetDateRange || availableTimelineStamps.length === 0) {
      return;
    }

    const resolvedIndices = resolvePresetDateRangeIndices(availableTimelineStamps, {
      dateRange: pendingPresetDateRange
    });

    if (resolvedIndices) {
      setSelectedDateRangeIndices(resolvedIndices);
      setHasCustomizedDateRange(true);
    } else {
      setHasCustomizedDateRange(false);
    }

    setPendingPresetDateRange(null);
  }, [availableTimelineKey, availableTimelineStamps, pendingPresetDateRange]);

  const activeControllableChartFilterField =
    CONTROLLABLE_CHART_FILTER_FIELDS.find(
      (option) => option.value === selectedControllableChartFilterField
    ) ?? CONTROLLABLE_CHART_FILTER_FIELDS[0];
  const controllablePaletteGroupFieldOptions = CONTROLLABLE_PALETTE_FIELDS.filter(
    (option) => option.value !== selectedControllablePaletteColorField
  );
  const activeControllablePaletteGroupField =
    controllablePaletteGroupFieldOptions.find(
      (option) => option.value === selectedControllablePaletteGroupField
    ) ?? controllablePaletteGroupFieldOptions[0] ?? CONTROLLABLE_PALETTE_FIELDS[0];
  const controllablePaletteColorFieldOptions = CONTROLLABLE_PALETTE_FIELDS.filter(
    (option) => option.value !== activeControllablePaletteGroupField.value
  );
  const activeControllablePaletteColorField =
    controllablePaletteColorFieldOptions.find(
      (option) => option.value === selectedControllablePaletteColorField
    ) ?? controllablePaletteColorFieldOptions[0] ?? CONTROLLABLE_PALETTE_FIELDS[1];
  const baseFilteredControllableCostsRows = controllableCostsState.rows;
  const controllableChartFilterValueOptions = getFilterOptions(
    baseFilteredControllableCostsRows,
    activeControllableChartFilterField.value
  );
  const activeControllableChartFilterValue = normalizeFilterValue(
    selectedControllableChartFilterValue,
    controllableChartFilterValueOptions
  );
  const controllableFilterApplies = ['line', 'bar'].includes(chartVariants.controllableCosts);
  const filteredControllableCostsRows = baseFilteredControllableCostsRows.filter((row) => {
    if (!controllableFilterApplies) {
      return true;
    }

    return (
      activeControllableChartFilterValue === ALL_FILTER_VALUE ||
      row[activeControllableChartFilterField.value] === activeControllableChartFilterValue
    );
  });
  const globallyFilteredControllableCostsRows = filteredControllableCostsRows.filter((row) =>
    isStampWithinDateRange(getControllableCostsRowStamp(row), selectedDateRange)
  );
  const controllableCostsChartData = buildControllableCostsChartData(
    filteredControllableCostsRows,
    controllableCostsViewMode,
    selectedDateRange
  );
  const controllableCostsParetoChartData = buildControllableCostsParetoChartData(
    baseFilteredControllableCostsRows,
    activeControllableChartFilterField.value,
    selectedDateRange
  );
  const controllableCostsPaletteChartData = buildControllableCostsPaletteChartData(
    baseFilteredControllableCostsRows,
    activeControllablePaletteGroupField.value,
    activeControllablePaletteColorField.value,
    selectedDateRange
  );
  const isControllableCostsPareto = chartVariants.controllableCosts === 'pareto';
  const isControllableCostsPalette = chartVariants.controllableCosts === 'palette';
  const activeSifChartFilterField =
    SAFETY_CHART_FILTER_FIELDS.find((option) => option.value === selectedSifChartFilterField)
    ?? SAFETY_CHART_FILTER_FIELDS[0];
  const sifPaletteGroupFieldOptions = SAFETY_PALETTE_FIELDS.filter(
    (option) => option.value !== selectedSifPaletteColorField
  );
  const activeSifPaletteGroupField =
    sifPaletteGroupFieldOptions.find((option) => option.value === selectedSifPaletteGroupField)
    ?? sifPaletteGroupFieldOptions[0]
    ?? SAFETY_PALETTE_FIELDS[0];
  const sifPaletteColorFieldOptions = SAFETY_PALETTE_FIELDS.filter(
    (option) => option.value !== activeSifPaletteGroupField.value
  );
  const activeSifPaletteColorField =
    sifPaletteColorFieldOptions.find((option) => option.value === selectedSifPaletteColorField)
    ?? sifPaletteColorFieldOptions[0]
    ?? SAFETY_PALETTE_FIELDS[1];
  const baseFilteredSifRows = sifState.rows.filter(
    (row) => Number(row.kpi_id) === SIF_KPI_ID && normalizeText(row.org_unit_name) === INCIDENT_ORG_UNIT_NAME
  );
  const sifChartFilterValueOptions = getFilterOptions(
    baseFilteredSifRows,
    activeSifChartFilterField.value
  );
  const activeSifChartFilterValue = normalizeFilterValue(
    selectedSifChartFilterValue,
    sifChartFilterValueOptions
  );
  const sifFilterApplies = ['line', 'bar'].includes(chartVariants.sif);
  const filteredSifRows = baseFilteredSifRows.filter((row) => (
    !sifFilterApplies
    || activeSifChartFilterValue === ALL_FILTER_VALUE
    || row[activeSifChartFilterField.value] === activeSifChartFilterValue
  ));
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
  const sifParetoChartData = buildSafetyParetoChartData(
    baseFilteredSifRows,
    activeSifChartFilterField.value,
    selectedDateRange,
    'sif'
  );
  const sifPaletteChartData = buildSafetyPaletteChartData(
    baseFilteredSifRows,
    activeSifPaletteGroupField.value,
    activeSifPaletteColorField.value,
    selectedDateRange,
    'sif'
  );
  const isSifPareto = chartVariants.sif === 'pareto';
  const isSifPalette = chartVariants.sif === 'palette';
  const sifSummaryRows = (isSifPareto || isSifPalette ? baseFilteredSifRows : filteredSifRows).filter(
    (row) => isStampWithinDateRange(getIncidentRowStamp(row), selectedDateRange)
  );
  const sifSummaryValue = formatIncidentCount(sumActualValues(sifSummaryRows));

  const activePotentialSifChartFilterField =
    SAFETY_CHART_FILTER_FIELDS.find(
      (option) => option.value === selectedPotentialSifChartFilterField
    ) ?? SAFETY_CHART_FILTER_FIELDS[0];
  const potentialSifPaletteGroupFieldOptions = SAFETY_PALETTE_FIELDS.filter(
    (option) => option.value !== selectedPotentialSifPaletteColorField
  );
  const activePotentialSifPaletteGroupField =
    potentialSifPaletteGroupFieldOptions.find(
      (option) => option.value === selectedPotentialSifPaletteGroupField
    ) ?? potentialSifPaletteGroupFieldOptions[0] ?? SAFETY_PALETTE_FIELDS[0];
  const potentialSifPaletteColorFieldOptions = SAFETY_PALETTE_FIELDS.filter(
    (option) => option.value !== activePotentialSifPaletteGroupField.value
  );
  const activePotentialSifPaletteColorField =
    potentialSifPaletteColorFieldOptions.find(
      (option) => option.value === selectedPotentialSifPaletteColorField
    ) ?? potentialSifPaletteColorFieldOptions[0] ?? SAFETY_PALETTE_FIELDS[1];
  const baseFilteredPotentialSifRows = potentialSifState.rows.filter(
    (row) =>
      Number(row.kpi_id) === POTENTIAL_SIF_KPI_ID &&
      normalizeText(row.org_unit_name) === INCIDENT_ORG_UNIT_NAME
  );
  const potentialSifChartFilterValueOptions = getFilterOptions(
    baseFilteredPotentialSifRows,
    activePotentialSifChartFilterField.value
  );
  const activePotentialSifChartFilterValue = normalizeFilterValue(
    selectedPotentialSifChartFilterValue,
    potentialSifChartFilterValueOptions
  );
  const potentialSifFilterApplies = ['line', 'bar'].includes(chartVariants.potentialSif);
  const filteredPotentialSifRows = baseFilteredPotentialSifRows.filter((row) => (
    !potentialSifFilterApplies
    || activePotentialSifChartFilterValue === ALL_FILTER_VALUE
    || row[activePotentialSifChartFilterField.value] === activePotentialSifChartFilterValue
  ));
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
  const potentialSifParetoChartData = buildSafetyParetoChartData(
    baseFilteredPotentialSifRows,
    activePotentialSifChartFilterField.value,
    selectedDateRange,
    'potentialSif'
  );
  const potentialSifPaletteChartData = buildSafetyPaletteChartData(
    baseFilteredPotentialSifRows,
    activePotentialSifPaletteGroupField.value,
    activePotentialSifPaletteColorField.value,
    selectedDateRange,
    'potentialSif'
  );
  const isPotentialSifPareto = chartVariants.potentialSif === 'pareto';
  const isPotentialSifPalette = chartVariants.potentialSif === 'palette';
  const potentialSifSummaryRows = (
    isPotentialSifPareto || isPotentialSifPalette ? baseFilteredPotentialSifRows : filteredPotentialSifRows
  ).filter((row) => isStampWithinDateRange(getIncidentRowStamp(row), selectedDateRange));
  const potentialSifSummaryValue = formatIncidentCount(
    sumActualValues(potentialSifSummaryRows)
  );

  const activeNmfrChartFilterField =
    SAFETY_CHART_FILTER_FIELDS.find((option) => option.value === selectedNmfrChartFilterField)
    ?? SAFETY_CHART_FILTER_FIELDS[0];
  const nmfrPaletteGroupFieldOptions = SAFETY_PALETTE_FIELDS.filter(
    (option) => option.value !== selectedNmfrPaletteColorField
  );
  const activeNmfrPaletteGroupField =
    nmfrPaletteGroupFieldOptions.find((option) => option.value === selectedNmfrPaletteGroupField)
    ?? nmfrPaletteGroupFieldOptions[0]
    ?? SAFETY_PALETTE_FIELDS[0];
  const nmfrPaletteColorFieldOptions = SAFETY_PALETTE_FIELDS.filter(
    (option) => option.value !== activeNmfrPaletteGroupField.value
  );
  const activeNmfrPaletteColorField =
    nmfrPaletteColorFieldOptions.find((option) => option.value === selectedNmfrPaletteColorField)
    ?? nmfrPaletteColorFieldOptions[0]
    ?? SAFETY_PALETTE_FIELDS[1];
  const baseFilteredNmfrRows = nmfrState.rows.filter(
    (row) => Number(row.kpi_id) === NMFR_KPI_ID && normalizeText(row.org_unit_name) === INCIDENT_ORG_UNIT_NAME
  );
  const nmfrChartFilterValueOptions = getFilterOptions(
    baseFilteredNmfrRows,
    activeNmfrChartFilterField.value
  );
  const activeNmfrChartFilterValue = normalizeFilterValue(
    selectedNmfrChartFilterValue,
    nmfrChartFilterValueOptions
  );
  const nmfrFilterApplies = ['line', 'bar'].includes(chartVariants.nmfr);
  const filteredNmfrRows = baseFilteredNmfrRows.filter((row) => (
    !nmfrFilterApplies
    || activeNmfrChartFilterValue === ALL_FILTER_VALUE
    || row[activeNmfrChartFilterField.value] === activeNmfrChartFilterValue
  ));
  const globallyFilteredNmfrRows = filteredNmfrRows.filter((row) =>
    isStampWithinDateRange(getIncidentRowStamp(row), selectedDateRange)
  );
  const nmfrChartData = buildNmfrChartData(
    filteredNmfrRows,
    NMFR_KPI_ID,
    INCIDENT_ORG_UNIT_NAME,
    nmfrViewMode,
    selectedDateRange
  );
  const nmfrGoalForecastSeries = buildNmfrChartData(
    filteredNmfrRows,
    NMFR_KPI_ID,
    INCIDENT_ORG_UNIT_NAME,
    'monthly',
    selectedDateRange
  );
  const nmfrGoalForecastSeriesValues = nmfrGoalForecastSeries.map((bucket) => bucket.total);
  const nmfrGoalForecastSeriesSignature = nmfrGoalForecastSeriesValues.join('|');
  const nmfrParetoChartData = buildSafetyParetoChartData(
    baseFilteredNmfrRows,
    activeNmfrChartFilterField.value,
    selectedDateRange,
    'nmfr'
  );
  const nmfrPaletteChartData = buildSafetyPaletteChartData(
    baseFilteredNmfrRows,
    activeNmfrPaletteGroupField.value,
    activeNmfrPaletteColorField.value,
    selectedDateRange,
    'nmfr'
  );
  const isNmfrPareto = chartVariants.nmfr === 'pareto';
  const isNmfrPalette = chartVariants.nmfr === 'palette';
  const nmfrSummaryRows = (isNmfrPareto || isNmfrPalette ? baseFilteredNmfrRows : filteredNmfrRows).filter(
    (row) => isStampWithinDateRange(getIncidentRowStamp(row), selectedDateRange)
  );
  const nmfrOverallValue = calculateNmfrValueFromRows(nmfrSummaryRows);
  const nmfrSummaryValue = nmfrOverallValue == null ? '--' : formatNumber(nmfrOverallValue);

  useEffect(() => {
    if (nmfrState.loading || nmfrState.error || isNmfrPareto || isNmfrPalette) {
      setNmfrArimaGoalLine(null);
      return undefined;
    }

    if (nmfrGoalForecastSeriesValues.length < 10) {
      setNmfrArimaGoalLine(null);
      return undefined;
    }

    let isCancelled = false;

    forecastNmfrGoalLineFromSeries(nmfrGoalForecastSeriesValues)
      .then((goalLine) => {
        if (isCancelled) {
          return;
        }

        if (!goalLine) {
          logClientDebug('nmfr-goal', 'ARIMA goal line unavailable; using static fallback.', {
            observationCount: nmfrGoalForecastSeriesValues.length
          });
          setNmfrArimaGoalLine(null);
          return;
        }

        logClientDebug('nmfr-goal', 'Updated ARIMA goal line from monthly NMFR forecast.', {
          observationCount: nmfrGoalForecastSeriesValues.length,
          goalLine
        });
        setNmfrArimaGoalLine(goalLine);
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        logClientDebug('nmfr-goal', 'Failed to compute ARIMA goal line; using static fallback.', {
          observationCount: nmfrGoalForecastSeriesValues.length,
          error: error?.message ?? String(error)
        });
        setNmfrArimaGoalLine(null);
      });

    return () => {
      isCancelled = true;
    };
  }, [
    isNmfrPalette,
    isNmfrPareto,
    nmfrGoalForecastSeriesSignature,
    nmfrState.error,
    nmfrState.loading
  ]);

  const activeOtdChartFilterField =
    OTD_CHART_FILTER_FIELDS.find((option) => option.value === selectedOtdChartFilterField) ??
    OTD_CHART_FILTER_FIELDS[0];
  const otdPaletteGroupFieldOptions = OTD_PALETTE_FIELDS.filter(
    (option) => option.value !== selectedOtdPaletteColorField
  );
  const activeOtdPaletteGroupField =
    otdPaletteGroupFieldOptions.find((option) => option.value === selectedOtdPaletteGroupField)
    ?? otdPaletteGroupFieldOptions[0]
    ?? OTD_PALETTE_FIELDS[0];
  const otdPaletteColorFieldOptions = OTD_PALETTE_FIELDS.filter(
    (option) => option.value !== activeOtdPaletteGroupField.value
  );
  const activeOtdPaletteColorField =
    otdPaletteColorFieldOptions.find((option) => option.value === selectedOtdPaletteColorField)
    ?? otdPaletteColorFieldOptions[0]
    ?? OTD_PALETTE_FIELDS[1];
  const baseFilteredOtdRows = otdState.rows;
  const otdChartFilterValueOptions = getFilterOptions(
    baseFilteredOtdRows,
    activeOtdChartFilterField.value
  );
  const activeOtdChartFilterValue = normalizeFilterValue(
    selectedOtdChartFilterValue,
    otdChartFilterValueOptions
  );
  const otdFilterApplies = ['line', 'bar'].includes(chartVariants.otd);
  const filteredOtdRows = baseFilteredOtdRows.filter((row) => {
    if (!otdFilterApplies) {
      return true;
    }

    return (
      activeOtdChartFilterValue === ALL_FILTER_VALUE ||
      row[activeOtdChartFilterField.value] === activeOtdChartFilterValue
    );
  });
  const otdChartData = buildOtdChartData(filteredOtdRows, otdViewMode, selectedDateRange);
  const otdPaletteChartData = buildOtdPaletteChartData(
    baseFilteredOtdRows,
    activeOtdPaletteGroupField.value,
    activeOtdPaletteColorField.value,
    selectedDateRange
  );
  const otdParetoChartData = buildOtdParetoChartData(
    baseFilteredOtdRows,
    activeOtdChartFilterField.value,
    selectedDateRange
  );
  const isOtdPalette = chartVariants.otd === 'palette';
  const isOtdPareto = chartVariants.otd === 'pareto';

  const activeLaborChartFilterField =
    LABOR_CHART_FILTER_FIELDS.find((option) => option.value === selectedLaborChartFilterField) ??
    LABOR_CHART_FILTER_FIELDS[0];
  const laborPaletteGroupFieldOptions = LABOR_PALETTE_FIELDS.filter(
    (option) => option.value !== selectedLaborPaletteColorField
  );
  const activeLaborPaletteGroupField =
    laborPaletteGroupFieldOptions.find((option) => option.value === selectedLaborPaletteGroupField)
    ?? laborPaletteGroupFieldOptions[0]
    ?? LABOR_PALETTE_FIELDS[0];
  const laborPaletteColorFieldOptions = LABOR_PALETTE_FIELDS.filter(
    (option) => option.value !== activeLaborPaletteGroupField.value
  );
  const activeLaborPaletteColorField =
    laborPaletteColorFieldOptions.find((option) => option.value === selectedLaborPaletteColorField)
    ?? laborPaletteColorFieldOptions[0]
    ?? LABOR_PALETTE_FIELDS[1];
  const laborChartFilterValueOptions = getFilterOptions(
    laborState.rows,
    activeLaborChartFilterField.value
  );
  const activeLaborChartFilterValue = normalizeFilterValue(
    selectedLaborChartFilterValue,
    laborChartFilterValueOptions
  );
  const laborFilterApplies = ['line', 'bar'].includes(chartVariants.labor);
  const filteredLaborRows = laborState.rows.filter((row) => {
    if (!laborFilterApplies) {
      return true;
    }

    return (
      activeLaborChartFilterValue === ALL_FILTER_VALUE ||
      row[activeLaborChartFilterField.value] === activeLaborChartFilterValue
    );
  });
  const laborChartData = buildLaborUtilizationChartData(
    filteredLaborRows,
    laborViewMode,
    selectedDateRange
  );
  const laborPaletteChartData = buildLaborPaletteChartData(
    laborState.rows,
    activeLaborPaletteGroupField.value,
    activeLaborPaletteColorField.value,
    selectedDateRange
  );
  const laborParetoChartData = buildLaborParetoChartData(
    laborState.rows,
    activeLaborChartFilterField.value,
    selectedDateRange
  );
  const isLaborPalette = chartVariants.labor === 'palette';
  const isLaborPareto = chartVariants.labor === 'pareto';
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
  const controllableCostsTooltipLegend = isControllableCostsPalette
    ? buildTooltipLegend(
      `Color by ${activeControllablePaletteColorField.label}`,
      controllableCostsPaletteChartData.series
    )
    : null;
  const sifTooltipLegend = isSifPalette
    ? buildTooltipLegend(`Color by ${activeSifPaletteColorField.label}`, sifPaletteChartData.series)
    : null;
  const potentialSifTooltipLegend = isPotentialSifPalette
    ? buildTooltipLegend(
      `Color by ${activePotentialSifPaletteColorField.label}`,
      potentialSifPaletteChartData.series
    )
    : null;
  const nmfrTooltipLegend = isNmfrPalette
    ? buildTooltipLegend(`Color by ${activeNmfrPaletteColorField.label}`, nmfrPaletteChartData.series)
    : null;
  const otdTooltipLegend = isOtdPalette
    ? buildTooltipLegend(`Color by ${activeOtdPaletteColorField.label}`, otdPaletteChartData.series)
    : null;
  const laborTooltipLegend = isLaborPalette
    ? buildTooltipLegend(`Color by ${activeLaborPaletteColorField.label}`, laborPaletteChartData.series)
    : null;
  const controllableCostsGoalLine = getMetricGoalLine(
    'controllableCosts',
    isControllableCostsPareto || isControllableCostsPalette
      ? null
      : controllableCostsViewMode
  );
  const visibleControllableCostsGoalLine = clampGoalLineToVisibleSeries(
    controllableCostsGoalLine,
    [controllableCostsChartData.controllable, controllableCostsChartData.uncontrollable]
  );
  const controllableCostsChartYAxis = buildDynamicNumericYAxis(
    CONTROLLABLE_COSTS_Y_AXIS,
    [controllableCostsChartData.controllable, controllableCostsChartData.uncontrollable],
    {
      includeZero: chartVariants.controllableCosts === 'bar',
      goalLine: visibleControllableCostsGoalLine
    }
  );
  const sifGoalLine = getMetricGoalLine(
    'sif',
    isSifPareto || isSifPalette ? null : sifViewMode
  );
  const potentialSifGoalLine = getMetricGoalLine(
    'potentialSif',
    isPotentialSifPareto || isPotentialSifPalette ? null : potentialSifViewMode
  );
  const nmfrGoalLine = getMetricGoalLine(
    'nmfr',
    isNmfrPareto || isNmfrPalette ? null : nmfrViewMode
  );
  const visibleNmfrGoalLine = clampGoalLineToVisibleSeries(
    nmfrArimaGoalLine ?? nmfrGoalLine,
    [nmfrChartData.map((bucket) => bucket.total)]
  );
  const nmfrChartYAxis = buildDynamicNumericYAxis(
    NMFR_Y_AXIS,
    [nmfrChartData.map((bucket) => bucket.total)],
    {
      includeZero: chartVariants.nmfr === 'bar',
      goalLine: visibleNmfrGoalLine
    }
  );
  const otdGoalLine = getMetricGoalLine(
    'otd',
    isOtdPareto || isOtdPalette ? null : otdViewMode
  );
  const laborGoalLine = getMetricGoalLine(
    'labor',
    isLaborPareto || isLaborPalette ? null : laborViewMode
  );
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
  const getGlobalChartMode = (_metricKey, variant) => {
    if (variant === 'line') {
      return 'line';
    }

    if (variant === 'bar') {
      return 'bar';
    }

    return 'special';
  };
  const allChartsLine = Object.entries(chartVariants).every(
    ([metricKey, variant]) => getGlobalChartMode(metricKey, variant) === 'line'
  );
  const allChartsBar = Object.entries(chartVariants).every(
    ([metricKey, variant]) => getGlobalChartMode(metricKey, variant) === 'bar'
  );
  const allChartsPalette = Object.values(chartVariants).every(
    (variant) => variant === 'palette'
  );
  const allChartsPareto = Object.values(chartVariants).every(
    (variant) => variant === 'pareto'
  );
  const presetsBySlot = new Map(
    dashboardPresetsState.presets.map((preset) => [preset.slot, preset])
  );
  const selectedPreset = presetsBySlot.get(selectedPresetSlot) ?? null;
  const canLoadSelectedPreset = Boolean(selectedPreset?.state);
  const canSavePresets =
    !dashboardPresetsState.loading &&
    dashboardPresetsState.storageAvailable &&
    Boolean(dashboardPresetsState.currentUser?.my_id) &&
    !isSavingPreset;
  const presetUserLabel = dashboardPresetsState.currentUser
    ? `${dashboardPresetsState.currentUser.name} (${dashboardPresetsState.currentUser.my_id})`
    : 'Loading user...';
  const presetMessage =
    dashboardPresetsState.error
    || presetStatus.message
    || dashboardPresetsState.storageMessage
    || '';
  const presetMessageKind = dashboardPresetsState.error
    ? 'error'
    : presetStatus.kind
      ? presetStatus.kind
      : dashboardPresetsState.storageMessage
        ? 'warning'
        : '';
  const BrandingBannerWrapper = SITE_BRANDING.href ? 'a' : 'div';

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

  const applyDashboardPresetState = (presetState, presetName) => {
    if (!presetState || typeof presetState !== 'object') {
      setPresetStatus({
        kind: 'error',
        message: 'That preset does not contain any saved dashboard state.'
      });
      return;
    }

    if (presetState.themeMode === 'light' || presetState.themeMode === 'dark') {
      setThemeMode(presetState.themeMode);
    }

    if (CARD_CHIP_OPTIONS.some((cardGroup) => cardGroup.key === presetState.selectedCardGroup)) {
      setSelectedCardGroup(presetState.selectedCardGroup);
    }

    setChartVariants(
      Object.fromEntries(
        Object.entries(DEFAULT_CHART_VARIANTS).map(([metricKey, defaultVariant]) => {
          const presetVariant = presetState.chartVariants?.[metricKey];
          const candidateVariant = presetVariant === 'filter' ? 'line' : presetVariant;
          const allowedVariants = CARD_VARIANT_OPTIONS_BY_METRIC[metricKey] ?? [defaultVariant];

          return [
            metricKey,
            allowedVariants.includes(candidateVariant) ? candidateVariant : defaultVariant
          ];
        })
      )
    );

    if (Object.hasOwn(CONTROLLABLE_COSTS_VIEW_CONFIG, presetState.controllableCosts?.viewMode)) {
      setControllableCostsViewMode(presetState.controllableCosts.viewMode);
    }

    if (Object.hasOwn(INCIDENT_VIEW_CONFIG, presetState.sif?.viewMode)) {
      setSifViewMode(presetState.sif.viewMode);
    }

    if (
      SAFETY_CHART_FILTER_FIELDS.some((option) => option.value === presetState.sif?.filterField)
    ) {
      setSelectedSifChartFilterField(presetState.sif.filterField);
    }

    setSelectedSifChartFilterValue(
      typeof presetState.sif?.filterValue === 'string'
        ? presetState.sif.filterValue
        : ALL_FILTER_VALUE
    );

    if (
      SAFETY_PALETTE_FIELDS.some((option) => option.value === presetState.sif?.paletteGroupField)
    ) {
      setSelectedSifPaletteGroupField(presetState.sif.paletteGroupField);
    }

    if (
      SAFETY_PALETTE_FIELDS.some((option) => option.value === presetState.sif?.paletteColorField)
    ) {
      setSelectedSifPaletteColorField(presetState.sif.paletteColorField);
    }

    if (Object.hasOwn(INCIDENT_VIEW_CONFIG, presetState.potentialSif?.viewMode)) {
      setPotentialSifViewMode(presetState.potentialSif.viewMode);
    }

    if (
      SAFETY_CHART_FILTER_FIELDS.some(
        (option) => option.value === presetState.potentialSif?.filterField
      )
    ) {
      setSelectedPotentialSifChartFilterField(presetState.potentialSif.filterField);
    }

    setSelectedPotentialSifChartFilterValue(
      typeof presetState.potentialSif?.filterValue === 'string'
        ? presetState.potentialSif.filterValue
        : ALL_FILTER_VALUE
    );

    if (
      SAFETY_PALETTE_FIELDS.some(
        (option) => option.value === presetState.potentialSif?.paletteGroupField
      )
    ) {
      setSelectedPotentialSifPaletteGroupField(presetState.potentialSif.paletteGroupField);
    }

    if (
      SAFETY_PALETTE_FIELDS.some(
        (option) => option.value === presetState.potentialSif?.paletteColorField
      )
    ) {
      setSelectedPotentialSifPaletteColorField(presetState.potentialSif.paletteColorField);
    }

    if (Object.hasOwn(INCIDENT_VIEW_CONFIG, presetState.nmfr?.viewMode)) {
      setNmfrViewMode(presetState.nmfr.viewMode);
    }

    if (
      SAFETY_CHART_FILTER_FIELDS.some((option) => option.value === presetState.nmfr?.filterField)
    ) {
      setSelectedNmfrChartFilterField(presetState.nmfr.filterField);
    }

    setSelectedNmfrChartFilterValue(
      typeof presetState.nmfr?.filterValue === 'string'
        ? presetState.nmfr.filterValue
        : ALL_FILTER_VALUE
    );

    if (
      SAFETY_PALETTE_FIELDS.some((option) => option.value === presetState.nmfr?.paletteGroupField)
    ) {
      setSelectedNmfrPaletteGroupField(presetState.nmfr.paletteGroupField);
    }

    if (
      SAFETY_PALETTE_FIELDS.some((option) => option.value === presetState.nmfr?.paletteColorField)
    ) {
      setSelectedNmfrPaletteColorField(presetState.nmfr.paletteColorField);
    }

    if (Object.hasOwn(OTD_VIEW_CONFIG, presetState.otd?.viewMode)) {
      setOtdViewMode(presetState.otd.viewMode);
    }

    if (Object.hasOwn(LABOR_VIEW_CONFIG, presetState.labor?.viewMode)) {
      setLaborViewMode(presetState.labor.viewMode);
    }

    if (
      CONTROLLABLE_CHART_FILTER_FIELDS.some(
        (option) => option.value === presetState.controllableCosts?.filterField
      )
    ) {
      setSelectedControllableChartFilterField(presetState.controllableCosts.filterField);
    }

    setSelectedControllableChartFilterValue(
      typeof presetState.controllableCosts?.filterValue === 'string'
        ? presetState.controllableCosts.filterValue
        : ALL_FILTER_VALUE
    );

    if (
      CONTROLLABLE_PALETTE_FIELDS.some(
        (option) => option.value === presetState.controllableCosts?.paletteGroupField
      )
    ) {
      setSelectedControllablePaletteGroupField(
        presetState.controllableCosts.paletteGroupField
      );
    }

    if (
      CONTROLLABLE_PALETTE_FIELDS.some(
        (option) => option.value === presetState.controllableCosts?.paletteColorField
      )
    ) {
      setSelectedControllablePaletteColorField(
        presetState.controllableCosts.paletteColorField
      );
    }

    if (
      OTD_CHART_FILTER_FIELDS.some((option) => option.value === presetState.otd?.filterField)
    ) {
      setSelectedOtdChartFilterField(presetState.otd.filterField);
    }

    setSelectedOtdChartFilterValue(
      typeof presetState.otd?.filterValue === 'string'
        ? presetState.otd.filterValue
        : ALL_FILTER_VALUE
    );

    if (
      OTD_PALETTE_FIELDS.some((option) => option.value === presetState.otd?.paletteGroupField)
    ) {
      setSelectedOtdPaletteGroupField(presetState.otd.paletteGroupField);
    }

    if (
      OTD_PALETTE_FIELDS.some((option) => option.value === presetState.otd?.paletteColorField)
    ) {
      setSelectedOtdPaletteColorField(presetState.otd.paletteColorField);
    }

    if (
      LABOR_CHART_FILTER_FIELDS.some((option) => option.value === presetState.labor?.filterField)
    ) {
      setSelectedLaborChartFilterField(presetState.labor.filterField);
    }

    setSelectedLaborChartFilterValue(
      typeof presetState.labor?.filterValue === 'string'
        ? presetState.labor.filterValue
        : ALL_FILTER_VALUE
    );

    if (
      LABOR_PALETTE_FIELDS.some((option) => option.value === presetState.labor?.paletteGroupField)
    ) {
      setSelectedLaborPaletteGroupField(presetState.labor.paletteGroupField);
    }

    if (
      LABOR_PALETTE_FIELDS.some((option) => option.value === presetState.labor?.paletteColorField)
    ) {
      setSelectedLaborPaletteColorField(presetState.labor.paletteColorField);
    }

    if (presetState.dateRange?.hasCustomizedDateRange) {
      const resolvedIndices = resolvePresetDateRangeIndices(
        availableTimelineStamps,
        presetState
      );

      if (resolvedIndices) {
        setSelectedDateRangeIndices(resolvedIndices);
        setHasCustomizedDateRange(true);
        setPendingPresetDateRange(null);
      } else {
        setPendingPresetDateRange(presetState.dateRange);
      }
    } else {
      setPendingPresetDateRange(null);
      setHasCustomizedDateRange(false);

      if (availableTimelineStamps.length > 0) {
        setSelectedDateRangeIndices([0, availableTimelineStamps.length - 1]);
      }
    }

    setPresetStatus({
      kind: 'success',
      message: presetName ? `Loaded ${presetName}.` : 'Preset loaded.'
    });
  };

  const handleLoadPreset = () => {
    if (!selectedPreset?.state) {
      setPresetStatus({
        kind: 'error',
        message: 'No preset is saved in the selected slot.'
      });
      return;
    }

    applyDashboardPresetState(selectedPreset.state, selectedPreset.name);
  };

  const handleSavePreset = async () => {
    if (!canSavePresets) {
      return;
    }

    setIsSavingPreset(true);
    setPresetStatus({
      kind: '',
      message: ''
    });

    try {
      const state = buildDashboardPresetState({
        themeMode,
        selectedCardGroup,
        chartVariants,
        controllableCostsViewMode,
        selectedControllableChartFilterField,
        selectedControllableChartFilterValue,
        selectedControllablePaletteGroupField,
        selectedControllablePaletteColorField,
        sifViewMode,
        selectedSifChartFilterField,
        selectedSifChartFilterValue,
        selectedSifPaletteGroupField,
        selectedSifPaletteColorField,
        potentialSifViewMode,
        selectedPotentialSifChartFilterField,
        selectedPotentialSifChartFilterValue,
        selectedPotentialSifPaletteGroupField,
        selectedPotentialSifPaletteColorField,
        nmfrViewMode,
        selectedNmfrChartFilterField,
        selectedNmfrChartFilterValue,
        selectedNmfrPaletteGroupField,
        selectedNmfrPaletteColorField,
        otdViewMode,
        selectedOtdChartFilterField,
        selectedOtdChartFilterValue,
        selectedOtdPaletteGroupField,
        selectedOtdPaletteColorField,
        laborViewMode,
        selectedLaborChartFilterField,
        selectedLaborChartFilterValue,
        selectedLaborPaletteGroupField,
        selectedLaborPaletteColorField,
        hasCustomizedDateRange,
        selectedDateRange
      });
      const payload = await fetchApiJson(
        'presets',
        `/api/dashboard-presets/${selectedPresetSlot}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: presetNameInput,
            state
          })
        }
      );
      const presets = Array.isArray(payload?.presets) ? payload.presets : [];

      setDashboardPresetsState((currentValue) => ({
        ...currentValue,
        currentUser: payload?.currentUser ?? currentValue.currentUser,
        presets,
        storageAvailable: Boolean(payload?.storageAvailable),
        storageMessage: payload?.storageMessage ?? '',
        error: ''
      }));
      setPresetStatus({
        kind: 'success',
        message: `Saved ${presetNameInput.trim() || `Preset ${selectedPresetSlot}`}.`
      });
    } catch (error) {
      setPresetStatus({
        kind: 'error',
        message: error.message || 'Unable to save the selected preset.'
      });
    } finally {
      setIsSavingPreset(false);
    }
  };

  return (
    <main className="app-shell">
      <div className="branding-banner">
        <div className="branding-banner-inner">
          <BrandingBannerWrapper
            className="branding-banner-main"
            {...(SITE_BRANDING.href ? { href: SITE_BRANDING.href } : {})}
          >
            {SITE_BRANDING.iconSrc ? (
              <img
                src={SITE_BRANDING.iconSrc}
                alt={SITE_BRANDING.iconAlt || ''}
                className="branding-banner-icon"
              />
            ) : null}
            <h1 className="branding-banner-title">{SITE_BRANDING.title}</h1>
          </BrandingBannerWrapper>
        </div>
      </div>

      <div className="page-frame">
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
                        <button
                          type="button"
                          className={`global-date-filter-shortcut${isAllDateRangeActive ? ' global-date-filter-shortcut-active' : ''}`}
                          onClick={() => {
                            setPendingPresetDateRange(null);
                            setSelectedDateRangeIndices([0, maximumDateIndex]);
                            setHasCustomizedDateRange(false);
                          }}
                        >
                          Reset
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
                    <button
                      type="button"
                      className={`chart-mode-button${allChartsPalette ? ' chart-mode-button-active' : ''}`}
                      aria-label="Show all stacked bar charts"
                      aria-pressed={allChartsPalette}
                      onClick={() => {
                        setAllChartVariants('palette');
                      }}
                    >
                      <PaletteChartToggleIcon />
                    </button>
                    <button
                      type="button"
                      className={`chart-mode-button${allChartsPareto ? ' chart-mode-button-active' : ''}`}
                      aria-label="Show all pareto charts"
                      aria-pressed={allChartsPareto}
                      onClick={() => {
                        setAllChartVariants('pareto');
                      }}
                    >
                      <ParetoChartToggleIcon />
                    </button>
                  </div>

                  <button
                    type="button"
                    className={`preset-toolbar-toggle-button${isPresetToolbarOpen ? ' preset-toolbar-toggle-button-active' : ''}`}
                    aria-expanded={isPresetToolbarOpen}
                    onClick={() => {
                      setIsPresetToolbarOpen((currentValue) => !currentValue);
                    }}
                  >
                    {isPresetToolbarOpen ? 'Hide presets' : 'View/set presets'}
                  </button>

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

            {isPresetToolbarOpen && (
              <div className="preset-toolbar">
                <div className="preset-toolbar-main">
                  <div className="preset-toolbar-user">
                    <p className="preset-toolbar-label">Presets</p>
                    <p className="preset-toolbar-user-value">{presetUserLabel}</p>
                  </div>

                  <div className="preset-slot-list" role="group" aria-label="Preset slots">
                    {PRESET_SLOT_OPTIONS.map((slot) => {
                      const preset = presetsBySlot.get(slot);

                      return (
                        <button
                          key={slot}
                          type="button"
                          className={`preset-slot-button${selectedPresetSlot === slot ? ' preset-slot-button-active' : ''}${preset ? ' preset-slot-button-filled' : ''}`}
                          aria-pressed={selectedPresetSlot === slot}
                          onClick={() => {
                            setSelectedPresetSlot(slot);
                            setPresetStatus({
                              kind: '',
                              message: ''
                            });
                          }}
                        >
                          <span className="preset-slot-button-index">Slot {slot}</span>
                          <span className="preset-slot-button-name">
                            {preset?.name || `Preset ${slot}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="preset-toolbar-actions">
                    <input
                      type="text"
                      className="preset-name-input"
                      value={presetNameInput}
                      maxLength={100}
                      onChange={(event) => {
                        setPresetNameInput(event.target.value);
                        setPresetStatus({
                          kind: '',
                          message: ''
                        });
                      }}
                      placeholder={`Preset ${selectedPresetSlot}`}
                      aria-label="Preset name"
                    />

                    <button
                      type="button"
                      className="preset-action-button"
                      onClick={handleLoadPreset}
                      disabled={!canLoadSelectedPreset}
                    >
                      Load
                    </button>

                    <button
                      type="button"
                      className="preset-action-button preset-action-button-primary"
                      onClick={handleSavePreset}
                      disabled={!canSavePresets}
                    >
                      {isSavingPreset ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>

                {presetMessage && (
                  <p className={`preset-toolbar-message${presetMessageKind ? ` preset-toolbar-message-${presetMessageKind}` : ''}`}>
                    {presetMessage}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="cards-grid">
            {visibleCards.controllableCosts && (
              <article className="analytics-card" style={{ order: 1 }}>
                <CardHeader
                  title="Controllable Costs"
                  info={METRIC_INFO.controllableCosts}
                  tooltipLegend={controllableCostsTooltipLegend}
                />

                <div className="dashboard-grid">
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
                        (baseFilteredControllableCostsRows.length === 0 ||
                          (isControllableCostsPareto
                            ? controllableCostsParetoChartData.labels.length === 0
                            : isControllableCostsPalette
                              ? controllableCostsPaletteChartData.labels.length === 0
                              : globallyFilteredControllableCostsRows.length === 0)) && (
                          <p className="chart-message">
                            {controllableCostsState.rows.length === 0
                              ? 'No controllable cost rows are available for charting.'
                              : filteredControllableCostsRows.length === 0 && controllableFilterApplies
                                ? 'No controllable cost rows match the selected filters.'
                                : 'No controllable cost rows fall within the selected date range.'}
                          </p>
                        )}

                      {!controllableCostsState.loading &&
                        !controllableCostsState.error &&
                        (isControllableCostsPareto
                          ? controllableCostsParetoChartData.labels.length > 0
                          : isControllableCostsPalette
                            ? controllableCostsPaletteChartData.labels.length > 0
                            : controllableCostsChartData.labels.length > 0) &&
                        controllableCostsChartWidth > 0 && (
                          isControllableCostsPareto ? (
                            <ParetoMetricChart
                              width={controllableCostsChartWidth}
                              height={CHART_HEIGHT}
                              margin={DEFAULT_CHART_MARGIN}
                              labels={controllableCostsParetoChartData.labels}
                              values={controllableCostsParetoChartData.values}
                              cumulativeShares={controllableCostsParetoChartData.cumulativeShares}
                              barLabel="Total cost"
                              barColor="var(--chart-line)"
                              barAxis={CONTROLLABLE_COSTS_Y_AXIS}
                              barValueFormatter={formatCurrency}
                              goalLine={visibleControllableCostsGoalLine}
                              sx={sharedChartSx}
                            />
                          ) : isControllableCostsPalette ? (
                            <StackedCategoryBarChart
                              width={controllableCostsChartWidth}
                              height={CHART_HEIGHT}
                              margin={DEFAULT_CHART_MARGIN}
                              labels={controllableCostsPaletteChartData.labels}
                              yAxis={CONTROLLABLE_COSTS_Y_AXIS}
                              series={controllableCostsPaletteChartData.series.map((seriesItem) => ({
                                ...seriesItem,
                                valueFormatter: formatCurrency
                              }))}
                              sx={sharedChartSx}
                            />
                          ) : (
                            <MetricTrendChart
                              variant={chartVariants.controllableCosts === 'bar' ? 'bar' : 'line'}
                              width={controllableCostsChartWidth}
                              height={CHART_HEIGHT}
                              margin={DEFAULT_CHART_MARGIN}
                              labels={controllableCostsChartData.labels}
                              yAxis={controllableCostsChartYAxis}
                              series={[
                                {
                                  data: controllableCostsChartData.controllable,
                                  label: 'Controllable',
                                  color: 'var(--chart-line)',
                                  valueFormatter: formatCurrency,
                                  showMark: controllableCostsChartData.labels.length <= 1
                                },
                                {
                                  data: controllableCostsChartData.uncontrollable,
                                  label: 'Uncontrollable',
                                  color: 'var(--chart-accent-line)',
                                  valueFormatter: formatCurrency,
                                  showMark: controllableCostsChartData.labels.length <= 1
                                }
                              ]}
                              goalLine={visibleControllableCostsGoalLine}
                              sx={sharedChartSx}
                            />
                          )
                        )}
                    </div>

                    <div className="chart-control-row chart-control-row-single">
                      <div className="chart-control-row-toggle">
                        <ChartTypeToggle
                          value={chartVariants.controllableCosts}
                          onChange={(nextVariant) => {
                            if (nextVariant === 'pareto') {
                              setSelectedControllableChartFilterField(
                                CONTROLLABLE_PARETO_FILTER_FIELDS[0].value
                              );
                            }

                            setChartVariants((currentValue) => ({
                              ...currentValue,
                              controllableCosts: nextVariant
                            }));
                          }}
                          alwaysGridToggle
                          supportsFilter
                          supportsPalette
                          supportsPareto
                          filterToggleAriaLabel="Controllable costs time series"
                          filterFieldValue={activeControllableChartFilterField.value}
                          filterFieldOptions={CONTROLLABLE_CHART_FILTER_FIELDS}
                          paretoFieldOptions={CONTROLLABLE_PARETO_FILTER_FIELDS}
                          filterFieldAriaLabel="Select controllable costs filter field"
                          onFilterFieldChange={(nextField) => {
                            setSelectedControllableChartFilterField(nextField);
                            setSelectedControllableChartFilterValue(ALL_FILTER_VALUE);
                          }}
                          filterValue={activeControllableChartFilterValue}
                          filterValueOptions={controllableChartFilterValueOptions}
                          filterValueAllLabel={activeControllableChartFilterField.allLabel}
                          filterValueAriaLabel="Select controllable costs filter value"
                          onFilterValueChange={setSelectedControllableChartFilterValue}
                          paletteToggleAriaLabel="Controllable costs grouped palette chart"
                          paletteGroupFieldValue={activeControllablePaletteGroupField.value}
                          paletteGroupFieldOptions={controllablePaletteGroupFieldOptions}
                          paletteGroupFieldAriaLabel="Select controllable costs group field"
                          onPaletteGroupFieldChange={(nextField) => {
                            setSelectedControllablePaletteGroupField(nextField);

                            if (nextField === activeControllablePaletteColorField.value) {
                              const nextColorField =
                                CONTROLLABLE_PALETTE_FIELDS.find(
                                  (option) => option.value !== nextField
                                )?.value ?? nextField;

                              setSelectedControllablePaletteColorField(nextColorField);
                            }
                          }}
                          paletteColorFieldValue={activeControllablePaletteColorField.value}
                          paletteColorFieldOptions={controllablePaletteColorFieldOptions}
                          paletteColorFieldAriaLabel="Select controllable costs color field"
                          onPaletteColorFieldChange={(nextField) => {
                            setSelectedControllablePaletteColorField(nextField);

                            if (nextField === activeControllablePaletteGroupField.value) {
                              const nextGroupField =
                                CONTROLLABLE_PALETTE_FIELDS.find(
                                  (option) => option.value !== nextField
                                )?.value ?? nextField;

                              setSelectedControllablePaletteGroupField(nextGroupField);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="chart-footer chart-footer-match-labor">
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
                <CardHeader
                  title="SIF Incidents"
                  info={METRIC_INFO.sif}
                  tooltipLegend={sifTooltipLegend}
                  summaryValue={sifState.loading || sifState.error ? '--' : sifSummaryValue}
                  summaryAriaLabel="SIF incidents overall value"
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <div ref={sifChartHostRef} className="chart-host">
                      {sifState.loading && <p className="chart-message">Loading SIF data...</p>}

                      {!sifState.loading && sifState.error && (
                        <p className="chart-message chart-message-error">{sifState.error}</p>
                      )}

                      {!sifState.loading &&
                        !sifState.error &&
                        (baseFilteredSifRows.length === 0
                          || (isSifPareto
                            ? sifParetoChartData.labels.length === 0
                            : isSifPalette
                              ? sifPaletteChartData.labels.length === 0
                              : globallyFilteredSifRows.length === 0)) && (
                          <p className="chart-message">
                            {sifState.rows.length === 0
                              ? 'No Defense SIF rows are available for charting.'
                              : filteredSifRows.length === 0 && !isSifPareto && !isSifPalette
                                ? 'No Defense SIF rows match the selected filters.'
                                : 'No Defense SIF rows fall within the selected date range.'}
                          </p>
                        )}

                      {!sifState.loading &&
                        !sifState.error &&
                        (isSifPareto
                          ? sifParetoChartData.labels.length > 0
                          : isSifPalette
                            ? sifPaletteChartData.labels.length > 0
                            : sifChartData.length > 0) &&
                        sifChartWidth > 0 && (
                          isSifPareto ? (
                            <ParetoMetricChart
                              width={sifChartWidth}
                              height={INCIDENT_CHART_HEIGHT}
                              margin={INCIDENT_CHART_MARGIN}
                              labels={sifParetoChartData.labels}
                              values={sifParetoChartData.values}
                              cumulativeShares={sifParetoChartData.cumulativeShares}
                              barLabel="SIF Incidents"
                              barColor="var(--chart-line)"
                              barAxis={SIF_Y_AXIS}
                              barValueFormatter={formatIncidentCount}
                              goalLine={sifGoalLine}
                              sx={sharedChartSx}
                            />
                          ) : isSifPalette ? (
                            <StackedCategoryBarChart
                              width={sifChartWidth}
                              height={INCIDENT_CHART_HEIGHT}
                              margin={INCIDENT_CHART_MARGIN}
                              labels={sifPaletteChartData.labels}
                              yAxis={SIF_Y_AXIS}
                              series={sifPaletteChartData.series.map((seriesItem) => ({
                                ...seriesItem,
                                valueFormatter: formatIncidentCount
                              }))}
                              sx={sharedChartSx}
                            />
                          ) : (
                            <MetricTrendChart
                              variant={chartVariants.sif === 'bar' ? 'bar' : 'line'}
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
                              goalLine={sifGoalLine}
                              sx={sharedChartSx}
                            />
                          )
                        )}
                    </div>

                    <div className="chart-control-row chart-control-row-single">
                      <div className="chart-control-row-toggle">
                        <ChartTypeToggle
                          value={chartVariants.sif}
                          onChange={(nextVariant) => {
                            setChartVariants((currentValue) => ({
                              ...currentValue,
                              sif: nextVariant
                            }));
                          }}
                          alwaysGridToggle
                          supportsFilter
                          supportsPalette
                          supportsPareto
                          filterToggleAriaLabel="SIF incidents filtered time series"
                          filterFieldValue={activeSifChartFilterField.value}
                          filterFieldOptions={SAFETY_CHART_FILTER_FIELDS}
                          paretoFieldOptions={SAFETY_PARETO_FILTER_FIELDS}
                          filterFieldAriaLabel="Select SIF filter field"
                          onFilterFieldChange={(nextField) => {
                            setSelectedSifChartFilterField(nextField);
                            setSelectedSifChartFilterValue(ALL_FILTER_VALUE);
                          }}
                          filterValue={activeSifChartFilterValue}
                          filterValueOptions={sifChartFilterValueOptions}
                          filterValueAllLabel={activeSifChartFilterField.allLabel}
                          filterValueAriaLabel="Select SIF filter value"
                          onFilterValueChange={setSelectedSifChartFilterValue}
                          paletteToggleAriaLabel="SIF incidents grouped palette chart"
                          paletteGroupFieldValue={activeSifPaletteGroupField.value}
                          paletteGroupFieldOptions={sifPaletteGroupFieldOptions}
                          paletteGroupFieldAriaLabel="Select SIF group field"
                          onPaletteGroupFieldChange={(nextField) => {
                            setSelectedSifPaletteGroupField(nextField);

                            if (nextField === activeSifPaletteColorField.value) {
                              const nextColorField =
                                SAFETY_PALETTE_FIELDS.find((option) => option.value !== nextField)?.value
                                ?? nextField;

                              setSelectedSifPaletteColorField(nextColorField);
                            }
                          }}
                          paletteColorFieldValue={activeSifPaletteColorField.value}
                          paletteColorFieldOptions={sifPaletteColorFieldOptions}
                          paletteColorFieldAriaLabel="Select SIF color field"
                          onPaletteColorFieldChange={(nextField) => {
                            setSelectedSifPaletteColorField(nextField);

                            if (nextField === activeSifPaletteGroupField.value) {
                              const nextGroupField =
                                SAFETY_PALETTE_FIELDS.find((option) => option.value !== nextField)?.value
                                ?? nextField;

                              setSelectedSifPaletteGroupField(nextGroupField);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="chart-footer chart-footer-match-labor">
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
                  tooltipLegend={potentialSifTooltipLegend}
                  summaryValue={
                    potentialSifState.loading || potentialSifState.error
                      ? '--'
                      : potentialSifSummaryValue
                  }
                  summaryAriaLabel="Potential SIF incidents overall value"
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
                        (baseFilteredPotentialSifRows.length === 0
                          || (isPotentialSifPareto
                            ? potentialSifParetoChartData.labels.length === 0
                            : isPotentialSifPalette
                              ? potentialSifPaletteChartData.labels.length === 0
                              : globallyFilteredPotentialSifRows.length === 0)) && (
                          <p className="chart-message">
                            {potentialSifState.rows.length === 0
                              ? 'No Defense potential SIF rows are available for charting.'
                              : filteredPotentialSifRows.length === 0 && !isPotentialSifPareto && !isPotentialSifPalette
                                ? 'No Defense potential SIF rows match the selected filters.'
                                : 'No Defense potential SIF rows fall within the selected date range.'}
                          </p>
                        )}

                      {!potentialSifState.loading &&
                        !potentialSifState.error &&
                        (isPotentialSifPareto
                          ? potentialSifParetoChartData.labels.length > 0
                          : isPotentialSifPalette
                            ? potentialSifPaletteChartData.labels.length > 0
                            : potentialSifChartData.length > 0) &&
                        potentialSifChartWidth > 0 && (
                          isPotentialSifPareto ? (
                            <ParetoMetricChart
                              width={potentialSifChartWidth}
                              height={INCIDENT_CHART_HEIGHT}
                              margin={INCIDENT_CHART_MARGIN}
                              labels={potentialSifParetoChartData.labels}
                              values={potentialSifParetoChartData.values}
                              cumulativeShares={potentialSifParetoChartData.cumulativeShares}
                              barLabel="Potential SIF Incidents"
                              barColor="var(--chart-line)"
                              barAxis={SIF_Y_AXIS}
                              barValueFormatter={formatIncidentCount}
                              goalLine={potentialSifGoalLine}
                              sx={sharedChartSx}
                            />
                          ) : isPotentialSifPalette ? (
                            <StackedCategoryBarChart
                              width={potentialSifChartWidth}
                              height={INCIDENT_CHART_HEIGHT}
                              margin={INCIDENT_CHART_MARGIN}
                              labels={potentialSifPaletteChartData.labels}
                              yAxis={SIF_Y_AXIS}
                              series={potentialSifPaletteChartData.series.map((seriesItem) => ({
                                ...seriesItem,
                                valueFormatter: formatIncidentCount
                              }))}
                              sx={sharedChartSx}
                            />
                          ) : (
                            <MetricTrendChart
                              variant={chartVariants.potentialSif === 'bar' ? 'bar' : 'line'}
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
                              goalLine={potentialSifGoalLine}
                              sx={sharedChartSx}
                            />
                          )
                        )}
                    </div>

                    <div className="chart-control-row chart-control-row-single">
                      <div className="chart-control-row-toggle">
                        <ChartTypeToggle
                          value={chartVariants.potentialSif}
                          onChange={(nextVariant) => {
                            setChartVariants((currentValue) => ({
                              ...currentValue,
                              potentialSif: nextVariant
                            }));
                          }}
                          alwaysGridToggle
                          supportsFilter
                          supportsPalette
                          supportsPareto
                          filterToggleAriaLabel="Potential SIF incidents filtered time series"
                          filterFieldValue={activePotentialSifChartFilterField.value}
                          filterFieldOptions={SAFETY_CHART_FILTER_FIELDS}
                          paretoFieldOptions={SAFETY_PARETO_FILTER_FIELDS}
                          filterFieldAriaLabel="Select potential SIF filter field"
                          onFilterFieldChange={(nextField) => {
                            setSelectedPotentialSifChartFilterField(nextField);
                            setSelectedPotentialSifChartFilterValue(ALL_FILTER_VALUE);
                          }}
                          filterValue={activePotentialSifChartFilterValue}
                          filterValueOptions={potentialSifChartFilterValueOptions}
                          filterValueAllLabel={activePotentialSifChartFilterField.allLabel}
                          filterValueAriaLabel="Select potential SIF filter value"
                          onFilterValueChange={setSelectedPotentialSifChartFilterValue}
                          paletteToggleAriaLabel="Potential SIF incidents grouped palette chart"
                          paletteGroupFieldValue={activePotentialSifPaletteGroupField.value}
                          paletteGroupFieldOptions={potentialSifPaletteGroupFieldOptions}
                          paletteGroupFieldAriaLabel="Select potential SIF group field"
                          onPaletteGroupFieldChange={(nextField) => {
                            setSelectedPotentialSifPaletteGroupField(nextField);

                            if (nextField === activePotentialSifPaletteColorField.value) {
                              const nextColorField =
                                SAFETY_PALETTE_FIELDS.find((option) => option.value !== nextField)?.value
                                ?? nextField;

                              setSelectedPotentialSifPaletteColorField(nextColorField);
                            }
                          }}
                          paletteColorFieldValue={activePotentialSifPaletteColorField.value}
                          paletteColorFieldOptions={potentialSifPaletteColorFieldOptions}
                          paletteColorFieldAriaLabel="Select potential SIF color field"
                          onPaletteColorFieldChange={(nextField) => {
                            setSelectedPotentialSifPaletteColorField(nextField);

                            if (nextField === activePotentialSifPaletteGroupField.value) {
                              const nextGroupField =
                                SAFETY_PALETTE_FIELDS.find((option) => option.value !== nextField)?.value
                                ?? nextField;

                              setSelectedPotentialSifPaletteGroupField(nextGroupField);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="chart-footer chart-footer-match-labor">
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
                  tooltipLegend={nmfrTooltipLegend}
                  summaryValue={nmfrState.loading || nmfrState.error ? '--' : nmfrSummaryValue}
                  summaryAriaLabel="Near miss frequency rate overall value"
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <div ref={nmfrChartHostRef} className="chart-host">
                      {nmfrState.loading && <p className="chart-message">Loading NMFR data...</p>}

                      {!nmfrState.loading && nmfrState.error && (
                        <p className="chart-message chart-message-error">{nmfrState.error}</p>
                      )}

                      {!nmfrState.loading &&
                        !nmfrState.error &&
                        (baseFilteredNmfrRows.length === 0
                          || (isNmfrPareto
                            ? nmfrParetoChartData.labels.length === 0
                            : isNmfrPalette
                              ? nmfrPaletteChartData.labels.length === 0
                              : globallyFilteredNmfrRows.length === 0)) && (
                          <p className="chart-message">
                            {nmfrState.rows.length === 0
                              ? 'No Defense NMFR rows are available for charting.'
                              : filteredNmfrRows.length === 0 && !isNmfrPareto && !isNmfrPalette
                                ? 'No Defense NMFR rows match the selected filters.'
                                : 'No Defense NMFR rows fall within the selected date range.'}
                          </p>
                        )}

                      {!nmfrState.loading &&
                        !nmfrState.error &&
                        (isNmfrPareto
                          ? nmfrParetoChartData.labels.length > 0
                          : isNmfrPalette
                            ? nmfrPaletteChartData.labels.length > 0
                            : nmfrChartData.length > 0) &&
                        nmfrChartWidth > 0 && (
                          isNmfrPareto ? (
                            <ParetoMetricChart
                              width={nmfrChartWidth}
                              height={INCIDENT_CHART_HEIGHT}
                              margin={INCIDENT_CHART_MARGIN}
                              labels={nmfrParetoChartData.labels}
                              values={nmfrParetoChartData.values}
                              cumulativeShares={nmfrParetoChartData.cumulativeShares}
                              barLabel="Near Miss Frequency Rate"
                              barColor="var(--chart-line)"
                              barAxis={NMFR_Y_AXIS}
                              barValueFormatter={formatNumber}
                              goalLine={nmfrGoalLine}
                              sx={sharedChartSx}
                            />
                          ) : isNmfrPalette ? (
                            <StackedCategoryBarChart
                              width={nmfrChartWidth}
                              height={INCIDENT_CHART_HEIGHT}
                              margin={INCIDENT_CHART_MARGIN}
                              labels={nmfrPaletteChartData.labels}
                              yAxis={NMFR_Y_AXIS}
                              series={nmfrPaletteChartData.series.map((seriesItem) => ({
                                ...seriesItem,
                                valueFormatter: formatNumber
                              }))}
                              sx={sharedChartSx}
                            />
                          ) : (
                            <MetricTrendChart
                              variant={chartVariants.nmfr === 'bar' ? 'bar' : 'line'}
                              width={nmfrChartWidth}
                              height={INCIDENT_CHART_HEIGHT}
                              hideLegend
                              margin={INCIDENT_CHART_MARGIN}
                              labels={nmfrChartData.map((bucket) => bucket.label)}
                              xAxisHeight={INCIDENT_X_AXIS_HEIGHT}
                              yAxis={nmfrChartYAxis}
                              series={[
                                {
                                  data: nmfrChartData.map((bucket) => bucket.total),
                                  label: 'Near Miss Frequency Rate',
                                  color: 'var(--chart-line)',
                                  valueFormatter: formatNumber,
                                  showMark: false
                                }
                              ]}
                              goalLine={visibleNmfrGoalLine}
                              sx={sharedChartSx}
                            />
                          )
                        )}
                    </div>

                    <div className="chart-control-row chart-control-row-single">
                      <div className="chart-control-row-toggle">
                        <ChartTypeToggle
                          value={chartVariants.nmfr}
                          onChange={(nextVariant) => {
                            setChartVariants((currentValue) => ({
                              ...currentValue,
                              nmfr: nextVariant
                            }));
                          }}
                          alwaysGridToggle
                          supportsFilter
                          supportsPalette
                          supportsPareto
                          filterToggleAriaLabel="Near miss frequency rate filtered time series"
                          filterFieldValue={activeNmfrChartFilterField.value}
                          filterFieldOptions={SAFETY_CHART_FILTER_FIELDS}
                          paretoFieldOptions={SAFETY_PARETO_FILTER_FIELDS}
                          filterFieldAriaLabel="Select NMFR filter field"
                          onFilterFieldChange={(nextField) => {
                            setSelectedNmfrChartFilterField(nextField);
                            setSelectedNmfrChartFilterValue(ALL_FILTER_VALUE);
                          }}
                          filterValue={activeNmfrChartFilterValue}
                          filterValueOptions={nmfrChartFilterValueOptions}
                          filterValueAllLabel={activeNmfrChartFilterField.allLabel}
                          filterValueAriaLabel="Select NMFR filter value"
                          onFilterValueChange={setSelectedNmfrChartFilterValue}
                          paletteToggleAriaLabel="Near miss frequency rate grouped palette chart"
                          paletteGroupFieldValue={activeNmfrPaletteGroupField.value}
                          paletteGroupFieldOptions={nmfrPaletteGroupFieldOptions}
                          paletteGroupFieldAriaLabel="Select NMFR group field"
                          onPaletteGroupFieldChange={(nextField) => {
                            setSelectedNmfrPaletteGroupField(nextField);

                            if (nextField === activeNmfrPaletteColorField.value) {
                              const nextColorField =
                                SAFETY_PALETTE_FIELDS.find((option) => option.value !== nextField)?.value
                                ?? nextField;

                              setSelectedNmfrPaletteColorField(nextColorField);
                            }
                          }}
                          paletteColorFieldValue={activeNmfrPaletteColorField.value}
                          paletteColorFieldOptions={nmfrPaletteColorFieldOptions}
                          paletteColorFieldAriaLabel="Select NMFR color field"
                          onPaletteColorFieldChange={(nextField) => {
                            setSelectedNmfrPaletteColorField(nextField);

                            if (nextField === activeNmfrPaletteGroupField.value) {
                              const nextGroupField =
                                SAFETY_PALETTE_FIELDS.find((option) => option.value !== nextField)?.value
                                ?? nextField;

                              setSelectedNmfrPaletteGroupField(nextGroupField);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="chart-footer chart-footer-match-labor">
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
                  tooltipLegend={otdTooltipLegend}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <div ref={otdChartHostRef} className="chart-host">
                      {otdState.loading && <p className="chart-message">Loading OTD data...</p>}

                      {!otdState.loading && otdState.error && (
                        <p className="chart-message chart-message-error">{otdState.error}</p>
                      )}

                      {!otdState.loading &&
                        !otdState.error &&
                        (baseFilteredOtdRows.length === 0 ||
                          (isOtdPareto
                            ? otdParetoChartData.labels.length === 0
                            : isOtdPalette
                              ? otdPaletteChartData.labels.length === 0
                              : otdChartData.labels.length === 0)) && (
                          <p className="chart-message">
                            {otdState.rows.length === 0
                              ? 'No OTD rows are available for charting.'
                              : filteredOtdRows.length === 0 && otdFilterApplies
                                ? 'No OTD rows match the selected filters.'
                                : 'No OTD months fall within the selected date range.'}
                          </p>
                        )}

                      {!otdState.loading &&
                        !otdState.error &&
                        (isOtdPareto
                          ? otdParetoChartData.labels.length > 0
                          : isOtdPalette
                            ? otdPaletteChartData.labels.length > 0
                            : otdChartData.labels.length > 0) &&
                        otdChartWidth > 0 && (
                          isOtdPareto ? (
                            <ParetoMetricChart
                              width={otdChartWidth}
                              height={CHART_HEIGHT}
                              margin={DEFAULT_CHART_MARGIN}
                              labels={otdParetoChartData.labels}
                              values={otdParetoChartData.values}
                              cumulativeShares={otdParetoChartData.cumulativeShares}
                              barLabel="Actuals Delivered"
                              barColor="var(--chart-line)"
                              barAxis={OTD_Y_AXIS}
                              barValueFormatter={formatUnits}
                              goalLine={otdGoalLine}
                              sx={sharedChartSx}
                            />
                          ) : isOtdPalette ? (
                            <StackedCategoryBarChart
                              width={otdChartWidth}
                              height={CHART_HEIGHT}
                              margin={DEFAULT_CHART_MARGIN}
                              labels={otdPaletteChartData.labels}
                              yAxis={OTD_Y_AXIS}
                              series={otdPaletteChartData.series.map((seriesItem) => ({
                                ...seriesItem,
                                valueFormatter: formatUnits
                              }))}
                              sx={sharedChartSx}
                            />
                          ) : (
                            <MetricTrendChart
                              variant={chartVariants.otd === 'bar' ? 'bar' : 'line'}
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
                              tooltipProps={{
                                bucketLabelLookup: otdChartData.tooltipLabelLookup
                              }}
                              goalLine={otdGoalLine}
                              sx={sharedChartSx}
                            />
                          )
                        )}
                    </div>

                    <div className="chart-control-row chart-control-row-single">
                      <div className="chart-control-row-toggle">
                        <ChartTypeToggle
                          value={chartVariants.otd}
                          onChange={(nextVariant) => {
                            if (nextVariant === 'pareto') {
                              setSelectedOtdChartFilterField(OTD_PARETO_FILTER_FIELDS[0].value);
                            }

                            setChartVariants((currentValue) => ({
                              ...currentValue,
                              otd: nextVariant
                            }));
                          }}
                          alwaysGridToggle
                          supportsFilter
                          supportsPalette
                          supportsPareto
                          filterToggleAriaLabel="OTD time series"
                          filterFieldValue={activeOtdChartFilterField.value}
                          filterFieldOptions={OTD_CHART_FILTER_FIELDS}
                          paretoFieldOptions={OTD_PARETO_FILTER_FIELDS}
                          filterFieldAriaLabel="Select OTD filter field"
                          onFilterFieldChange={(nextField) => {
                            setSelectedOtdChartFilterField(nextField);
                            setSelectedOtdChartFilterValue(ALL_FILTER_VALUE);
                          }}
                          filterValue={activeOtdChartFilterValue}
                          filterValueOptions={otdChartFilterValueOptions}
                          filterValueAllLabel={activeOtdChartFilterField.allLabel}
                          filterValueAriaLabel="Select OTD filter value"
                          onFilterValueChange={setSelectedOtdChartFilterValue}
                          paletteToggleAriaLabel="OTD grouped palette chart"
                          paletteGroupFieldValue={activeOtdPaletteGroupField.value}
                          paletteGroupFieldOptions={otdPaletteGroupFieldOptions}
                          paletteGroupFieldAriaLabel="Select OTD group field"
                          onPaletteGroupFieldChange={(nextField) => {
                            setSelectedOtdPaletteGroupField(nextField);

                            if (nextField === activeOtdPaletteColorField.value) {
                              const nextColorField =
                                OTD_PALETTE_FIELDS.find((option) => option.value !== nextField)?.value
                                ?? nextField;

                              setSelectedOtdPaletteColorField(nextColorField);
                            }
                          }}
                          paletteColorFieldValue={activeOtdPaletteColorField.value}
                          paletteColorFieldOptions={otdPaletteColorFieldOptions}
                          paletteColorFieldAriaLabel="Select OTD color field"
                          onPaletteColorFieldChange={(nextField) => {
                            setSelectedOtdPaletteColorField(nextField);

                            if (nextField === activeOtdPaletteGroupField.value) {
                              const nextGroupField =
                                OTD_PALETTE_FIELDS.find((option) => option.value !== nextField)?.value
                                ?? nextField;

                              setSelectedOtdPaletteGroupField(nextGroupField);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="chart-footer chart-footer-match-labor">
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
                  tooltipLegend={laborTooltipLegend}
                />

                <div className="dashboard-grid">
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
                        (laborState.rows.length === 0
                          || (isLaborPareto
                            ? laborParetoChartData.labels.length === 0
                            : isLaborPalette
                              ? laborPaletteChartData.labels.length === 0
                              : filteredLaborRows.length === 0 || laborChartData.labels.length === 0)) && (
                          <p className="chart-message">
                            {laborState.rows.length === 0
                              ? 'No labor rows are available for charting.'
                              : filteredLaborRows.length === 0 && laborFilterApplies
                                ? 'No labor rows match the selected filters.'
                                : 'No labor months fall within the selected date range.'}
                          </p>
                        )}

                      {!laborState.loading &&
                        !laborState.error &&
                        (isLaborPareto
                          ? laborParetoChartData.labels.length > 0
                          : isLaborPalette
                            ? laborPaletteChartData.labels.length > 0
                            : laborChartData.labels.length > 0) &&
                        laborChartWidth > 0 && (
                          isLaborPareto ? (
                            <ParetoMetricChart
                              width={laborChartWidth}
                              height={CHART_HEIGHT}
                              margin={LABOR_CHART_MARGIN}
                              labels={laborParetoChartData.labels}
                              values={laborParetoChartData.values}
                              cumulativeShares={laborParetoChartData.cumulativeShares}
                              barLabel="Direct hours"
                              barColor="var(--chart-line)"
                              barAxis={LABOR_HOURS_Y_AXIS}
                              barValueFormatter={formatHours}
                              goalLine={laborGoalLine}
                              sx={sharedChartSx}
                            />
                          ) : isLaborPalette ? (
                            <StackedCategoryBarChart
                              width={laborChartWidth}
                              height={CHART_HEIGHT}
                              margin={LABOR_CHART_MARGIN}
                              labels={laborPaletteChartData.labels}
                              yAxis={LABOR_HOURS_Y_AXIS}
                              series={laborPaletteChartData.series.map((seriesItem) => ({
                                ...seriesItem,
                                valueFormatter: formatHours
                              }))}
                              sx={sharedChartSx}
                            />
                          ) : (
                            <>
                              <span className="chart-axis-unit-label">Direct %</span>
                              <MetricTrendChart
                                variant={chartVariants.labor === 'bar' ? 'bar' : 'line'}
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
                                goalLine={laborGoalLine}
                              />
                            </>
                          )
                        )}
                    </div>

                    <div className="chart-control-row chart-control-row-single">
                      <div className="chart-control-row-toggle">
                        <ChartTypeToggle
                          value={chartVariants.labor}
                          onChange={(nextVariant) => {
                            if (nextVariant === 'pareto') {
                              setSelectedLaborChartFilterField(LABOR_PARETO_FILTER_FIELDS[0].value);
                            }

                            setChartVariants((currentValue) => ({
                              ...currentValue,
                              labor: nextVariant
                            }));
                          }}
                          alwaysGridToggle
                          supportsFilter
                          supportsPalette
                          supportsPareto
                          filterToggleAriaLabel="Filter labor chart"
                          filterFieldValue={activeLaborChartFilterField.value}
                          filterFieldOptions={LABOR_CHART_FILTER_FIELDS}
                          paretoFieldOptions={LABOR_PARETO_FILTER_FIELDS}
                          filterFieldAriaLabel="Select labor filter field"
                          onFilterFieldChange={(nextField) => {
                            setSelectedLaborChartFilterField(nextField);
                            setSelectedLaborChartFilterValue(ALL_FILTER_VALUE);
                          }}
                          filterValue={activeLaborChartFilterValue}
                          filterValueOptions={laborChartFilterValueOptions}
                          filterValueAllLabel={activeLaborChartFilterField.allLabel}
                          filterValueAriaLabel="Select labor filter value"
                          onFilterValueChange={setSelectedLaborChartFilterValue}
                          paletteToggleAriaLabel="Labor grouped palette chart"
                          paletteGroupFieldValue={activeLaborPaletteGroupField.value}
                          paletteGroupFieldOptions={laborPaletteGroupFieldOptions}
                          paletteGroupFieldAriaLabel="Select labor group field"
                          onPaletteGroupFieldChange={(nextField) => {
                            setSelectedLaborPaletteGroupField(nextField);

                            if (nextField === activeLaborPaletteColorField.value) {
                              const nextColorField =
                                LABOR_PALETTE_FIELDS.find((option) => option.value !== nextField)?.value
                                ?? nextField;

                              setSelectedLaborPaletteColorField(nextColorField);
                            }
                          }}
                          paletteColorFieldValue={activeLaborPaletteColorField.value}
                          paletteColorFieldOptions={laborPaletteColorFieldOptions}
                          paletteColorFieldAriaLabel="Select labor color field"
                          onPaletteColorFieldChange={(nextField) => {
                            setSelectedLaborPaletteColorField(nextField);

                            if (nextField === activeLaborPaletteGroupField.value) {
                              const nextGroupField =
                                LABOR_PALETTE_FIELDS.find((option) => option.value !== nextField)?.value
                                ?? nextField;

                              setSelectedLaborPaletteGroupField(nextGroupField);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="chart-footer chart-footer-match-labor">
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
        </section>
      </div>
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

const inlineChartFilterSelectStyles = {
  minWidth: 0,
  '& .MuiOutlinedInput-root': {
    minHeight: 32,
    borderRadius: '999px',
    fontSize: '0.75rem',
    color: 'var(--input-text)',
    backgroundColor: 'var(--input-bg)'
  },
  '& .MuiSelect-select': {
    minWidth: 0,
    padding: '6px 28px 6px 10px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
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
    fontSize: '0.95rem'
  }
};
