import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faAsterisk,
  faCalculator,
  faChartColumn,
  faChartLine,
  faClipboardCheck,
  faEllipsis,
  faFilter,
  faMoon,
  faSeedling,
  faSun
} from '@fortawesome/free-solid-svg-icons';
import {
  Autocomplete,
  Checkbox,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Slider,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import ReactSelect from 'react-select';
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
import {
  CALCULATED_GOAL_MIN_OBSERVATIONS,
  forecastControllableCostsGoalLineFromSeries,
  forecastIncidentGoalLineFromSeries,
  forecastLaborHanaGoalLineFromSeries,
  forecastLaborGoalLineFromSeries,
  forecastNmfrGoalLineFromSeries,
  forecastOtdGoalLineFromSeries,
} from './arimaGoalLines';
import {
  buildControllableCostsMetricInfo,
  buildLaborMetricInfo,
  buildLaborHanaMetricInfo,
  buildNmfrMetricInfo,
  buildOtdMetricInfo,
  DEFAULT_METRIC_INFO,
  METRIC_INFO,
  parseMetricInfoInlineText
} from './metricInfo';
import { getMetricGoalLine } from './metricGoals';
import { SITE_BRANDING } from './siteBranding';

const ALL_FILTER_VALUE = '__all__';
const PALETTE_MAX_GROUPS = 20;
const MAX_TOOLTIP_ITEMS = 20;
const MAX_TOOLTIP_LABEL_LENGTH = 20;
const PALETTE_INFO_TOAST_SESSION_KEY = 'westmarch-palette-info-toast-shown';
const AUTHENTICATION_EXPIRED_ERROR = 'authentication_expired';
const AUTHENTICATION_RETRY_SESSION_KEY = 'qmi-authentication-reauthentication-attempted';
const AUTHENTICATION_RETRY_QUERY_PARAMETER = 'qmi_reauthentication_attempted';
const NG_TOAST_BLUE = '#0057b8';
const SCORECARD_START_STAMP = Date.UTC(2025, 0, 1);
const scorecardCurrentDate = new Date();
const SCORECARD_END_STAMP = Date.UTC(
  scorecardCurrentDate.getUTCFullYear(),
  scorecardCurrentDate.getUTCMonth(),
  1
);
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

const CONTROLLABLE_COSTS_HANA_VIEW_CONFIG = {
  monthly: {
    label: 'Monthly'
  },
  ...CONTROLLABLE_COSTS_VIEW_CONFIG
};
const CONTROLLABLE_COSTS_NEW_VIEW_CONFIG = CONTROLLABLE_COSTS_HANA_VIEW_CONFIG;

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

const CONTROLLABLE_NEW_CHART_FILTER_FIELDS = [
  {
    value: 'division',
    label: 'Division',
    allLabel: 'All divisions'
  },
  {
    value: 'business_unit',
    label: 'Business Unit',
    allLabel: 'All business units'
  },
  {
    value: 'facility',
    label: 'Facility',
    allLabel: 'All facilities'
  },
  {
    value: 'cost_category',
    label: 'Cost category',
    allLabel: 'All cost categories'
  },
  {
    value: 'cost_element',
    label: 'GL account / cost element',
    allLabel: 'All GL accounts / cost elements'
  },
  {
    value: 'cost_element_description',
    label: 'Description',
    allLabel: 'All descriptions'
  }
];
const CONTROLLABLE_NEW_PALETTE_FIELDS = [
  ...CONTROLLABLE_NEW_CHART_FILTER_FIELDS.map(({ value, label }) => ({ value, label })),
  {
    value: 'controllable',
    label: 'Controllability'
  }
];
const CONTROLLABLE_NEW_PARETO_FILTER_FIELDS = CONTROLLABLE_NEW_CHART_FILTER_FIELDS;

const CONTROLLABLE_HANA_CHART_FILTER_FIELDS = [
  {
    value: 'sector',
    label: 'Sector',
    allLabel: 'All sectors'
  },
  {
    value: 'division',
    label: 'Division',
    allLabel: 'All divisions'
  },
  {
    value: 'business_unit',
    label: 'Business Unit',
    allLabel: 'All business units'
  },
  {
    value: 'facility',
    label: 'Facility',
    allLabel: 'All facilities'
  }
];

const CONTROLLABLE_HANA_PALETTE_FIELDS = CONTROLLABLE_HANA_CHART_FILTER_FIELDS.map(
  ({ value, label }) => ({ value, label })
);
const CONTROLLABLE_HANA_PARETO_FILTER_FIELDS = CONTROLLABLE_HANA_CHART_FILTER_FIELDS;

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

const LABOR_HANA_CHART_FILTER_FIELDS = [
  {
    value: 'division',
    label: 'Division',
    allLabel: 'All divisions'
  },
  {
    value: 'business_unit',
    label: 'Business Unit',
    allLabel: 'All business units'
  },
  {
    value: 'forecasted_cc',
    label: 'Facility',
    allLabel: 'All facilities'
  }
];
const LABOR_HANA_PALETTE_FIELDS = LABOR_HANA_CHART_FILTER_FIELDS.map((option) => ({
  value: option.value,
  label: option.label
}));
const LABOR_HANA_PARETO_FILTER_FIELDS = [LABOR_HANA_CHART_FILTER_FIELDS[2]];

const LABOR_NEW_CHART_FILTER_FIELDS = [
  {
    value: 'division',
    label: 'Division',
    allLabel: 'All divisions'
  },
  {
    value: 'business_unit',
    label: 'Business Unit',
    allLabel: 'All business units'
  },
  {
    value: 'facility',
    label: 'Facility',
    allLabel: 'All facilities'
  }
];
const LABOR_NEW_PALETTE_FIELDS = LABOR_NEW_CHART_FILTER_FIELDS.map((option) => ({
  value: option.value,
  label: option.label
}));
const LABOR_NEW_PARETO_FILTER_FIELDS = [LABOR_NEW_CHART_FILTER_FIELDS[2]];

const GLOBAL_FILTER_DIMENSIONS = [
  {
    key: 'division',
    label: 'Division',
    allLabel: 'All divisions'
  },
  {
    key: 'businessUnit',
    label: 'Business Unit',
    allLabel: 'All business units'
  },
  {
    key: 'facility',
    label: 'Facility',
    allLabel: 'All facilities'
  }
];

const GLOBAL_FILTER_FIELD_MAP = {
  controllableCosts: {
    facility: 'address'
  },
  controllableCostsNew: {
    division: 'division',
    businessUnit: 'business_unit',
    facility: 'facility'
  },
  controllableCostsHana: {
    division: 'division',
    businessUnit: 'business_unit',
    facility: 'facility'
  },
  sif: {
    division: 'division',
    facility: 'site'
  },
  potentialSif: {
    division: 'division',
    facility: 'site'
  },
  nmfr: {
    division: 'division',
    facility: 'site'
  },
  otd: {
    businessUnit: 'bu',
    facility: 'site'
  },
  labor: {
    facility: 'forecasted_cc'
  },
  laborNew: {
    division: 'division',
    businessUnit: 'business_unit',
    facility: 'facility'
  },
  laborHana: {
    division: 'division',
    businessUnit: 'business_unit',
    facility: 'forecasted_cc'
  }
};

const CONTROLLABLE_PARETO_FILTER_FIELDS = [CONTROLLABLE_CHART_FILTER_FIELDS[0]];
const CONTROLLABLE_COSTS_HANA_CARD_ENABLED = false;
const LABOR_HANA_CARD_ENABLED = false;

const CARD_CHIP_OPTIONS = [
  {
    key: 'all',
    label: 'All',
    icon: faAsterisk,
    cardKeys: [
      'controllableCosts',
      'controllableCostsNew',
      ...(CONTROLLABLE_COSTS_HANA_CARD_ENABLED ? ['controllableCostsHana'] : []),
      'sif',
      'potentialSif',
      'nmfr',
      'otd',
      'labor',
      'laborNew',
      ...(LABOR_HANA_CARD_ENABLED ? ['laborHana'] : [])
    ]
  },
  {
    key: 'businessManagement',
    label: 'Business Management',
    icon: faCalculator,
    cardKeys: [
      'controllableCosts',
      'controllableCostsNew',
      ...(CONTROLLABLE_COSTS_HANA_CARD_ENABLED ? ['controllableCostsHana'] : []),
      'labor',
      'laborNew',
      ...(LABOR_HANA_CARD_ENABLED ? ['laborHana'] : [])
    ]
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
  controllableCostsNew: 'line',
  controllableCostsHana: 'line',
  sif: 'line',
  potentialSif: 'line',
  nmfr: 'line',
  otd: 'line',
  labor: 'line',
  laborNew: 'line',
  laborHana: 'line'
};
const CARD_VARIANT_OPTIONS_BY_METRIC = {
  controllableCosts: ['line', 'bar', 'palette', 'pareto'],
  controllableCostsNew: ['line', 'bar', 'palette', 'pareto'],
  controllableCostsHana: ['line', 'bar', 'palette', 'pareto'],
  sif: ['line', 'bar', 'palette', 'pareto'],
  potentialSif: ['line', 'bar', 'palette', 'pareto'],
  nmfr: ['line', 'bar', 'palette', 'pareto'],
  otd: ['line', 'bar', 'palette', 'pareto'],
  labor: ['line', 'bar', 'palette', 'pareto'],
  laborNew: ['line', 'bar', 'palette', 'pareto'],
  laborHana: ['line', 'bar', 'palette', 'pareto']
};
const PRESET_SLOT_OPTIONS = [1, 2, 3];
const CONTROLLABLE_PALETTE_COLORS = [
  'var(--chart-palette-1)',
  'var(--chart-palette-2)',
  'var(--chart-palette-3)',
  'var(--chart-palette-4)',
  'var(--chart-palette-5)',
  'var(--chart-palette-6)',
  'var(--chart-palette-7)',
  'var(--chart-palette-8)',
  'var(--chart-palette-9)',
  'var(--chart-palette-10)',
  'var(--chart-palette-11)',
  'var(--chart-palette-12)',
  'var(--chart-palette-13)',
  'var(--chart-palette-14)',
  'var(--chart-palette-15)',
  'var(--chart-palette-16)',
  'var(--chart-palette-17)',
  'var(--chart-palette-18)',
  'var(--chart-palette-19)'
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
    bucketFormatter: (_month, index, year) => `Q${Math.floor(index / 3) + 1} ${year}`
  },
  yearly: {
    label: 'Annual',
    bucketSize: 12,
    bucketFormatter: (_month, _index, year) => String(year)
  }
};

const DEFAULT_CHART_MARGIN = { top: 12, right: 12, bottom: 4, left: 0 };
const INCIDENT_CHART_MARGIN = DEFAULT_CHART_MARGIN;
const LABOR_CHART_MARGIN = { top: 12, right: 12, bottom: 4, left: 0 };
const CHART_HEIGHT = 332;
const INCIDENT_CHART_HEIGHT = CHART_HEIGHT;
const INCIDENT_X_AXIS_HEIGHT = 28;
const Y_AXIS_WIDTH_STEPS = [28, 34, 40, 46, 52, 58, 64, 72, 80, 88];
const FIXED_MONTH_METRIC_YEAR = 2026;
const OTD_UNITS_Y_AXIS = [
  {
    width: 66,
    valueFormatter: formatCompactNumber,
    tickLabelStyle: { fontSize: 11 }
  }
];
const OTD_PERCENT_Y_AXIS = [
  {
    width: 52,
    valueFormatter: formatPercentAxis,
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
    label: 'Hours',
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
const overviewNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
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
    stroke: 'var(--chart-axis)'
  },
  '& .MuiChartsGrid-line': {
    stroke: 'var(--chart-grid)'
  },
  '& .MuiChartsAxis-tickLabel, & .MuiChartsAxis-label, & .MuiChartsLegend-label, & .MuiBarLabel-root': {
    fill: 'var(--chart-text)'
  }
};

const goalLineStyle = {
  stroke: 'var(--chart-annotation)',
  strokeDasharray: '6 4',
  strokeWidth: 1.5
};

const goalLabelStyle = {
  fill: 'var(--chart-annotation)',
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

function formatForecastValue(calculation, valueFormatter) {
  const forecastValue = Number(calculation?.goalLine?.expectedValue);

  return Number.isFinite(forecastValue) ? valueFormatter(forecastValue) : '--';
}

function formatPercentAxis(value) {
  return `${numberFormatter.format(Number(value ?? 0) * 100)}%`;
}

function formatOverviewCurrency(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '--';
  }

  const sign = numericValue < 0 ? '-' : '';
  return `${sign}$${overviewNumberFormatter.format(Math.abs(numericValue))}`;
}

function sumNumericValues(values) {
  return values.reduce((sum, value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? sum + numericValue : sum;
  }, 0);
}

function formatIncidentCount(value) {
  const numericValue = Number(value ?? 0);

  return Number.isInteger(numericValue)
    ? wholeNumberFormatter.format(numericValue)
    : numberFormatter.format(numericValue);
}

function formatCompactHoursAxis(value) {
  const numericValue = Number(value ?? 0);
  const formattedValue = Math.abs(numericValue) < 1000 && !Number.isInteger(numericValue)
    ? numberFormatter.format(numericValue)
    : formatCompactWholeNumber(numericValue);

  return `${formattedValue} hrs`;
}

function estimateAxisLabelWidth(label, fontSize) {
  return Array.from(String(label ?? '')).reduce((width, character) => {
    if (/[1.,:;|\s]/.test(character)) {
      return width + fontSize * 0.34;
    }

    if (/[$%MW@]/.test(character)) {
      return width + fontSize * 0.78;
    }

    if (/[-+()[\]]/.test(character)) {
      return width + fontSize * 0.46;
    }

    return width + fontSize * 0.59;
  }, 0);
}

function formatAxisTickSample(axisConfig, value) {
  try {
    if (typeof axisConfig.valueFormatter === 'function') {
      return axisConfig.valueFormatter(value, { location: 'tick' });
    }
  } catch {
    // Fall through to a stable numeric label when a formatter needs chart-only context.
  }

  return numberFormatter.format(value);
}

function getAdaptiveYAxisConfig(axisConfig, seriesCollections = []) {
  const numericValues = seriesCollections
    .flatMap((seriesValues) => (Array.isArray(seriesValues) ? seriesValues : []))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const configuredMin = Number(axisConfig.min);
  const configuredMax = Number(axisConfig.max);
  const minValue = Number.isFinite(configuredMin)
    ? configuredMin
    : numericValues.length > 0
      ? Math.min(...numericValues)
      : 0;
  const maxValue = Number.isFinite(configuredMax)
    ? configuredMax
    : numericValues.length > 0
      ? Math.max(...numericValues)
      : minValue;
  const range = maxValue - minValue;
  const sampleValues = range === 0
    ? [minValue]
    : Array.from({ length: 5 }, (_unused, index) => minValue + (range * index) / 4);

  if (minValue <= 0 && maxValue >= 0) {
    sampleValues.push(0);
  }

  const tickFontSize = Number(axisConfig.tickLabelStyle?.fontSize) || 11;
  const widestTickLabel = sampleValues.reduce((maxWidth, value) => {
    const label = formatAxisTickSample(axisConfig, value);
    return Math.max(maxWidth, estimateAxisLabelWidth(label, tickFontSize));
  }, 0);
  const titleAllowance = axisConfig.label ? 18 : 0;
  const requiredWidth = Math.ceil(widestTickLabel + 8 + titleAllowance);
  const width =
    Y_AXIS_WIDTH_STEPS.find((candidateWidth) => candidateWidth >= requiredWidth)
    ?? Y_AXIS_WIDTH_STEPS[Y_AXIS_WIDTH_STEPS.length - 1];

  return {
    ...axisConfig,
    width
  };
}

function getAdaptiveYAxis(axisConfigs, seriesCollections = []) {
  return axisConfigs.map((axisConfig) =>
    getAdaptiveYAxisConfig(axisConfig, seriesCollections)
  );
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

function coerceFilterValues(value) {
  const candidateValues = Array.isArray(value) ? value : [value];

  return Array.from(new Set(candidateValues.filter(
    (candidate) =>
      typeof candidate === 'string'
      && candidate.length > 0
      && candidate !== ALL_FILTER_VALUE
  )));
}

function normalizeFilterValues(value, options) {
  const optionSet = new Set(options);
  return coerceFilterValues(value).filter((candidate) => optionSet.has(candidate));
}

function rowMatchesFilterValues(rowValue, selectedValues) {
  return selectedValues.length === 0 || selectedValues.includes(rowValue);
}

function createEmptyGlobalFilters() {
  return Object.fromEntries(GLOBAL_FILTER_DIMENSIONS.map(({ key }) => [key, []]));
}

function normalizeGlobalFilterValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getGlobalFilterOptions(rowsByMetric, dimensionKey) {
  const values = new Set();

  Object.entries(rowsByMetric).forEach(([metricKey, rows]) => {
    const fieldName = GLOBAL_FILTER_FIELD_MAP[metricKey]?.[dimensionKey];

    if (!fieldName || !Array.isArray(rows)) {
      return;
    }

    rows.forEach((row) => {
      const normalizedValue = normalizeGlobalFilterValue(row?.[fieldName]);

      if (normalizedValue) {
        values.add(normalizedValue);
      }
    });
  });

  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function normalizeGlobalFilters(value, optionsByDimension = null) {
  return Object.fromEntries(
    GLOBAL_FILTER_DIMENSIONS.map(({ key }) => {
      const selectedValues = coerceFilterValues(value?.[key]);
      const availableOptions = optionsByDimension?.[key];

      return [
        key,
        Array.isArray(availableOptions)
          ? selectedValues.filter((selectedValue) => availableOptions.includes(selectedValue))
          : selectedValues
      ];
    })
  );
}

function applyGlobalFilters(rows, metricKey, globalFilters) {
  const metricFieldMap = GLOBAL_FILTER_FIELD_MAP[metricKey];

  if (!metricFieldMap || !Array.isArray(rows)) {
    return rows;
  }

  return rows.filter((row) => GLOBAL_FILTER_DIMENSIONS.every(({ key }) => {
    const selectedValues = globalFilters[key] ?? [];
    const fieldName = metricFieldMap[key];

    if (selectedValues.length === 0 || !fieldName) {
      return true;
    }

    return selectedValues.includes(normalizeGlobalFilterValue(row?.[fieldName]));
  }));
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

function labelGoalLineValue(goalLine, valueFormatter = formatNumber) {
  if (!goalLine) {
    return null;
  }

  return {
    ...goalLine,
    label: `Goal ${valueFormatter(goalLine.value)}`
  };
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

function getOtdRowYear(row) {
  const year = Number(row?.year);
  return Number.isInteger(year) ? year : FIXED_MONTH_METRIC_YEAR;
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

function isStampWithinDateRange(stamp, selectedDateRange) {
  if (stamp == null) {
    return false;
  }

  if (stamp < SCORECARD_START_STAMP || stamp > SCORECARD_END_STAMP) {
    return false;
  }

  if (!selectedDateRange) {
    return true;
  }

  return stamp >= selectedDateRange.startStamp && stamp <= selectedDateRange.endStamp;
}

function getLatestIncidentStamp(rows, selectedDateRange) {
  const monthStamps = rows
    .map((row) => getIncidentRowStamp(row))
    .filter((stamp) => stamp != null && isStampWithinDateRange(stamp, selectedDateRange));

  if (monthStamps.length === 0) {
    return null;
  }

  return Math.max(...monthStamps);
}

function getNextTimelinePeriodLabelAfterStamp(stamp, viewMode) {
  if (!Number.isFinite(stamp)) {
    return null;
  }

  const date = new Date(stamp);
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();

  if (viewMode === 'yearly') {
    return String(year + 1);
  }

  if (viewMode === 'quarterly') {
    const nextQuarterStart = new Date(Date.UTC(year, Math.floor(monthIndex / 3) * 3 + 3, 1));
    const nextQuarter = Math.floor(nextQuarterStart.getUTCMonth() / 3) + 1;

    return `Q${nextQuarter} ${nextQuarterStart.getUTCFullYear()}`;
  }

  return formatMonthStamp(Date.UTC(year, monthIndex + 1, 1));
}

function getAvailableTimelineStamps({
  controllableCostsRows,
  controllableCostsNewRows = [],
  controllableCostsHanaRows = [],
  sifRows,
  potentialSifRows,
  nmfrRows,
  otdRows = [],
  laborRows = [],
  laborNewRows = [],
  laborHanaRows = []
}) {
  const stampSet = new Set();

  [controllableCostsRows, controllableCostsNewRows, controllableCostsHanaRows].forEach((rows) => {
    rows.forEach((row) => {
      const stamp = getControllableCostsRowStamp(row);

      if (stamp != null) {
        stampSet.add(stamp);
      }
    });
  });

  [sifRows, potentialSifRows, nmfrRows].forEach((rows) => {
    rows.forEach((row) => {
      const stamp = getIncidentRowStamp(row);

      if (stamp != null) {
        stampSet.add(stamp);
      }
    });
  });

  const otdYears = new Set(otdRows.map((row) => getOtdRowYear(row)));

  otdYears.forEach((year) => {
    OTD_MONTH_COLUMNS.forEach((_month, monthIndex) => {
      stampSet.add(getFixedMonthStamp(year, monthIndex));
    });
  });

  [laborRows, laborHanaRows].forEach((rows) => {
    rows.forEach((row) => {
      const rowYear = Number.isInteger(Number(row.year))
        ? Number(row.year)
        : FIXED_MONTH_METRIC_YEAR;

      LABOR_MONTH_COLUMNS.forEach(({ key }, monthIndex) => {
        if (row[key] !== null && row[key] !== '' && Number.isFinite(Number(row[key]))) {
          stampSet.add(getFixedMonthStamp(rowYear, monthIndex));
        }
      });
    });
  });

  laborNewRows.forEach((row) => {
    const stamp = getLaborNewRowStamp(row);

    if (stamp != null && Number.isFinite(Number(row.entered_hours))) {
      stampSet.add(stamp);
    }
  });

  return Array.from(stampSet)
    .filter((stamp) => isStampWithinDateRange(stamp, null))
    .sort((left, right) => left - right);
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

    if (viewMode === 'monthly') {
      if (stamp == null) {
        return;
      }

      bucketKey = String(stamp);
      bucketLabel = formatMonthStamp(stamp);
      sortValue = stamp;
    } else if (viewMode === 'quarterly') {
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
      total: 0,
      controllable: 0,
      uncontrollable: 0
    };

    currentBucket.total += cost;

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
    total: sortedBuckets.map((bucket) => Number(bucket.total.toFixed(2))),
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

function getOtdBuckets(rows, viewMode, selectedDateRange) {
  const years = Array.from(new Set(rows.map((row) => getOtdRowYear(row)))).sort(
    (left, right) => left - right
  );
  const showYearInMonthlyLabels = years.length > 1;
  const monthEntries = years.flatMap((year) =>
    OTD_MONTH_COLUMNS.map((month, monthIndex) => ({
      year,
      month,
      monthIndex,
      stamp: getFixedMonthStamp(year, monthIndex)
    })).filter((entry) => isStampWithinDateRange(entry.stamp, selectedDateRange))
  );

  if (viewMode === 'monthly') {
    return monthEntries.map(({ year, month, monthIndex, stamp }) => ({
      label: showYearInMonthlyLabels ? `${month.label} ${year}` : month.label,
      tooltipLabel: formatFixedMonthLabel(year, monthIndex),
      monthStamps: [stamp]
    }));
  }

  if (viewMode === 'quarterly') {
    return years.flatMap((year) =>
      [0, 3, 6, 9]
        .map((startIndex, quarterIndex) => {
          const quarterMonthStamps = [startIndex, startIndex + 1, startIndex + 2]
            .map((monthIndex) => getFixedMonthStamp(year, monthIndex))
            .filter((stamp) => isStampWithinDateRange(stamp, selectedDateRange));

          if (quarterMonthStamps.length === 0) {
            return null;
          }

          return {
            label: `Q${quarterIndex + 1} ${year}`,
            tooltipLabel: `Q${quarterIndex + 1} ${year}`,
            monthStamps: quarterMonthStamps
          };
        })
        .filter(Boolean)
    );
  }

  return years
    .map((year) => {
      const monthStamps = OTD_MONTH_COLUMNS
        .map((_month, monthIndex) => getFixedMonthStamp(year, monthIndex))
        .filter((stamp) => isStampWithinDateRange(stamp, selectedDateRange));

      return monthStamps.length > 0
        ? {
          label: String(year),
          tooltipLabel: String(year),
          monthStamps
        }
        : null;
    })
    .filter(Boolean);
}

function buildOtdChartData(rows, viewMode, selectedDateRange) {
  const contractTotals = new Map();
  const deliveredTotals = new Map();

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

    const year = getOtdRowYear(row);

    OTD_MONTH_COLUMNS.forEach(({ key }, monthIndex) => {
      const value = Number(row[key]);

      if (Number.isFinite(value)) {
        const stamp = getFixedMonthStamp(year, monthIndex);
        targetSeries.set(stamp, (targetSeries.get(stamp) ?? 0) + value);
      }
    });
  });

  const buckets = getOtdBuckets(rows, viewMode, selectedDateRange);
  const tooltipLabelLookup = Object.fromEntries(
    buckets.map((bucket) => [bucket.label, bucket.tooltipLabel ?? bucket.label])
  );
  const contract = buckets.map((bucket) => Number(
    bucket.monthStamps
      .reduce((sum, stamp) => sum + (contractTotals.get(stamp) ?? 0), 0)
      .toFixed(2)
  ));
  const delivered = buckets.map((bucket) => Number(
    bucket.monthStamps
      .reduce((sum, stamp) => sum + (deliveredTotals.get(stamp) ?? 0), 0)
      .toFixed(2)
  ));
  const actualDeliveredPercent = buckets.map((_bucket, index) => {
    const contractTotal = contract[index];
    const deliveredTotal = delivered[index];

    if (!Number.isFinite(contractTotal) || contractTotal <= 0) {
      return 0;
    }

    return Number((deliveredTotal / contractTotal).toFixed(4));
  });
  const deliveredPercent = actualDeliveredPercent.map((value) =>
    Math.min(Math.max(value, 0), 1)
  );
  const deliveredForChart = delivered.map((value, index) => {
    const contractTotal = contract[index];

    if (!Number.isFinite(contractTotal) || contractTotal <= 0) {
      return 0;
    }

    return Math.min(Math.max(value, 0), contractTotal);
  });
  const tooltipLookup = Object.fromEntries(
    buckets.map((bucket, index) => [
      bucket.label,
      {
        contract: contract[index],
        delivered: delivered[index],
        deliveredPercent: actualDeliveredPercent[index]
      }
    ])
  );

  return {
    labels: buckets.map((bucket) => bucket.label),
    bucketEndStamps: buckets.map((bucket) => Math.max(...bucket.monthStamps)),
    tooltipLabelLookup,
    tooltipLookup,
    contract,
    delivered,
    deliveredForChart,
    deliveredPercent
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
      if (Number.isFinite(value) && value !== 0) {
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
        magnitude: 0,
        breakdown: new Map()
      };

    currentGroup.total += cost;
    currentGroup.magnitude += Math.abs(cost);
    currentGroup.breakdown.set(
      colorLabel,
      (currentGroup.breakdown.get(colorLabel) ?? 0) + cost
    );
    groups.set(groupLabel, currentGroup);
    colorTotals.set(colorLabel, (colorTotals.get(colorLabel) ?? 0) + Math.abs(cost));
  });

  const sortedGroups = Array.from(groups.values()).sort((left, right) => {
    if (right.magnitude !== left.magnitude) {
      return right.magnitude - left.magnitude;
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
  return buildParetoChartData(
    rows
      .filter((row) => row.measure_type === 'Actuals Delivered')
      .map((row) => ({
        category: row[fieldName],
        value: OTD_MONTH_COLUMNS.reduce((sum, month, monthIndex) => {
          const monthStamp = getFixedMonthStamp(getOtdRowYear(row), monthIndex);

          if (!isStampWithinDateRange(monthStamp, selectedDateRange)) {
            return sum;
          }

          const numericValue = Number(row[month.key]);
          return Number.isFinite(numericValue) ? sum + numericValue : sum;
        }, 0)
      }))
  );
}

function buildOtdPaletteChartData(rows, groupFieldName, colorFieldName, selectedDateRange) {
  const groups = new Map();
  const colorTotals = new Map();

  rows.forEach((row) => {
    if (row.measure_type !== 'Actuals Delivered') {
      return;
    }

    const deliveredTotal = OTD_MONTH_COLUMNS.reduce((sum, month, monthIndex) => {
      const monthStamp = getFixedMonthStamp(getOtdRowYear(row), monthIndex);

      if (!isStampWithinDateRange(monthStamp, selectedDateRange)) {
        return sum;
      }

      const numericValue = Number(row[month.key]);
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

function buildLaborUtilizationNewChartData(rows, viewMode, selectedDateRange) {
  const monthlyTotalsByYear = new Map();
  let directRowCount = 0;
  let indirectRowCount = 0;
  let otherRowCount = 0;

  rows.forEach((row) => {
    const enteredHours = Number(row.entered_hours);
    const year = Number(row.year);
    const month = Number(row.month);
    const laborCategoryGroup = getLaborUtilizationNewCategoryGroup(row.labor_category);

    if (
      !Number.isFinite(enteredHours)
      || !Number.isInteger(year)
      || !Number.isInteger(month)
      || month < 1
      || month > 12
    ) {
      return;
    }

    if (laborCategoryGroup === 'direct') {
      directRowCount += 1;
    } else if (laborCategoryGroup === 'indirect') {
      indirectRowCount += 1;
    } else {
      otherRowCount += 1;
      return;
    }

    const yearTotals = monthlyTotalsByYear.get(year) ?? {
      direct: LABOR_MONTH_COLUMNS.map(() => 0),
      indirect: LABOR_MONTH_COLUMNS.map(() => 0)
    };

    yearTotals[laborCategoryGroup][month - 1] += enteredHours;
    monthlyTotalsByYear.set(year, yearTotals);
  });

  const years = [...monthlyTotalsByYear.keys()].sort((left, right) => left - right);
  const buckets = getLaborBuckets(viewMode, selectedDateRange, years);
  const tooltipLookup = {};
  const tooltipLabelLookup = Object.fromEntries(
    buckets.map((bucket) => [bucket.label, bucket.tooltipLabel ?? bucket.label])
  );
  const direct = buckets.map(({ label, year, monthIndices }) => {
    const monthlyValues = monthlyTotalsByYear.get(year)?.direct ?? [];
    const value = monthIndices.reduce(
      (sum, monthIndex) => sum + (monthlyValues[monthIndex] ?? 0),
      0
    );
    const normalizedValue = Number(value.toFixed(2));

    tooltipLookup[label] = { direct: normalizedValue };
    return normalizedValue;
  });
  const indirect = buckets.map(({ label, year, monthIndices }) => {
    const monthlyValues = monthlyTotalsByYear.get(year)?.indirect ?? [];
    const value = monthIndices.reduce(
      (sum, monthIndex) => sum + (monthlyValues[monthIndex] ?? 0),
      0
    );
    const normalizedValue = Number(value.toFixed(2));

    tooltipLookup[label] = {
      ...tooltipLookup[label],
      indirect: normalizedValue
    };
    return normalizedValue;
  });
  const totals = buckets.map(({ label }, index) => {
    const total = Number((direct[index] + indirect[index]).toFixed(2));

    tooltipLookup[label] = {
      ...tooltipLookup[label],
      total
    };
    return total;
  });
  const directShare = buckets.map(({ label }, index) => {
    const share = totals[index] > 0 ? direct[index] / totals[index] : 0;

    tooltipLookup[label] = {
      ...tooltipLookup[label],
      directShare: share
    };
    return share;
  });

  return {
    labels: buckets.map((bucket) => bucket.label),
    tooltipLabelLookup,
    tooltipLookup,
    direct,
    indirect,
    other: buckets.map(() => 0),
    totals,
    directShare,
    directRowCount,
    indirectRowCount,
    otherRowCount
  };
}

function buildLaborUtilizationNewParetoChartData(rows, fieldName, selectedDateRange) {
  return buildParetoChartData(
    rows
      .filter((row) =>
        getLaborUtilizationNewCategoryGroup(row.labor_category) === 'direct'
        && isStampWithinDateRange(getLaborNewRowStamp(row), selectedDateRange)
      )
      .map((row) => ({
        category: row[fieldName],
        value: row.entered_hours
      })),
    PALETTE_MAX_GROUPS
  );
}

function buildLaborUtilizationNewPaletteChartData(
  rows,
  groupFieldName,
  colorFieldName,
  selectedDateRange
) {
  const groups = new Map();
  const colorTotals = new Map();

  rows.forEach((row) => {
    const directHours = Number(row.entered_hours);

    if (
      getLaborUtilizationNewCategoryGroup(row.labor_category) !== 'direct'
      || !Number.isFinite(directHours)
      || directHours <= 0
      || !isStampWithinDateRange(getLaborNewRowStamp(row), selectedDateRange)
    ) {
      return;
    }

    const groupLabel = normalizeParetoCategoryLabel(row[groupFieldName]);
    const colorLabel = normalizeParetoCategoryLabel(row[colorFieldName]);
    const currentGroup = groups.get(groupLabel) ?? {
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
      id: `labor-new-palette-${colorLabel}`,
      label: colorLabel,
      color: CONTROLLABLE_PALETTE_COLORS[index % CONTROLLABLE_PALETTE_COLORS.length],
      data: visibleGroups.map((group) =>
        Number((group.breakdown.get(colorLabel) ?? 0).toFixed(2))
      )
    }))
  };
}

function getLaborRowYear(row) {
  const year = Number(row?.year);
  return Number.isInteger(year) ? year : FIXED_MONTH_METRIC_YEAR;
}

function getLaborBuckets(viewMode, selectedDateRange, years) {
  const bucketConfig = LABOR_VIEW_CONFIG[viewMode];
  const buckets = [];
  const normalizedYears = [...new Set(years)]
    .filter((year) => Number.isInteger(year))
    .sort((left, right) => left - right);
  const visibleYears = normalizedYears.length > 0
    ? normalizedYears
    : [FIXED_MONTH_METRIC_YEAR];
  const showYearInMonthlyLabel =
    visibleYears.length > 1 || visibleYears[0] !== FIXED_MONTH_METRIC_YEAR;

  visibleYears.forEach((year) => {
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
            getFixedMonthStamp(year, monthIndex),
            selectedDateRange
          )
        ) {
          monthIndices.push(monthIndex);
        }
      }

      if (monthIndices.length === 0) {
        continue;
      }

      const baseLabel = bucketConfig.bucketFormatter(
        LABOR_MONTH_COLUMNS[startIndex],
        startIndex,
        year
      );

      buckets.push({
        year,
        label:
          viewMode === 'monthly' && showYearInMonthlyLabel
            ? formatFixedMonthLabel(year, startIndex)
            : baseLabel,
        tooltipLabel:
          viewMode === 'monthly'
            ? formatFixedMonthLabel(year, startIndex)
            : baseLabel,
        monthIndices
      });
    }
  });

  return buckets;
}

function buildLaborUtilizationChartData(rows, viewMode, selectedDateRange) {
  const monthlyTotalsByYear = new Map();
  let directRowCount = 0;
  let indirectRowCount = 0;
  let otherRowCount = 0;

  rows.forEach((row) => {
    const rowYear = getLaborRowYear(row);
    const laborCategoryGroup = getLaborCategoryGroup(row.labor_category);
    const yearTotals = monthlyTotalsByYear.get(rowYear) ?? {
      direct: LABOR_MONTH_COLUMNS.map(() => 0),
      indirect: LABOR_MONTH_COLUMNS.map(() => 0),
      other: LABOR_MONTH_COLUMNS.map(() => 0)
    };

    if (laborCategoryGroup === 'direct') {
      directRowCount += 1;
    } else if (laborCategoryGroup === 'indirect') {
      indirectRowCount += 1;
    } else {
      otherRowCount += 1;
    }

    const targetSeries = yearTotals[laborCategoryGroup];

    LABOR_MONTH_COLUMNS.forEach(({ key }, index) => {
      const value = Number(row[key]);

      if (Number.isFinite(value)) {
        targetSeries[index] += value;
      }
    });

    monthlyTotalsByYear.set(rowYear, yearTotals);
  });

  const years = [...monthlyTotalsByYear.keys()].sort((left, right) => left - right);
  const buckets = getLaborBuckets(viewMode, selectedDateRange, years);
  const tooltipLookup = {};
  const tooltipLabelLookup = Object.fromEntries(
    buckets.map((bucket) => [bucket.label, bucket.tooltipLabel ?? bucket.label])
  );

  const direct = buckets.map(({ label, year, monthIndices }) => {
    const directMonthlyTotals = monthlyTotalsByYear.get(year)?.direct ?? [];
    const total = monthIndices.reduce(
      (sum, monthIndex) => sum + (directMonthlyTotals[monthIndex] ?? 0),
      0
    );
    const normalizedTotal = Math.round(total);

    tooltipLookup[label] = {
      ...(tooltipLookup[label] || {}),
      direct: normalizedTotal
    };

    return normalizedTotal;
  });

  const indirect = buckets.map(({ label, year, monthIndices }) => {
    const indirectMonthlyTotals = monthlyTotalsByYear.get(year)?.indirect ?? [];
    const total = monthIndices.reduce(
      (sum, monthIndex) => sum + (indirectMonthlyTotals[monthIndex] ?? 0),
      0
    );
    const normalizedTotal = Math.round(total);

    tooltipLookup[label] = {
      ...(tooltipLookup[label] || {}),
      indirect: normalizedTotal
    };

    return normalizedTotal;
  });

  const other = buckets.map(({ label, year, monthIndices }) => {
    const otherMonthlyTotals = monthlyTotalsByYear.get(year)?.other ?? [];
    const total = monthIndices.reduce(
      (sum, monthIndex) => sum + (otherMonthlyTotals[monthIndex] ?? 0),
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
  const rowYear = getLaborRowYear(row);

  return LABOR_MONTH_COLUMNS.reduce((sum, { key }, monthIndex) => {
    if (
      !isStampWithinDateRange(
        getFixedMonthStamp(rowYear, monthIndex),
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
  hideLegend = true,
  tooltipComponent = StandardChartTooltip,
  tooltipTrigger = 'axis',
  tooltipProps = {},
  goalLine = null,
  sx = sharedChartSx
}) {
  const chartYAxis = getAdaptiveYAxis(
    yAxis,
    series.map((seriesConfig) => seriesConfig.data)
  );
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
    yAxis: chartYAxis,
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
  const stackedYAxis = getAdaptiveYAxis(
    yAxis.map((axisConfig) => ({
      ...axisConfig,
      min: axisConfig.min ?? 0
    })),
    series.map((seriesConfig) => seriesConfig.data)
  );

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
      yAxis={stackedYAxis}
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
  const paretoYAxis = [
    getAdaptiveYAxisConfig(
      {
        id: 'value-axis',
        ...barAxis[0]
      },
      [values]
    ),
    getAdaptiveYAxisConfig(
      {
        id: 'cumulative-axis',
        position: 'right',
        min: 0,
        max: 1,
        valueFormatter: formatPercentAxis,
        tickLabelStyle: { fontSize: 11 }
      },
      [cumulativeShares]
    )
  ];

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
      yAxis={paretoYAxis}
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
  filterValue = [],
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
            <Autocomplete
              multiple
              disableCloseOnSelect
              options={filterValueOptions}
              value={filterValue}
              onChange={(_event, nextValues) => {
                onFilterValueChange?.(nextValues);
              }}
              renderValue={(selectedValues) => (
                <span className="chart-filter-value-summary">
                  {selectedValues.length === 1
                    ? selectedValues[0]
                    : `${selectedValues.length} selected`}
                </span>
              )}
              renderOption={(optionProps, option, { selected }) => {
                const { key, ...remainingOptionProps } = optionProps;

                return (
                  <li key={key} {...remainingOptionProps}>
                    <Checkbox
                      checked={selected}
                      size="small"
                      disableRipple
                      sx={autocompleteOptionCheckboxSx}
                    />
                    {option}
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={filterValue.length === 0 ? filterValueAllLabel : 'Search...'}
                  inputProps={{
                    ...params.inputProps,
                    'aria-label': filterValueAriaLabel
                  }}
                />
              )}
              slotProps={{
                paper: selectMenuProps.PaperProps
              }}
              sx={inlineChartFilterAutocompleteStyles}
            />
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
  { includeZero = false, goalLine = null, paddingRatio = 0.08, minFloor = null, maxCeiling = null } = {}
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

  if (Number.isFinite(minFloor)) {
    minValue = Math.max(minValue, minFloor);
  }

  if (Number.isFinite(maxCeiling)) {
    maxValue = Math.min(maxValue, maxCeiling);
  }

  return baseAxis.map((axisConfig) => ({
    ...axisConfig,
    min: minValue,
    max: maxValue
  }));
}

function buildStackedNumericYAxis(baseAxis, seriesItems, options = {}) {
  const normalizedSeries = Array.isArray(seriesItems)
    ? seriesItems.map((seriesItem) =>
      Array.isArray(seriesItem?.data) ? seriesItem.data : []
    )
    : [];
  const stackLength = normalizedSeries.reduce(
    (maxLength, seriesValues) => Math.max(maxLength, seriesValues.length),
    0
  );
  const positiveStackTotals = Array.from({ length: stackLength }, (_unused, index) =>
    normalizedSeries.reduce((sum, seriesValues) => {
      const numericValue = Number(seriesValues[index]);
      return Number.isFinite(numericValue) && numericValue > 0 ? sum + numericValue : sum;
    }, 0)
  );
  const negativeStackTotals = Array.from({ length: stackLength }, (_unused, index) =>
    normalizedSeries.reduce((sum, seriesValues) => {
      const numericValue = Number(seriesValues[index]);
      return Number.isFinite(numericValue) && numericValue < 0 ? sum + numericValue : sum;
    }, 0)
  );

  return buildDynamicNumericYAxis(
    baseAxis,
    [positiveStackTotals, negativeStackTotals],
    options
  );
}

function renderMetricInfoContent(info) {
  function normalizeMetricInfoEntry(item, { defaultBullet = false } = {}) {
    if (item == null) {
      return null;
    }

    if (typeof item === 'object' && !Array.isArray(item)) {
      const parts = Array.isArray(item.parts)
        ? item.parts
          .map((part) => {
            const rawText = String(part?.text ?? '');
            const text = rawText.trim();

            if (!text) {
              return null;
            }

            return {
              text: rawText,
              bold: Boolean(part?.bold),
              underline: Boolean(part?.underline)
            };
          })
          .filter(Boolean)
        : [];
      const text = String(item.text ?? '').trim();

      if (!text && parts.length === 0) {
        return null;
      }

      return {
        text: text || parts.map((part) => part.text).join(''),
        parts: parts.length > 0 ? parts : null,
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
    const renderInlineText = (
      text,
      { bold = false, underline = false, keyPrefix = 'inline' } = {}
    ) => parseMetricInfoInlineText(text).map((part, index) => {
      let content = part.text;

      if (underline) {
        content = <span className="metric-info-underline">{content}</span>;
      }

      if (bold || part.bold) {
        content = <strong className="metric-info-strong">{content}</strong>;
      }

      return <span key={`${keyPrefix}-${index}`}>{content}</span>;
    });

    if (entry.parts?.length) {
      return (
        <>
          {entry.parts.map((part, index) => (
            <span key={`${part.text}-${part.bold}-${part.underline}-${index}`}>
              {renderInlineText(part.text, {
                bold: part.bold,
                underline: part.underline,
                keyPrefix: `part-${index}`
              })}
            </span>
          ))}
        </>
      );
    }

    return renderInlineText(entry.text, {
      bold: entry.bold,
      underline: entry.underline,
      keyPrefix: 'entry'
    });
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

function CardHeader({ title, info, tooltipLegend = null }) {
  const metricInfo = info || DEFAULT_METRIC_INFO;

  return (
    <div className="card-header">
      <div className="card-header-main">
        <h2 className="card-title">{title}</h2>
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

function MetricOverviewBand({
  value,
  label,
  forecastValue = '--',
  legendItems = [],
  ariaLabel = ''
}) {
  return (
    <section
      className="metric-overview-band"
      aria-label={ariaLabel || undefined}
    >
      <div className="metric-overview-summary">
        <div className="metric-overview-primary">
          <p className="metric-overview-value">{value}</p>
          <p className="metric-overview-label">{label}</p>
        </div>
        <div className="metric-overview-forecast">
          <p className="metric-overview-forecast-value">{forecastValue}</p>
          <p className="metric-overview-forecast-label">Next Month Forecast</p>
        </div>
      </div>
      <div className="metric-overview-legend" aria-label="Chart legend">
        {legendItems.map((item) => (
          <div key={`${item.label}-${item.color}`} className="metric-overview-legend-item">
            <span
              aria-hidden="true"
              className="metric-overview-legend-swatch"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function OtdChartTooltip(props) {
  const {
    chartData,
    sortSeriesItems: _sortSeriesItems,
    excludeZeroSeriesItems: _excludeZeroSeriesItems,
    bucketLabelLookup: _bucketLabelLookup,
    ...tooltipProps
  } = props;
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
        {tooltipData.map(({ axisId, axisFormattedValue }) => {
          const bucketLabel = String(axisFormattedValue);
          const bucketValues = chartData.tooltipLookup[bucketLabel] ?? {};

          return renderTooltipTable({
            axisId,
            bucketLabel: getTooltipBucketLabel(
              bucketLabel,
              chartData.tooltipLabelLookup
            ),
            seriesItems: [
              {
                seriesId: 'otd-contract',
                color: 'var(--chart-line)',
                formattedLabel: 'Contract Commitment',
                formattedValue: formatUnits(bucketValues.contract)
              },
              {
                seriesId: 'otd-delivered',
                color: 'var(--chart-secondary-line)',
                formattedLabel: 'Actuals Delivered',
                formattedValue: formatUnits(bucketValues.delivered)
              },
              {
                seriesId: 'otd-percent',
                color: 'var(--chart-accent-line)',
                formattedLabel: 'Percent Delivered',
                formattedValue: formatPercentValue(bucketValues.deliveredPercent)
              }
            ]
          });
        })}
      </Paper>
    </ChartsTooltipContainer>
  );
}

function LaborChartTooltip(props) {
  const {
    chartData,
    sortSeriesItems: _sortSeriesItems,
    excludeZeroSeriesItems: _excludeZeroSeriesItems,
    ...tooltipProps
  } = props;
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
  const {
    chartData,
    sortSeriesItems: _sortSeriesItems,
    excludeZeroSeriesItems: _excludeZeroSeriesItems,
    ...tooltipProps
  } = props;
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

let authenticationRedirectStarted = false;

function getAuthenticationRetryAttempted() {
  if (authenticationRedirectStarted) {
    return true;
  }

  const retryMarkedInUrl = new URL(window.location.href)
    .searchParams
    .get(AUTHENTICATION_RETRY_QUERY_PARAMETER) === 'true';

  if (retryMarkedInUrl) {
    return true;
  }

  try {
    return window.sessionStorage.getItem(AUTHENTICATION_RETRY_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function markAuthenticationRetryAttempted() {
  authenticationRedirectStarted = true;

  try {
    window.sessionStorage.setItem(AUTHENTICATION_RETRY_SESSION_KEY, 'true');
  } catch {
    // The in-memory guard still prevents duplicate redirects before navigation.
  }
}

function clearAuthenticationRetryAttempt() {
  authenticationRedirectStarted = false;

  try {
    window.sessionStorage.removeItem(AUTHENTICATION_RETRY_SESSION_KEY);
  } catch {
    // Storage can be unavailable in restricted browser modes.
  }

  const currentUrl = new URL(window.location.href);

  if (currentUrl.searchParams.has(AUTHENTICATION_RETRY_QUERY_PARAMETER)) {
    currentUrl.searchParams.delete(AUTHENTICATION_RETRY_QUERY_PARAMETER);
    window.history.replaceState(window.history.state, '', currentUrl.toString());
  }
}

function handleExpiredAuthenticationResponse(response, payload) {
  const authenticationExpired = response.status === 401
    && payload?.error === AUTHENTICATION_EXPIRED_ERROR
    && payload?.reauthenticate === true;

  if (!authenticationExpired) {
    return;
  }

  if (!getAuthenticationRetryAttempted()) {
    markAuthenticationRetryAttempted();
    const returnDestination = new URL(window.location.href);

    returnDestination.searchParams.set(AUTHENTICATION_RETRY_QUERY_PARAMETER, 'true');
    const authenticationUrl = `/oauth2/start?rd=${encodeURIComponent(returnDestination.toString())}`;

    window.location.assign(authenticationUrl);
    throw new Error('Authentication expired. Reconnecting securely...');
  }

  throw new Error(
    'Authentication could not be renewed automatically. Reload the page to try again.'
  );
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

  handleExpiredAuthenticationResponse(response, payload);

  if (!response.ok) {
    throw new Error(
      payload?.error
      || payload?.message
      || `Request failed with status ${response.status}`
    );
  }

  clearAuthenticationRetryAttempt();

  return payload;
}

function buildDashboardPresetState({
  themeMode,
  selectedCardGroup,
  globalFilters,
  chartVariants,
  controllableCostsViewMode,
  selectedControllableChartFilterField,
  selectedControllableChartFilterValue,
  selectedControllablePaletteGroupField,
  selectedControllablePaletteColorField,
  controllableCostsNewViewMode,
  selectedControllableNewChartFilterField,
  selectedControllableNewChartFilterValue,
  selectedControllableNewPaletteGroupField,
  selectedControllableNewPaletteColorField,
  controllableCostsHanaViewMode,
  selectedControllableHanaChartFilterField,
  selectedControllableHanaChartFilterValue,
  selectedControllableHanaPaletteGroupField,
  selectedControllableHanaPaletteColorField,
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
  laborNewViewMode,
  selectedLaborNewChartFilterField,
  selectedLaborNewChartFilterValue,
  selectedLaborNewPaletteGroupField,
  selectedLaborNewPaletteColorField,
  laborHanaViewMode,
  selectedLaborHanaChartFilterField,
  selectedLaborHanaChartFilterValue,
  selectedLaborHanaPaletteGroupField,
  selectedLaborHanaPaletteColorField,
  hasCustomizedDateRange,
  selectedDateRange
}) {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    themeMode,
    selectedCardGroup,
    globalFilters: normalizeGlobalFilters(globalFilters),
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
    controllableCostsNew: {
      viewMode: controllableCostsNewViewMode,
      filterField: selectedControllableNewChartFilterField,
      filterValue: selectedControllableNewChartFilterValue,
      paletteGroupField: selectedControllableNewPaletteGroupField,
      paletteColorField: selectedControllableNewPaletteColorField
    },
    controllableCostsHana: {
      viewMode: controllableCostsHanaViewMode,
      filterField: selectedControllableHanaChartFilterField,
      filterValue: selectedControllableHanaChartFilterValue,
      paletteGroupField: selectedControllableHanaPaletteGroupField,
      paletteColorField: selectedControllableHanaPaletteColorField
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
    },
    laborNew: {
      viewMode: laborNewViewMode,
      filterField: selectedLaborNewChartFilterField,
      filterValue: selectedLaborNewChartFilterValue,
      paletteGroupField: selectedLaborNewPaletteGroupField,
      paletteColorField: selectedLaborNewPaletteColorField
    },
    laborHana: {
      viewMode: laborHanaViewMode,
      filterField: selectedLaborHanaChartFilterField,
      filterValue: selectedLaborHanaChartFilterValue,
      paletteGroupField: selectedLaborHanaPaletteGroupField,
      paletteColorField: selectedLaborHanaPaletteColorField
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

function GlobalFilterField({ dimension, options, value, onChange }) {
  const selectOptions = options.map((option) => ({
    value: option,
    label: option
  }));
  const selectedOptions = value.map((selectedValue) => ({
    value: selectedValue,
    label: selectedValue
  }));

  return (
    <div className="global-filter-field">
      <label className="global-filter-field-label" htmlFor={`global-filter-${dimension.key}`}>
        {dimension.label}
      </label>
      <ReactSelect
        inputId={`global-filter-${dimension.key}`}
        instanceId={`global-filter-${dimension.key}`}
        className="global-filter-select"
        classNamePrefix="global-filter-select"
        isMulti
        isSearchable
        isClearable
        closeMenuOnSelect={false}
        options={selectOptions}
        value={selectedOptions}
        placeholder={dimension.allLabel}
        noOptionsMessage={() => 'No matches'}
        onChange={(nextOptions) => {
          onChange((nextOptions ?? []).map((option) => option.value));
        }}
        styles={globalFilterSelectStyles}
        menuPortalTarget={typeof document === 'undefined' ? null : document.body}
        menuPosition="fixed"
        aria-label={`Filter dashboard by ${dimension.label}`}
      />
    </div>
  );
}

function useCalculatedMetricGoalLine({
  metricKey,
  timeline,
  seriesValues,
  loading,
  error,
  calculateGoalLine
}) {
  const numericSeries = seriesValues
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const seriesSignature = JSON.stringify(numericSeries);
  const [calculation, setCalculation] = useState({
    goalLine: null,
    status: 'idle',
    observationCount: 0
  });

  useEffect(() => {
    if (loading || error) {
      setCalculation({ goalLine: null, status: 'idle', observationCount: 0 });
      return undefined;
    }

    const currentSeries = JSON.parse(seriesSignature);

    if (currentSeries.length === 0) {
      setCalculation({
        goalLine: null,
        status: 'insufficient_data',
        observationCount: 0
      });
      return undefined;
    }

    let isCancelled = false;

    calculateGoalLine(currentSeries)
      .then((goalLine) => {
        if (isCancelled) {
          return;
        }

        const observationCount = currentSeries.length;

        if (!goalLine) {
          logClientDebug(`${metricKey}-goal`, 'Calculated goal line is unavailable.', {
            timeline,
            observationCount
          });
          setCalculation({ goalLine: null, status: 'unavailable', observationCount });
          return;
        }

        logClientDebug(`${metricKey}-goal`, 'Updated goal from selected metric timeline.', {
          timeline,
          observationCount,
          method: goalLine.method,
          goalLine
        });
        setCalculation({
          goalLine,
          status: goalLine.status ?? 'ready',
          observationCount
        });
      })
      .catch((calculationError) => {
        if (isCancelled) {
          return;
        }

        const observationCount = currentSeries.length;
        logClientDebug(`${metricKey}-goal`, 'Failed to calculate metric goal line.', {
          timeline,
          observationCount,
          error: calculationError?.message ?? String(calculationError)
        });
        setCalculation({ goalLine: null, status: 'unavailable', observationCount });
      });

    return () => {
      isCancelled = true;
    };
  }, [calculateGoalLine, error, loading, metricKey, seriesSignature, timeline]);

  return calculation;
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
  const [controllableCostsNewState, setControllableCostsNewState] = useState({
    rows: [],
    loading: true,
    error: '',
    source: ''
  });
  const [controllableCostsHanaState, setControllableCostsHanaState] = useState({
    rows: [],
    loading: CONTROLLABLE_COSTS_HANA_CARD_ENABLED,
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
  const [laborNewState, setLaborNewState] = useState({
    rows: [],
    loading: true,
    error: '',
    source: ''
  });
  const [laborHanaState, setLaborHanaState] = useState({
    rows: [],
    loading: LABOR_HANA_CARD_ENABLED,
    error: '',
    source: ''
  });
  const [selectedControllableChartFilterField, setSelectedControllableChartFilterField] = useState(
    CONTROLLABLE_CHART_FILTER_FIELDS[0].value
  );
  const [selectedControllableChartFilterValue, setSelectedControllableChartFilterValue] =
    useState([]);
  const [selectedControllablePaletteGroupField, setSelectedControllablePaletteGroupField] =
    useState(CONTROLLABLE_PALETTE_FIELDS[0].value);
  const [selectedControllablePaletteColorField, setSelectedControllablePaletteColorField] =
    useState(CONTROLLABLE_PALETTE_FIELDS[1].value);
  const [controllableCostsViewMode, setControllableCostsViewMode] = useState('quarterly');
  const [selectedControllableNewChartFilterField, setSelectedControllableNewChartFilterField] =
    useState(CONTROLLABLE_NEW_CHART_FILTER_FIELDS[0].value);
  const [selectedControllableNewChartFilterValue, setSelectedControllableNewChartFilterValue] =
    useState([]);
  const [selectedControllableNewPaletteGroupField, setSelectedControllableNewPaletteGroupField] =
    useState(CONTROLLABLE_NEW_PALETTE_FIELDS[0].value);
  const [selectedControllableNewPaletteColorField, setSelectedControllableNewPaletteColorField] =
    useState(CONTROLLABLE_NEW_PALETTE_FIELDS[1].value);
  const [controllableCostsNewViewMode, setControllableCostsNewViewMode] = useState('monthly');
  const [selectedControllableHanaChartFilterField, setSelectedControllableHanaChartFilterField] =
    useState(CONTROLLABLE_HANA_CHART_FILTER_FIELDS[0].value);
  const [selectedControllableHanaChartFilterValue, setSelectedControllableHanaChartFilterValue] =
    useState([]);
  const [selectedControllableHanaPaletteGroupField, setSelectedControllableHanaPaletteGroupField] =
    useState(CONTROLLABLE_HANA_PALETTE_FIELDS[0].value);
  const [selectedControllableHanaPaletteColorField, setSelectedControllableHanaPaletteColorField] =
    useState(CONTROLLABLE_HANA_PALETTE_FIELDS[1].value);
  const [controllableCostsHanaViewMode, setControllableCostsHanaViewMode] = useState('monthly');
  const [sifViewMode, setSifViewMode] = useState('monthly');
  const [potentialSifViewMode, setPotentialSifViewMode] = useState('monthly');
  const [nmfrViewMode, setNmfrViewMode] = useState('monthly');
  const [selectedSifChartFilterField, setSelectedSifChartFilterField] = useState(
    SAFETY_CHART_FILTER_FIELDS[0].value
  );
  const [selectedSifChartFilterValue, setSelectedSifChartFilterValue] = useState([]);
  const [selectedSifPaletteGroupField, setSelectedSifPaletteGroupField] = useState(
    SAFETY_PALETTE_FIELDS[0].value
  );
  const [selectedSifPaletteColorField, setSelectedSifPaletteColorField] = useState(
    SAFETY_PALETTE_FIELDS[1].value
  );
  const [selectedPotentialSifChartFilterField, setSelectedPotentialSifChartFilterField] =
    useState(SAFETY_CHART_FILTER_FIELDS[0].value);
  const [selectedPotentialSifChartFilterValue, setSelectedPotentialSifChartFilterValue] =
    useState([]);
  const [selectedPotentialSifPaletteGroupField, setSelectedPotentialSifPaletteGroupField] =
    useState(SAFETY_PALETTE_FIELDS[0].value);
  const [selectedPotentialSifPaletteColorField, setSelectedPotentialSifPaletteColorField] =
    useState(SAFETY_PALETTE_FIELDS[1].value);
  const [selectedNmfrChartFilterField, setSelectedNmfrChartFilterField] = useState(
    SAFETY_CHART_FILTER_FIELDS[0].value
  );
  const [selectedNmfrChartFilterValue, setSelectedNmfrChartFilterValue] = useState([]);
  const [selectedNmfrPaletteGroupField, setSelectedNmfrPaletteGroupField] = useState(
    SAFETY_PALETTE_FIELDS[0].value
  );
  const [selectedNmfrPaletteColorField, setSelectedNmfrPaletteColorField] = useState(
    SAFETY_PALETTE_FIELDS[1].value
  );
  const [selectedOtdChartFilterField, setSelectedOtdChartFilterField] = useState(
    OTD_CHART_FILTER_FIELDS.find((option) => option.value === 'bu')?.value ?? OTD_CHART_FILTER_FIELDS[0].value
  );
  const [selectedOtdChartFilterValue, setSelectedOtdChartFilterValue] = useState([]);
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
    useState([]);
  const [selectedLaborPaletteGroupField, setSelectedLaborPaletteGroupField] = useState(
    LABOR_PALETTE_FIELDS[0].value
  );
  const [selectedLaborPaletteColorField, setSelectedLaborPaletteColorField] = useState(
    LABOR_PALETTE_FIELDS[1].value
  );
  const [laborViewMode, setLaborViewMode] = useState('monthly');
  const [selectedLaborNewChartFilterField, setSelectedLaborNewChartFilterField] = useState(
    LABOR_NEW_CHART_FILTER_FIELDS[0].value
  );
  const [selectedLaborNewChartFilterValue, setSelectedLaborNewChartFilterValue] = useState([]);
  const [selectedLaborNewPaletteGroupField, setSelectedLaborNewPaletteGroupField] = useState(
    LABOR_NEW_PALETTE_FIELDS[0].value
  );
  const [selectedLaborNewPaletteColorField, setSelectedLaborNewPaletteColorField] = useState(
    LABOR_NEW_PALETTE_FIELDS[1].value
  );
  const [laborNewViewMode, setLaborNewViewMode] = useState('monthly');
  const [selectedLaborHanaChartFilterField, setSelectedLaborHanaChartFilterField] = useState(
    LABOR_HANA_CHART_FILTER_FIELDS[0].value
  );
  const [selectedLaborHanaChartFilterValue, setSelectedLaborHanaChartFilterValue] =
    useState([]);
  const [selectedLaborHanaPaletteGroupField, setSelectedLaborHanaPaletteGroupField] = useState(
    LABOR_HANA_PALETTE_FIELDS[0].value
  );
  const [selectedLaborHanaPaletteColorField, setSelectedLaborHanaPaletteColorField] = useState(
    LABOR_HANA_PALETTE_FIELDS[1].value
  );
  const [laborHanaViewMode, setLaborHanaViewMode] = useState('monthly');
  const [selectedCardGroup, setSelectedCardGroup] = useState('all');
  const [globalFilters, setGlobalFilters] = useState(createEmptyGlobalFilters);
  const [isGlobalFiltersOpen, setIsGlobalFiltersOpen] = useState(false);
  const [isUtilityPanelOpen, setIsUtilityPanelOpen] = useState(false);
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
  const {
    chartHostRef: controllableCostsNewChartHostRef,
    chartWidth: controllableCostsNewChartWidth
  } = useChartWidth();
  const {
    chartHostRef: controllableCostsHanaChartHostRef,
    chartWidth: controllableCostsHanaChartWidth
  } = useChartWidth();
  const { chartHostRef: sifChartHostRef, chartWidth: sifChartWidth } = useChartWidth();
  const { chartHostRef: potentialSifChartHostRef, chartWidth: potentialSifChartWidth } =
    useChartWidth();
  const { chartHostRef: nmfrChartHostRef, chartWidth: nmfrChartWidth } = useChartWidth();
  const { chartHostRef: otdChartHostRef, chartWidth: otdChartWidth } = useChartWidth();
  const { chartHostRef: laborChartHostRef, chartWidth: laborChartWidth } = useChartWidth();
  const { chartHostRef: laborNewChartHostRef, chartWidth: laborNewChartWidth } = useChartWidth();
  const { chartHostRef: laborHanaChartHostRef, chartWidth: laborHanaChartWidth } = useChartWidth();

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

    async function loadControllableCostsNewData() {
      const startTime = performance.now();

      try {
        const payload = await fetchJson(
          'controllable-costs-new',
          '/api/controllable-costs-new'
        );

        if (!isMounted) {
          logClientDebug(
            'controllable-costs-new',
            'Component unmounted before new controllable costs state update.'
          );
          return;
        }

        setControllableCostsNewState({
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          loading: false,
          error: '',
          source: getSourceLabel(payload.source)
        });

        logClientDebug('controllable-costs-new', 'New controllable costs state updated.', {
          rowCount: Array.isArray(payload.rows) ? payload.rows.length : 0,
          source: payload.source,
          sourceRowCount: payload.sourceRowCount,
          excludedByCostElementKeyCount: payload.excludedByCostElementKeyCount,
          validCostElementCount: payload.validCostElementCount,
          years: payload.years,
          totalCost: payload.totalCost,
          controllableRowCount: payload.controllableRowCount,
          uncontrollableRowCount: payload.uncontrollableRowCount,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setControllableCostsNewState({
          rows: [],
          loading: false,
          error: error.message || 'Unable to load the new controllable costs workbook.',
          source: ''
        });

        logClientDebug('controllable-costs-new', 'New controllable costs load failed.', {
          error: error.message,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      }
    }

    async function loadControllableCostsHanaData() {
      const startTime = performance.now();

      try {
        const payload = await fetchJson(
          'controllable-costs-hana',
          '/api/controllable-costs-hana'
        );

        if (!isMounted) {
          logClientDebug(
            'controllable-costs-hana',
            'Component unmounted before HANA controllable costs state update.'
          );
          return;
        }

        setControllableCostsHanaState({
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          loading: false,
          error: '',
          source: getSourceLabel(payload.source)
        });

        logClientDebug('controllable-costs-hana', 'HANA controllable costs state updated.', {
          rowCount: Array.isArray(payload.rows) ? payload.rows.length : 0,
          source: payload.source,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          logClientDebug(
            'controllable-costs-hana',
            'Component unmounted after HANA controllable costs load failure.',
            { error: error.message }
          );
          return;
        }

        setControllableCostsHanaState({
          rows: [],
          loading: false,
          error: error.message || 'Unable to load HANA controllable costs data.',
          source: ''
        });

        logClientDebug('controllable-costs-hana', 'HANA controllable costs load failed.', {
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

    async function loadLaborNewData() {
      const startTime = performance.now();

      try {
        const payload = await fetchJson('labor-new', '/api/labor-utilization-new');

        if (!isMounted) {
          logClientDebug('labor-new', 'Component unmounted before new labor state update.');
          return;
        }

        setLaborNewState({
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          loading: false,
          error: '',
          source: getSourceLabel(payload.source)
        });

        logClientDebug('labor-new', 'New labor workbook state updated.', {
          rowCount: payload.rowCount,
          sourceRowCount: payload.sourceRowCount,
          invalidRowCount: payload.invalidRowCount,
          years: payload.years,
          totalEnteredHours: payload.totalEnteredHours,
          laborCategoryCounts: payload.laborCategoryCounts,
          source: payload.source,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          logClientDebug('labor-new', 'Component unmounted after new labor load failure.', {
            error: error.message
          });
          return;
        }

        setLaborNewState({
          rows: [],
          loading: false,
          error: error.message || 'Unable to load the new labor utilization workbook.',
          source: ''
        });

        logClientDebug('labor-new', 'New labor workbook load failed.', {
          error: error.message,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      }
    }

    async function loadLaborHanaData() {
      const startTime = performance.now();

      try {
        const payload = await fetchJson('labor-hana', '/api/labor-utilization-hana');

        if (!isMounted) {
          logClientDebug('labor-hana', 'Component unmounted before HANA labor state update.');
          return;
        }

        setLaborHanaState({
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          loading: false,
          error: '',
          source: getSourceLabel(payload.source)
        });

        logClientDebug('labor-hana', 'HANA labor state updated.', {
          rowCount: Array.isArray(payload.rows) ? payload.rows.length : 0,
          source: payload.source,
          sourceRowCount: payload.sourceRowCount,
          organizationCount: payload.organizationCount,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          logClientDebug('labor-hana', 'Component unmounted after HANA labor load failure.', {
            error: error.message
          });
          return;
        }

        setLaborHanaState({
          rows: [],
          loading: false,
          error: error.message || 'Unable to load HANA labor utilization data.',
          source: ''
        });

        logClientDebug('labor-hana', 'HANA labor load failed.', {
          error: error.message,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      }
    }

    logClientDebug('dashboard', 'Starting dashboard data load.');

    loadControllableCostsData();
    loadControllableCostsNewData();
    if (CONTROLLABLE_COSTS_HANA_CARD_ENABLED) {
      loadControllableCostsHanaData();
    }
    loadSifData();
    loadPotentialSifData();
    loadNmfrData();
    loadOtdData();
    loadLaborData();
    loadLaborNewData();
    if (LABOR_HANA_CARD_ENABLED) {
      loadLaborHanaData();
    }

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
    controllableCostsNewRows: controllableCostsNewState.rows,
    controllableCostsHanaRows: controllableCostsHanaState.rows,
    sifRows: sifState.rows,
    potentialSifRows: potentialSifState.rows,
    nmfrRows: nmfrState.rows,
    otdRows: otdState.rows,
    laborRows: laborState.rows,
    laborNewRows: laborNewState.rows,
    laborHanaRows: laborHanaState.rows
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
  const formatDateSliderValue = (value) => {
    const normalizedIndex = Math.max(
      0,
      Math.min(Math.round(Number(value) || 0), maximumDateIndex)
    );

    return availableTimelineStamps.length > 0
      ? formatMonthStamp(availableTimelineStamps[normalizedIndex])
      : '';
  };
  const dateSliderStartLabel =
    availableTimelineStamps.length > 0
      ? formatDateSliderValue(activeDateRangeIndices[0])
      : '';
  const dateSliderEndLabel =
    availableTimelineStamps.length > 0
      ? formatDateSliderValue(activeDateRangeIndices[1])
      : '';
  const dashboardRowsByMetric = {
    controllableCosts: controllableCostsState.rows,
    controllableCostsNew: controllableCostsNewState.rows,
    controllableCostsHana: controllableCostsHanaState.rows,
    sif: sifState.rows,
    potentialSif: potentialSifState.rows,
    nmfr: nmfrState.rows,
    otd: otdState.rows,
    labor: laborState.rows,
    laborNew: laborNewState.rows,
    laborHana: laborHanaState.rows
  };
  const globalFilterOptions = Object.fromEntries(
    GLOBAL_FILTER_DIMENSIONS.map(({ key }) => [
      key,
      getGlobalFilterOptions(dashboardRowsByMetric, key)
    ])
  );
  const activeGlobalFilters = normalizeGlobalFilters(globalFilters, globalFilterOptions);
  const activeGlobalFilterCount = Object.values(activeGlobalFilters).reduce(
    (count, selectedValues) => count + selectedValues.length,
    0
  );

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
  const baseFilteredControllableCostsRows = applyGlobalFilters(
    controllableCostsState.rows,
    'controllableCosts',
    activeGlobalFilters
  );
  const controllableChartFilterValueOptions = getFilterOptions(
    baseFilteredControllableCostsRows,
    activeControllableChartFilterField.value
  );
  const activeControllableChartFilterValue = normalizeFilterValues(
    selectedControllableChartFilterValue,
    controllableChartFilterValueOptions
  );
  const controllableFilterApplies = ['line', 'bar'].includes(chartVariants.controllableCosts);
  const filteredControllableCostsRows = baseFilteredControllableCostsRows.filter((row) => {
    if (!controllableFilterApplies) {
      return true;
    }

    return (
      rowMatchesFilterValues(
        row[activeControllableChartFilterField.value],
        activeControllableChartFilterValue
      )
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
  const controllableCostsGoalCalculation = useCalculatedMetricGoalLine({
    metricKey: 'controllable-costs',
    timeline: controllableCostsViewMode,
    seriesValues: controllableCostsChartData.total,
    loading: controllableCostsState.loading,
    error: controllableCostsState.error,
    calculateGoalLine: forecastControllableCostsGoalLineFromSeries
  });
  const controllableCostsSummaryValue = formatOverviewCurrency(
    sumNumericValues(controllableCostsChartData.total)
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
  const controllableCostsPaletteHasNegativeValues = controllableCostsPaletteChartData.series.some(
    (seriesItem) => seriesItem.data.some((value) => Number(value) < 0)
  );
  const controllableCostsPaletteChartYAxis = buildStackedNumericYAxis(
    CONTROLLABLE_COSTS_Y_AXIS,
    controllableCostsPaletteChartData.series,
    {
      includeZero: true,
      minFloor: controllableCostsPaletteHasNegativeValues ? null : 0
    }
  );
  const activeControllableNewChartFilterField =
    CONTROLLABLE_NEW_CHART_FILTER_FIELDS.find(
      (option) => option.value === selectedControllableNewChartFilterField
    ) ?? CONTROLLABLE_NEW_CHART_FILTER_FIELDS[0];
  const controllableNewPaletteGroupFieldOptions = CONTROLLABLE_NEW_PALETTE_FIELDS.filter(
    (option) => option.value !== selectedControllableNewPaletteColorField
  );
  const activeControllableNewPaletteGroupField =
    controllableNewPaletteGroupFieldOptions.find(
      (option) => option.value === selectedControllableNewPaletteGroupField
    ) ?? controllableNewPaletteGroupFieldOptions[0] ?? CONTROLLABLE_NEW_PALETTE_FIELDS[0];
  const controllableNewPaletteColorFieldOptions = CONTROLLABLE_NEW_PALETTE_FIELDS.filter(
    (option) => option.value !== activeControllableNewPaletteGroupField.value
  );
  const activeControllableNewPaletteColorField =
    controllableNewPaletteColorFieldOptions.find(
      (option) => option.value === selectedControllableNewPaletteColorField
    ) ?? controllableNewPaletteColorFieldOptions[0] ?? CONTROLLABLE_NEW_PALETTE_FIELDS[1];
  const baseFilteredControllableCostsNewRows = applyGlobalFilters(
    controllableCostsNewState.rows,
    'controllableCostsNew',
    activeGlobalFilters
  );
  const controllableNewChartFilterValueOptions = getFilterOptions(
    baseFilteredControllableCostsNewRows,
    activeControllableNewChartFilterField.value
  );
  const activeControllableNewChartFilterValue = normalizeFilterValues(
    selectedControllableNewChartFilterValue,
    controllableNewChartFilterValueOptions
  );
  const controllableNewFilterApplies = ['line', 'bar'].includes(
    chartVariants.controllableCostsNew
  );
  const filteredControllableCostsNewRows = baseFilteredControllableCostsNewRows.filter((row) => {
    if (!controllableNewFilterApplies) {
      return true;
    }

    return rowMatchesFilterValues(
      row[activeControllableNewChartFilterField.value],
      activeControllableNewChartFilterValue
    );
  });
  const globallyFilteredControllableCostsNewRows = filteredControllableCostsNewRows.filter((row) =>
    isStampWithinDateRange(getControllableCostsRowStamp(row), selectedDateRange)
  );
  const controllableCostsNewChartData = buildControllableCostsChartData(
    filteredControllableCostsNewRows,
    controllableCostsNewViewMode,
    selectedDateRange
  );
  const controllableCostsNewGoalCalculation = useCalculatedMetricGoalLine({
    metricKey: 'controllable-costs-new',
    timeline: controllableCostsNewViewMode,
    seriesValues: controllableCostsNewChartData.total,
    loading: controllableCostsNewState.loading,
    error: controllableCostsNewState.error,
    calculateGoalLine: forecastControllableCostsGoalLineFromSeries
  });
  const controllableCostsNewSummaryValue = formatOverviewCurrency(
    sumNumericValues(controllableCostsNewChartData.total)
  );
  const controllableCostsNewParetoChartData = buildControllableCostsParetoChartData(
    baseFilteredControllableCostsNewRows,
    activeControllableNewChartFilterField.value,
    selectedDateRange
  );
  const controllableCostsNewPaletteChartData = buildControllableCostsPaletteChartData(
    baseFilteredControllableCostsNewRows,
    activeControllableNewPaletteGroupField.value,
    activeControllableNewPaletteColorField.value,
    selectedDateRange
  );
  const isControllableCostsNewPareto = chartVariants.controllableCostsNew === 'pareto';
  const isControllableCostsNewPalette = chartVariants.controllableCostsNew === 'palette';
  const controllableCostsNewPaletteHasNegativeValues =
    controllableCostsNewPaletteChartData.series.some(
      (seriesItem) => seriesItem.data.some((value) => Number(value) < 0)
    );
  const controllableCostsNewPaletteChartYAxis = buildStackedNumericYAxis(
    CONTROLLABLE_COSTS_Y_AXIS,
    controllableCostsNewPaletteChartData.series,
    {
      includeZero: true,
      minFloor: controllableCostsNewPaletteHasNegativeValues ? null : 0
    }
  );
  const activeControllableHanaChartFilterField =
    CONTROLLABLE_HANA_CHART_FILTER_FIELDS.find(
      (option) => option.value === selectedControllableHanaChartFilterField
    ) ?? CONTROLLABLE_HANA_CHART_FILTER_FIELDS[0];
  const controllableHanaPaletteGroupFieldOptions = CONTROLLABLE_HANA_PALETTE_FIELDS.filter(
    (option) => option.value !== selectedControllableHanaPaletteColorField
  );
  const activeControllableHanaPaletteGroupField =
    controllableHanaPaletteGroupFieldOptions.find(
      (option) => option.value === selectedControllableHanaPaletteGroupField
    )
    ?? controllableHanaPaletteGroupFieldOptions[0]
    ?? CONTROLLABLE_HANA_PALETTE_FIELDS[0];
  const controllableHanaPaletteColorFieldOptions = CONTROLLABLE_HANA_PALETTE_FIELDS.filter(
    (option) => option.value !== activeControllableHanaPaletteGroupField.value
  );
  const activeControllableHanaPaletteColorField =
    controllableHanaPaletteColorFieldOptions.find(
      (option) => option.value === selectedControllableHanaPaletteColorField
    )
    ?? controllableHanaPaletteColorFieldOptions[0]
    ?? CONTROLLABLE_HANA_PALETTE_FIELDS[1];
  const baseFilteredControllableCostsHanaRows = applyGlobalFilters(
    controllableCostsHanaState.rows,
    'controllableCostsHana',
    activeGlobalFilters
  );
  const controllableHanaChartFilterValueOptions = getFilterOptions(
    baseFilteredControllableCostsHanaRows,
    activeControllableHanaChartFilterField.value
  );
  const activeControllableHanaChartFilterValue = normalizeFilterValues(
    selectedControllableHanaChartFilterValue,
    controllableHanaChartFilterValueOptions
  );
  const controllableHanaFilterApplies = ['line', 'bar'].includes(
    chartVariants.controllableCostsHana
  );
  const filteredControllableCostsHanaRows = baseFilteredControllableCostsHanaRows.filter((row) => {
    if (!controllableHanaFilterApplies) {
      return true;
    }

    return (
      rowMatchesFilterValues(
        row[activeControllableHanaChartFilterField.value],
        activeControllableHanaChartFilterValue
      )
    );
  });
  const globallyFilteredControllableCostsHanaRows = filteredControllableCostsHanaRows.filter(
    (row) => isStampWithinDateRange(getControllableCostsRowStamp(row), selectedDateRange)
  );
  const controllableCostsHanaChartData = buildControllableCostsChartData(
    filteredControllableCostsHanaRows,
    controllableCostsHanaViewMode,
    selectedDateRange
  );
  const controllableCostsHanaGoalCalculation = useCalculatedMetricGoalLine({
    metricKey: 'controllable-costs-hana',
    timeline: controllableCostsHanaViewMode,
    seriesValues: controllableCostsHanaChartData.total,
    loading: controllableCostsHanaState.loading,
    error: controllableCostsHanaState.error,
    calculateGoalLine: forecastControllableCostsGoalLineFromSeries
  });
  const controllableCostsHanaSummaryValue = formatOverviewCurrency(
    sumNumericValues(controllableCostsHanaChartData.total)
  );
  const controllableCostsHanaParetoChartData = buildControllableCostsParetoChartData(
    baseFilteredControllableCostsHanaRows,
    activeControllableHanaChartFilterField.value,
    selectedDateRange
  );
  const controllableCostsHanaPaletteChartData = buildControllableCostsPaletteChartData(
    baseFilteredControllableCostsHanaRows,
    activeControllableHanaPaletteGroupField.value,
    activeControllableHanaPaletteColorField.value,
    selectedDateRange
  );
  const isControllableCostsHanaPareto = chartVariants.controllableCostsHana === 'pareto';
  const isControllableCostsHanaPalette = chartVariants.controllableCostsHana === 'palette';
  const controllableCostsHanaPaletteHasNegativeValues =
    controllableCostsHanaPaletteChartData.series.some(
      (seriesItem) => seriesItem.data.some((value) => Number(value) < 0)
    );
  const controllableCostsHanaPaletteChartYAxis = buildStackedNumericYAxis(
    CONTROLLABLE_COSTS_Y_AXIS,
    controllableCostsHanaPaletteChartData.series,
    {
      includeZero: true,
      minFloor: controllableCostsHanaPaletteHasNegativeValues ? null : 0
    }
  );
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
  const baseFilteredSifRows = applyGlobalFilters(
    sifState.rows.filter(
      (row) => Number(row.kpi_id) === SIF_KPI_ID
        && normalizeText(row.org_unit_name) === INCIDENT_ORG_UNIT_NAME
    ),
    'sif',
    activeGlobalFilters
  );
  const sifChartFilterValueOptions = getFilterOptions(
    baseFilteredSifRows,
    activeSifChartFilterField.value
  );
  const activeSifChartFilterValue = normalizeFilterValues(
    selectedSifChartFilterValue,
    sifChartFilterValueOptions
  );
  const sifFilterApplies = ['line', 'bar'].includes(chartVariants.sif);
  const filteredSifRows = baseFilteredSifRows.filter((row) => (
    !sifFilterApplies
    || rowMatchesFilterValues(row[activeSifChartFilterField.value], activeSifChartFilterValue)
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
  const sifForecastCalculation = useCalculatedMetricGoalLine({
    metricKey: 'sif-forecast',
    timeline: sifViewMode,
    seriesValues: sifChartData.map((bucket) => bucket.total),
    loading: sifState.loading,
    error: sifState.error,
    calculateGoalLine: forecastIncidentGoalLineFromSeries
  });
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
  const baseFilteredPotentialSifRows = applyGlobalFilters(
    potentialSifState.rows.filter(
      (row) => Number(row.kpi_id) === POTENTIAL_SIF_KPI_ID
        && normalizeText(row.org_unit_name) === INCIDENT_ORG_UNIT_NAME
    ),
    'potentialSif',
    activeGlobalFilters
  );
  const potentialSifChartFilterValueOptions = getFilterOptions(
    baseFilteredPotentialSifRows,
    activePotentialSifChartFilterField.value
  );
  const activePotentialSifChartFilterValue = normalizeFilterValues(
    selectedPotentialSifChartFilterValue,
    potentialSifChartFilterValueOptions
  );
  const potentialSifFilterApplies = ['line', 'bar'].includes(chartVariants.potentialSif);
  const filteredPotentialSifRows = baseFilteredPotentialSifRows.filter((row) => (
    !potentialSifFilterApplies
    || rowMatchesFilterValues(
      row[activePotentialSifChartFilterField.value],
      activePotentialSifChartFilterValue
    )
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
  const potentialSifForecastCalculation = useCalculatedMetricGoalLine({
    metricKey: 'potential-sif-forecast',
    timeline: potentialSifViewMode,
    seriesValues: potentialSifChartData.map((bucket) => bucket.total),
    loading: potentialSifState.loading,
    error: potentialSifState.error,
    calculateGoalLine: forecastIncidentGoalLineFromSeries
  });
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
  const baseFilteredNmfrRows = applyGlobalFilters(
    nmfrState.rows.filter(
      (row) => Number(row.kpi_id) === NMFR_KPI_ID
        && normalizeText(row.org_unit_name) === INCIDENT_ORG_UNIT_NAME
    ),
    'nmfr',
    activeGlobalFilters
  );
  const nmfrChartFilterValueOptions = getFilterOptions(
    baseFilteredNmfrRows,
    activeNmfrChartFilterField.value
  );
  const activeNmfrChartFilterValue = normalizeFilterValues(
    selectedNmfrChartFilterValue,
    nmfrChartFilterValueOptions
  );
  const nmfrFilterApplies = ['line', 'bar'].includes(chartVariants.nmfr);
  const filteredNmfrRows = baseFilteredNmfrRows.filter((row) => (
    !nmfrFilterApplies
    || rowMatchesFilterValues(row[activeNmfrChartFilterField.value], activeNmfrChartFilterValue)
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
  const nmfrGoalForecastSeries = nmfrChartData;
  const nmfrGoalForecastSeriesValues = nmfrGoalForecastSeries.map((bucket) => bucket.total);
  const nmfrGoalCalculation = useCalculatedMetricGoalLine({
    metricKey: 'nmfr',
    timeline: nmfrViewMode,
    seriesValues: nmfrGoalForecastSeriesValues,
    loading: nmfrState.loading,
    error: nmfrState.error,
    calculateGoalLine: forecastNmfrGoalLineFromSeries
  });
  const nmfrForecastPeriodLabel = getNextTimelinePeriodLabelAfterStamp(
    getLatestIncidentStamp(filteredNmfrRows, selectedDateRange),
    nmfrViewMode
  );
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
  const baseFilteredOtdRows = applyGlobalFilters(
    otdState.rows,
    'otd',
    activeGlobalFilters
  );
  const otdChartFilterValueOptions = getFilterOptions(
    baseFilteredOtdRows,
    activeOtdChartFilterField.value
  );
  const activeOtdChartFilterValue = normalizeFilterValues(
    selectedOtdChartFilterValue,
    otdChartFilterValueOptions
  );
  const otdFilterApplies = ['line', 'bar'].includes(chartVariants.otd);
  const filteredOtdRows = baseFilteredOtdRows.filter((row) => {
    if (!otdFilterApplies) {
      return true;
    }

    return (
      rowMatchesFilterValues(row[activeOtdChartFilterField.value], activeOtdChartFilterValue)
    );
  });
  const otdChartData = buildOtdChartData(filteredOtdRows, otdViewMode, selectedDateRange);
  const otdMonthlySummaryData = buildOtdChartData(
    filteredOtdRows,
    'monthly',
    selectedDateRange
  );
  const otdGoalForecastData = otdChartData;
  const currentOtdMonthStamp = getMonthStartStamp(new Date());
  const completedOtdMonthIndices = otdMonthlySummaryData.bucketEndStamps.reduce(
    (indices, bucketStamp, index) => {
      if (bucketStamp < currentOtdMonthStamp) {
        indices.push(index);
      }

      return indices;
    },
    []
  );
  const otdOverallContract = completedOtdMonthIndices.reduce(
    (sum, index) => sum + Number(otdMonthlySummaryData.contract[index] ?? 0),
    0
  );
  const otdOverallDelivered = completedOtdMonthIndices.reduce(
    (sum, index) => sum + Number(otdMonthlySummaryData.delivered[index] ?? 0),
    0
  );
  const otdSummaryValue = otdOverallContract > 0
    ? formatPercentValue(otdOverallDelivered / otdOverallContract)
    : '--';
  const otdLastDeliveredIndex = otdGoalForecastData.delivered.reduce(
    (lastIndex, deliveredValue, index) =>
      otdGoalForecastData.bucketEndStamps[index] < currentOtdMonthStamp &&
      deliveredValue > 0 &&
      otdGoalForecastData.contract[index] > 0
        ? index
        : lastIndex,
    -1
  );
  const otdGoalForecastSeriesValues = otdGoalForecastData.deliveredPercent.filter(
    (_value, index) =>
      otdGoalForecastData.bucketEndStamps[index] < currentOtdMonthStamp &&
      index <= otdLastDeliveredIndex &&
      otdGoalForecastData.contract[index] > 0
  );
  const otdGoalCalculation = useCalculatedMetricGoalLine({
    metricKey: 'otd',
    timeline: otdViewMode,
    seriesValues: otdGoalForecastSeriesValues,
    loading: otdState.loading,
    error: otdState.error,
    calculateGoalLine: forecastOtdGoalLineFromSeries
  });
  const otdForecastPeriodLabel = getNextTimelinePeriodLabelAfterStamp(
    otdGoalForecastData.bucketEndStamps[otdLastDeliveredIndex],
    otdViewMode
  );
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
  const isOtdBarChart = chartVariants.otd === 'bar';

  const otdBaseGoalLine = isOtdPareto || isOtdPalette
    ? null
    : getMetricGoalLine('otd', otdViewMode);
  const otdGoalLine = labelGoalLineValue(
    otdBaseGoalLine,
    formatPercentValue
  );
  const otdMetricInfo = buildOtdMetricInfo(METRIC_INFO.otd, {
    ...otdGoalCalculation.goalLine,
    status: otdGoalCalculation.status,
    forecastMonthLabel: otdForecastPeriodLabel,
    timelineLabel: OTD_VIEW_CONFIG[otdViewMode]?.label,
    observationCount: otdGoalCalculation.observationCount,
    requiredObservations: CALCULATED_GOAL_MIN_OBSERVATIONS
  });
  const otdPercentChartYAxis = buildDynamicNumericYAxis(
    OTD_PERCENT_Y_AXIS,
    [otdChartData.deliveredPercent],
    {
      includeZero: true,
      minFloor: 0,
      maxCeiling: 1,
      goalLine: otdGoalLine
    }
  );
  const otdUnitsChartYAxis = buildDynamicNumericYAxis(
    OTD_UNITS_Y_AXIS,
    [otdChartData.contract, otdChartData.deliveredForChart],
    {
      includeZero: true,
      minFloor: 0
    }
  );
  const otdPaletteChartYAxis = buildDynamicNumericYAxis(
    OTD_UNITS_Y_AXIS,
    otdPaletteChartData.series.map((seriesItem) => seriesItem.data),
    {
      includeZero: true,
      minFloor: 0
    }
  );

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
  const baseFilteredLaborRows = applyGlobalFilters(
    laborState.rows,
    'labor',
    activeGlobalFilters
  );
  const laborChartFilterValueOptions = getFilterOptions(
    baseFilteredLaborRows,
    activeLaborChartFilterField.value
  );
  const activeLaborChartFilterValue = normalizeFilterValues(
    selectedLaborChartFilterValue,
    laborChartFilterValueOptions
  );
  const laborFilterApplies = ['line', 'bar'].includes(chartVariants.labor);
  const filteredLaborRows = baseFilteredLaborRows.filter((row) => {
    if (!laborFilterApplies) {
      return true;
    }

    return (
      rowMatchesFilterValues(row[activeLaborChartFilterField.value], activeLaborChartFilterValue)
    );
  });
  const laborChartData = buildLaborUtilizationChartData(
    filteredLaborRows,
    laborViewMode,
    selectedDateRange
  );
  const laborOverallHours = sumNumericValues(laborChartData.totals);
  const laborOverallDirectHours = sumNumericValues(laborChartData.direct);
  const laborSummaryValue = laborOverallHours > 0
    ? formatPercentValue(laborOverallDirectHours / laborOverallHours)
    : '--';
  const laborGoalForecastSeriesValues = laborChartData.directShare.filter(
    (_value, index) => laborChartData.totals[index] > 0
  );
  const laborGoalCalculation = useCalculatedMetricGoalLine({
    metricKey: 'labor',
    timeline: laborViewMode,
    seriesValues: laborGoalForecastSeriesValues,
    loading: laborState.loading,
    error: laborState.error,
    calculateGoalLine: forecastLaborGoalLineFromSeries
  });
  const laborPaletteChartData = buildLaborPaletteChartData(
    baseFilteredLaborRows,
    activeLaborPaletteGroupField.value,
    activeLaborPaletteColorField.value,
    selectedDateRange
  );
  const laborParetoChartData = buildLaborParetoChartData(
    baseFilteredLaborRows,
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
  const activeLaborNewChartFilterField =
    LABOR_NEW_CHART_FILTER_FIELDS.find(
      (option) => option.value === selectedLaborNewChartFilterField
    ) ?? LABOR_NEW_CHART_FILTER_FIELDS[0];
  const laborNewPaletteGroupFieldOptions = LABOR_NEW_PALETTE_FIELDS.filter(
    (option) => option.value !== selectedLaborNewPaletteColorField
  );
  const activeLaborNewPaletteGroupField =
    laborNewPaletteGroupFieldOptions.find(
      (option) => option.value === selectedLaborNewPaletteGroupField
    ) ?? laborNewPaletteGroupFieldOptions[0] ?? LABOR_NEW_PALETTE_FIELDS[0];
  const laborNewPaletteColorFieldOptions = LABOR_NEW_PALETTE_FIELDS.filter(
    (option) => option.value !== activeLaborNewPaletteGroupField.value
  );
  const activeLaborNewPaletteColorField =
    laborNewPaletteColorFieldOptions.find(
      (option) => option.value === selectedLaborNewPaletteColorField
    ) ?? laborNewPaletteColorFieldOptions[0] ?? LABOR_NEW_PALETTE_FIELDS[1];
  const baseFilteredLaborNewRows = applyGlobalFilters(
    laborNewState.rows,
    'laborNew',
    activeGlobalFilters
  );
  const laborNewChartFilterValueOptions = getFilterOptions(
    baseFilteredLaborNewRows,
    activeLaborNewChartFilterField.value
  );
  const activeLaborNewChartFilterValue = normalizeFilterValues(
    selectedLaborNewChartFilterValue,
    laborNewChartFilterValueOptions
  );
  const laborNewFilterApplies = ['line', 'bar'].includes(chartVariants.laborNew);
  const filteredLaborNewRows = baseFilteredLaborNewRows.filter((row) => {
    if (!laborNewFilterApplies) {
      return true;
    }

    return rowMatchesFilterValues(
      row[activeLaborNewChartFilterField.value],
      activeLaborNewChartFilterValue
    );
  });
  const visibleLaborNewRows = filteredLaborNewRows.filter((row) =>
    isStampWithinDateRange(getLaborNewRowStamp(row), selectedDateRange)
  );
  const laborNewChartData = buildLaborUtilizationNewChartData(
    filteredLaborNewRows,
    laborNewViewMode,
    selectedDateRange
  );
  const laborNewOverallHours = sumNumericValues(laborNewChartData.totals);
  const laborNewOverallDirectHours = sumNumericValues(laborNewChartData.direct);
  const laborNewSummaryValue = laborNewOverallHours > 0
    ? formatPercentValue(laborNewOverallDirectHours / laborNewOverallHours)
    : '--';
  const laborNewGoalForecastSeriesValues = laborNewChartData.directShare.filter(
    (_value, index) => laborNewChartData.totals[index] > 0
  );
  const laborNewGoalCalculation = useCalculatedMetricGoalLine({
    metricKey: 'labor-new',
    timeline: laborNewViewMode,
    seriesValues: laborNewGoalForecastSeriesValues,
    loading: laborNewState.loading,
    error: laborNewState.error,
    calculateGoalLine: forecastLaborGoalLineFromSeries
  });
  const laborNewPaletteChartData = buildLaborUtilizationNewPaletteChartData(
    baseFilteredLaborNewRows,
    activeLaborNewPaletteGroupField.value,
    activeLaborNewPaletteColorField.value,
    selectedDateRange
  );
  const laborNewParetoChartData = buildLaborUtilizationNewParetoChartData(
    baseFilteredLaborNewRows,
    activeLaborNewChartFilterField.value,
    selectedDateRange
  );
  const isLaborNewPalette = chartVariants.laborNew === 'palette';
  const isLaborNewPareto = chartVariants.laborNew === 'pareto';
  const isLaborNewBarChart = chartVariants.laborNew === 'bar';
  const laborNewChartSeries = [
    {
      id: 'directShareNew',
      data: laborNewChartData.directShare,
      label: 'Direct labor share',
      color: 'var(--chart-line)',
      valueFormatter: formatPercentValue,
      showMark: false
    }
  ];
  const activeLaborHanaChartFilterField =
    LABOR_HANA_CHART_FILTER_FIELDS.find(
      (option) => option.value === selectedLaborHanaChartFilterField
    ) ?? LABOR_HANA_CHART_FILTER_FIELDS[0];
  const laborHanaPaletteGroupFieldOptions = LABOR_HANA_PALETTE_FIELDS.filter(
    (option) => option.value !== selectedLaborHanaPaletteColorField
  );
  const activeLaborHanaPaletteGroupField =
    laborHanaPaletteGroupFieldOptions.find(
      (option) => option.value === selectedLaborHanaPaletteGroupField
    ) ?? laborHanaPaletteGroupFieldOptions[0] ?? LABOR_HANA_PALETTE_FIELDS[0];
  const laborHanaPaletteColorFieldOptions = LABOR_HANA_PALETTE_FIELDS.filter(
    (option) => option.value !== activeLaborHanaPaletteGroupField.value
  );
  const activeLaborHanaPaletteColorField =
    laborHanaPaletteColorFieldOptions.find(
      (option) => option.value === selectedLaborHanaPaletteColorField
    ) ?? laborHanaPaletteColorFieldOptions[0] ?? LABOR_HANA_PALETTE_FIELDS[1];
  const baseFilteredLaborHanaRows = applyGlobalFilters(
    laborHanaState.rows,
    'laborHana',
    activeGlobalFilters
  );
  const laborHanaChartFilterValueOptions = getFilterOptions(
    baseFilteredLaborHanaRows,
    activeLaborHanaChartFilterField.value
  );
  const activeLaborHanaChartFilterValue = normalizeFilterValues(
    selectedLaborHanaChartFilterValue,
    laborHanaChartFilterValueOptions
  );
  const laborHanaFilterApplies = ['line', 'bar'].includes(chartVariants.laborHana);
  const filteredLaborHanaRows = baseFilteredLaborHanaRows.filter((row) => {
    if (!laborHanaFilterApplies) {
      return true;
    }

    return (
      rowMatchesFilterValues(
        row[activeLaborHanaChartFilterField.value],
        activeLaborHanaChartFilterValue
      )
    );
  });
  const laborHanaChartData = buildLaborUtilizationChartData(
    filteredLaborHanaRows,
    laborHanaViewMode,
    selectedDateRange
  );
  const laborHanaOverallHours = sumNumericValues(laborHanaChartData.totals);
  const laborHanaOverallDirectHours = sumNumericValues(laborHanaChartData.direct);
  const laborHanaSummaryValue = laborHanaOverallHours > 0
    ? formatPercentValue(laborHanaOverallDirectHours / laborHanaOverallHours)
    : '--';
  const laborHanaGoalForecastData = laborHanaChartData;
  const laborHanaGoalForecastSeriesValues = laborHanaGoalForecastData.directShare.filter(
    (_value, index) => laborHanaGoalForecastData.totals[index] > 0
  );
  const laborHanaGoalCalculation = useCalculatedMetricGoalLine({
    metricKey: 'labor-hana',
    timeline: laborHanaViewMode,
    seriesValues: laborHanaGoalForecastSeriesValues,
    loading: laborHanaState.loading,
    error: laborHanaState.error,
    calculateGoalLine: forecastLaborHanaGoalLineFromSeries
  });
  const laborHanaPaletteChartData = buildLaborPaletteChartData(
    baseFilteredLaborHanaRows,
    activeLaborHanaPaletteGroupField.value,
    activeLaborHanaPaletteColorField.value,
    selectedDateRange
  );
  const laborHanaParetoChartData = buildLaborParetoChartData(
    baseFilteredLaborHanaRows,
    activeLaborHanaChartFilterField.value,
    selectedDateRange
  );
  const isLaborHanaPalette = chartVariants.laborHana === 'palette';
  const isLaborHanaPareto = chartVariants.laborHana === 'pareto';
  const isLaborHanaBarChart = chartVariants.laborHana === 'bar';
  const laborHanaChartSeries = [
    {
      id: 'directShareHana',
      data: laborHanaChartData.directShare,
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
  const controllableCostsNewTooltipLegend = isControllableCostsNewPalette
    ? buildTooltipLegend(
      `Color by ${activeControllableNewPaletteColorField.label}`,
      controllableCostsNewPaletteChartData.series
    )
    : null;
  const controllableCostsHanaTooltipLegend = isControllableCostsHanaPalette
    ? buildTooltipLegend(
      `Color by ${activeControllableHanaPaletteColorField.label}`,
      controllableCostsHanaPaletteChartData.series
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
  const laborNewTooltipLegend = isLaborNewPalette
    ? buildTooltipLegend(
      `Color by ${activeLaborNewPaletteColorField.label}`,
      laborNewPaletteChartData.series
    )
    : null;
  const laborHanaTooltipLegend = isLaborHanaPalette
    ? buildTooltipLegend(
      `Color by ${activeLaborHanaPaletteColorField.label}`,
      laborHanaPaletteChartData.series
    )
    : null;
  const paretoCumulativeLegendItem = {
    label: 'Cumulative share',
    color: 'var(--chart-accent-line)'
  };
  const controllableCostsOverviewLegend = isControllableCostsPalette
    ? []
    : isControllableCostsPareto
      ? [
        { label: 'Total cost', color: 'var(--chart-line)' },
        paretoCumulativeLegendItem
      ]
      : [
        { label: 'Controllable', color: 'var(--chart-line)' },
        { label: 'Uncontrollable', color: 'var(--chart-accent-line)' }
      ];
  const controllableCostsNewOverviewLegend = isControllableCostsNewPalette
    ? []
    : isControllableCostsNewPareto
      ? [
        { label: 'Total cost', color: 'var(--chart-line)' },
        paretoCumulativeLegendItem
      ]
      : [
        { label: 'Controllable', color: 'var(--chart-line)' },
        { label: 'Uncontrollable', color: 'var(--chart-accent-line)' }
      ];
  const controllableCostsHanaOverviewLegend = isControllableCostsHanaPalette
    ? []
    : isControllableCostsHanaPareto
      ? [
        { label: 'Total cost', color: 'var(--chart-line)' },
        paretoCumulativeLegendItem
      ]
      : [{ label: 'Total cost', color: 'var(--chart-line)' }];
  const sifOverviewLegend = isSifPalette
    ? []
    : isSifPareto
      ? [
        { label: 'SIF incidents', color: 'var(--chart-line)' },
        paretoCumulativeLegendItem
      ]
      : [{ label: 'SIF incidents', color: 'var(--chart-line)' }];
  const potentialSifOverviewLegend = isPotentialSifPalette
    ? []
    : isPotentialSifPareto
      ? [
        { label: 'Potential SIFs', color: 'var(--chart-line)' },
        paretoCumulativeLegendItem
      ]
      : [{ label: 'Potential SIFs', color: 'var(--chart-line)' }];
  const nmfrOverviewLegend = isNmfrPalette
    ? []
    : isNmfrPareto
      ? [
        { label: 'NMFR', color: 'var(--chart-line)' },
        paretoCumulativeLegendItem
      ]
      : [{ label: 'NMFR', color: 'var(--chart-line)' }];
  const otdOverviewLegend = isOtdPalette
    ? []
    : isOtdPareto
      ? [
        { label: 'Actuals delivered', color: 'var(--chart-line)' },
        paretoCumulativeLegendItem
      ]
      : isOtdBarChart
        ? [
          { label: 'Contract commitment', color: 'var(--chart-line)' },
          { label: 'Actuals delivered', color: 'var(--chart-secondary-line)' }
        ]
        : [{ label: 'Percent delivered', color: 'var(--chart-line)' }];
  const laborOverviewLegend = isLaborPalette
    ? []
    : isLaborPareto
      ? [
        { label: 'Direct hours', color: 'var(--chart-line)' },
        paretoCumulativeLegendItem
      ]
      : [{ label: 'Direct labor share', color: 'var(--chart-line)' }];
  const laborNewOverviewLegend = isLaborNewPalette
    ? []
    : isLaborNewPareto
      ? [
        { label: 'Direct hours', color: 'var(--chart-line)' },
        paretoCumulativeLegendItem
      ]
      : [{ label: 'Direct labor share', color: 'var(--chart-line)' }];
  const laborHanaOverviewLegend = isLaborHanaPalette
    ? []
    : isLaborHanaPareto
      ? [
        { label: 'Direct hours', color: 'var(--chart-line)' },
        paretoCumulativeLegendItem
      ]
      : [{ label: 'Direct labor share', color: 'var(--chart-line)' }];
  const controllableCostsGoalLine = labelGoalLineValue(
    isControllableCostsPareto || isControllableCostsPalette
      ? null
      : getMetricGoalLine('controllableCosts', controllableCostsViewMode),
    formatCompactCurrency
  );
  const controllableCostsMetricInfo = buildControllableCostsMetricInfo(
    METRIC_INFO.controllableCosts,
    {
      ...controllableCostsGoalCalculation.goalLine,
      status: controllableCostsGoalCalculation.status,
      observationCount: controllableCostsGoalCalculation.observationCount,
      requiredObservations: CALCULATED_GOAL_MIN_OBSERVATIONS,
      timelineLabel: CONTROLLABLE_COSTS_VIEW_CONFIG[controllableCostsViewMode]?.label
    }
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
  const controllableCostsNewGoalLine = labelGoalLineValue(
    isControllableCostsNewPareto || isControllableCostsNewPalette
      ? null
      : getMetricGoalLine('controllableCostsNew', controllableCostsNewViewMode),
    formatCompactCurrency
  );
  const controllableCostsNewMetricInfo = buildControllableCostsMetricInfo(
    METRIC_INFO.controllableCostsNew,
    {
      ...controllableCostsNewGoalCalculation.goalLine,
      status: controllableCostsNewGoalCalculation.status,
      observationCount: controllableCostsNewGoalCalculation.observationCount,
      requiredObservations: CALCULATED_GOAL_MIN_OBSERVATIONS,
      timelineLabel: CONTROLLABLE_COSTS_NEW_VIEW_CONFIG[controllableCostsNewViewMode]?.label
    }
  );
  const visibleControllableCostsNewGoalLine = clampGoalLineToVisibleSeries(
    controllableCostsNewGoalLine,
    [controllableCostsNewChartData.controllable, controllableCostsNewChartData.uncontrollable]
  );
  const controllableCostsNewChartYAxis = buildDynamicNumericYAxis(
    CONTROLLABLE_COSTS_Y_AXIS,
    [controllableCostsNewChartData.controllable, controllableCostsNewChartData.uncontrollable],
    {
      includeZero: chartVariants.controllableCostsNew === 'bar',
      goalLine: visibleControllableCostsNewGoalLine
    }
  );
  const controllableCostsHanaGoalLine = labelGoalLineValue(
    isControllableCostsHanaPareto || isControllableCostsHanaPalette
      ? null
      : getMetricGoalLine('controllableCostsHana', controllableCostsHanaViewMode),
    formatCompactCurrency
  );
  const controllableCostsHanaMetricInfo = buildControllableCostsMetricInfo(
    METRIC_INFO.controllableCostsHana,
    {
      ...controllableCostsHanaGoalCalculation.goalLine,
      status: controllableCostsHanaGoalCalculation.status,
      observationCount: controllableCostsHanaGoalCalculation.observationCount,
      requiredObservations: CALCULATED_GOAL_MIN_OBSERVATIONS,
      timelineLabel: CONTROLLABLE_COSTS_HANA_VIEW_CONFIG[controllableCostsHanaViewMode]?.label
    }
  );
  const visibleControllableCostsHanaGoalLine = clampGoalLineToVisibleSeries(
    controllableCostsHanaGoalLine,
    [controllableCostsHanaChartData.total]
  );
  const controllableCostsHanaChartYAxis = buildDynamicNumericYAxis(
    CONTROLLABLE_COSTS_Y_AXIS,
    [controllableCostsHanaChartData.total],
    {
      includeZero: chartVariants.controllableCostsHana === 'bar',
      goalLine: visibleControllableCostsHanaGoalLine
    }
  );
  const sifGoalLine = labelGoalLineValue(
    getMetricGoalLine(
      'sif',
      isSifPareto || isSifPalette ? null : sifViewMode
    ),
    formatIncidentCount
  );
  const potentialSifGoalLine = labelGoalLineValue(
    getMetricGoalLine(
      'potentialSif',
      isPotentialSifPareto || isPotentialSifPalette ? null : potentialSifViewMode
    ),
    formatIncidentCount
  );
  const nmfrMetricInfo = buildNmfrMetricInfo(METRIC_INFO.nmfr, {
    ...nmfrGoalCalculation.goalLine,
    status: nmfrGoalCalculation.status,
    forecastMonthLabel: nmfrForecastPeriodLabel,
    observationCount: nmfrGoalCalculation.observationCount,
    requiredObservations: CALCULATED_GOAL_MIN_OBSERVATIONS,
    timelineLabel: INCIDENT_VIEW_CONFIG[nmfrViewMode]?.label
  });
  const nmfrBaseGoalLine = isNmfrPareto || isNmfrPalette
    ? null
    : getMetricGoalLine('nmfr', nmfrViewMode);
  const visibleNmfrGoalLine = clampGoalLineToVisibleSeries(
    nmfrBaseGoalLine,
    [nmfrChartData.map((bucket) => bucket.total)]
  );
  const labeledNmfrGoalLine = labelGoalLineValue(visibleNmfrGoalLine, formatNumber);
  const nmfrChartYAxis = buildDynamicNumericYAxis(
    NMFR_Y_AXIS,
    [nmfrChartData.map((bucket) => bucket.total)],
    {
      includeZero: chartVariants.nmfr === 'bar',
      goalLine: labeledNmfrGoalLine,
      minFloor: 0
    }
  );
  const laborGoalLine = labelGoalLineValue(
    isLaborPareto || isLaborPalette ? null : getMetricGoalLine('labor', laborViewMode),
    formatPercentValue
  );
  const laborMetricInfo = buildLaborMetricInfo(METRIC_INFO.labor, {
    ...laborGoalCalculation.goalLine,
    status: laborGoalCalculation.status,
    observationCount: laborGoalCalculation.observationCount,
    requiredObservations: CALCULATED_GOAL_MIN_OBSERVATIONS,
    timelineLabel: LABOR_VIEW_CONFIG[laborViewMode]?.label
  });
  const laborNewGoalLine = labelGoalLineValue(
    isLaborNewPareto || isLaborNewPalette
      ? null
      : getMetricGoalLine('laborNew', laborNewViewMode),
    formatPercentValue
  );
  const laborNewMetricInfo = buildLaborMetricInfo(METRIC_INFO.laborNew, {
    ...laborNewGoalCalculation.goalLine,
    status: laborNewGoalCalculation.status,
    observationCount: laborNewGoalCalculation.observationCount,
    requiredObservations: CALCULATED_GOAL_MIN_OBSERVATIONS,
    timelineLabel: LABOR_VIEW_CONFIG[laborNewViewMode]?.label
  });
  const laborHanaBaseGoalLine = isLaborHanaPareto || isLaborHanaPalette
    ? null
    : getMetricGoalLine('laborHana', laborHanaViewMode);
  const laborHanaGoalLine = labelGoalLineValue(
    laborHanaBaseGoalLine,
    formatPercentValue
  );
  const laborHanaMetricInfo = buildLaborHanaMetricInfo(METRIC_INFO.laborHana, {
    ...laborHanaGoalCalculation.goalLine,
    status: laborHanaGoalCalculation.status,
    observationCount: laborHanaGoalCalculation.observationCount,
    requiredObservations: CALCULATED_GOAL_MIN_OBSERVATIONS,
    timelineLabel: LABOR_VIEW_CONFIG[laborHanaViewMode]?.label
  });
  const activeCardKeys = new Set(
    (CARD_CHIP_OPTIONS.find((cardGroup) => cardGroup.key === selectedCardGroup) ?? CARD_CHIP_OPTIONS[0])
      .cardKeys
  );
  const visibleCards = {
    controllableCosts: activeCardKeys.has('controllableCosts'),
    controllableCostsNew: activeCardKeys.has('controllableCostsNew'),
    controllableCostsHana:
      CONTROLLABLE_COSTS_HANA_CARD_ENABLED && activeCardKeys.has('controllableCostsHana'),
    sif: activeCardKeys.has('sif'),
    potentialSif: activeCardKeys.has('potentialSif'),
    nmfr: activeCardKeys.has('nmfr'),
    otd: activeCardKeys.has('otd'),
    labor: activeCardKeys.has('labor'),
    laborNew: activeCardKeys.has('laborNew'),
    laborHana: LABOR_HANA_CARD_ENABLED && activeCardKeys.has('laborHana')
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
      controllableCostsNew: nextVariant,
      controllableCostsHana: nextVariant,
      sif: nextVariant,
      potentialSif: nextVariant,
      nmfr: nextVariant,
      otd: nextVariant,
      labor: nextVariant,
      laborNew: nextVariant,
      laborHana: nextVariant
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

    setGlobalFilters(normalizeGlobalFilters(presetState.globalFilters));

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

    if (
      Object.hasOwn(
        CONTROLLABLE_COSTS_NEW_VIEW_CONFIG,
        presetState.controllableCostsNew?.viewMode
      )
    ) {
      setControllableCostsNewViewMode(presetState.controllableCostsNew.viewMode);
    }

    if (
      Object.hasOwn(
        CONTROLLABLE_COSTS_HANA_VIEW_CONFIG,
        presetState.controllableCostsHana?.viewMode
      )
    ) {
      setControllableCostsHanaViewMode(presetState.controllableCostsHana.viewMode);
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
      coerceFilterValues(presetState.sif?.filterValue)
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
      coerceFilterValues(presetState.potentialSif?.filterValue)
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
      coerceFilterValues(presetState.nmfr?.filterValue)
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

    if (Object.hasOwn(LABOR_VIEW_CONFIG, presetState.laborNew?.viewMode)) {
      setLaborNewViewMode(presetState.laborNew.viewMode);
    }

    if (Object.hasOwn(LABOR_VIEW_CONFIG, presetState.laborHana?.viewMode)) {
      setLaborHanaViewMode(presetState.laborHana.viewMode);
    }

    if (
      CONTROLLABLE_CHART_FILTER_FIELDS.some(
        (option) => option.value === presetState.controllableCosts?.filterField
      )
    ) {
      setSelectedControllableChartFilterField(presetState.controllableCosts.filterField);
    }

    setSelectedControllableChartFilterValue(
      coerceFilterValues(presetState.controllableCosts?.filterValue)
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
      CONTROLLABLE_NEW_CHART_FILTER_FIELDS.some(
        (option) => option.value === presetState.controllableCostsNew?.filterField
      )
    ) {
      setSelectedControllableNewChartFilterField(
        presetState.controllableCostsNew.filterField
      );
    }

    setSelectedControllableNewChartFilterValue(
      coerceFilterValues(presetState.controllableCostsNew?.filterValue)
    );

    if (
      CONTROLLABLE_NEW_PALETTE_FIELDS.some(
        (option) => option.value === presetState.controllableCostsNew?.paletteGroupField
      )
    ) {
      setSelectedControllableNewPaletteGroupField(
        presetState.controllableCostsNew.paletteGroupField
      );
    }

    if (
      CONTROLLABLE_NEW_PALETTE_FIELDS.some(
        (option) => option.value === presetState.controllableCostsNew?.paletteColorField
      )
    ) {
      setSelectedControllableNewPaletteColorField(
        presetState.controllableCostsNew.paletteColorField
      );
    }

    if (
      CONTROLLABLE_HANA_CHART_FILTER_FIELDS.some(
        (option) => option.value === presetState.controllableCostsHana?.filterField
      )
    ) {
      setSelectedControllableHanaChartFilterField(
        presetState.controllableCostsHana.filterField
      );
    }

    setSelectedControllableHanaChartFilterValue(
      coerceFilterValues(presetState.controllableCostsHana?.filterValue)
    );

    if (
      CONTROLLABLE_HANA_PALETTE_FIELDS.some(
        (option) => option.value === presetState.controllableCostsHana?.paletteGroupField
      )
    ) {
      setSelectedControllableHanaPaletteGroupField(
        presetState.controllableCostsHana.paletteGroupField
      );
    }

    if (
      CONTROLLABLE_HANA_PALETTE_FIELDS.some(
        (option) => option.value === presetState.controllableCostsHana?.paletteColorField
      )
    ) {
      setSelectedControllableHanaPaletteColorField(
        presetState.controllableCostsHana.paletteColorField
      );
    }

    if (
      OTD_CHART_FILTER_FIELDS.some((option) => option.value === presetState.otd?.filterField)
    ) {
      setSelectedOtdChartFilterField(presetState.otd.filterField);
    }

    setSelectedOtdChartFilterValue(
      coerceFilterValues(presetState.otd?.filterValue)
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
      coerceFilterValues(presetState.labor?.filterValue)
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

    if (
      LABOR_NEW_CHART_FILTER_FIELDS.some(
        (option) => option.value === presetState.laborNew?.filterField
      )
    ) {
      setSelectedLaborNewChartFilterField(presetState.laborNew.filterField);
    }

    setSelectedLaborNewChartFilterValue(
      coerceFilterValues(presetState.laborNew?.filterValue)
    );

    if (
      LABOR_NEW_PALETTE_FIELDS.some(
        (option) => option.value === presetState.laborNew?.paletteGroupField
      )
    ) {
      setSelectedLaborNewPaletteGroupField(presetState.laborNew.paletteGroupField);
    }

    if (
      LABOR_NEW_PALETTE_FIELDS.some(
        (option) => option.value === presetState.laborNew?.paletteColorField
      )
    ) {
      setSelectedLaborNewPaletteColorField(presetState.laborNew.paletteColorField);
    }

    if (
      LABOR_HANA_CHART_FILTER_FIELDS.some(
        (option) => option.value === presetState.laborHana?.filterField
      )
    ) {
      setSelectedLaborHanaChartFilterField(presetState.laborHana.filterField);
    }

    setSelectedLaborHanaChartFilterValue(
      coerceFilterValues(presetState.laborHana?.filterValue)
    );

    if (
      LABOR_HANA_PALETTE_FIELDS.some(
        (option) => option.value === presetState.laborHana?.paletteGroupField
      )
    ) {
      setSelectedLaborHanaPaletteGroupField(presetState.laborHana.paletteGroupField);
    }

    if (
      LABOR_HANA_PALETTE_FIELDS.some(
        (option) => option.value === presetState.laborHana?.paletteColorField
      )
    ) {
      setSelectedLaborHanaPaletteColorField(presetState.laborHana.paletteColorField);
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
        globalFilters: activeGlobalFilters,
        chartVariants,
        controllableCostsViewMode,
        selectedControllableChartFilterField,
        selectedControllableChartFilterValue,
        selectedControllablePaletteGroupField,
        selectedControllablePaletteColorField,
        controllableCostsNewViewMode,
        selectedControllableNewChartFilterField,
        selectedControllableNewChartFilterValue,
        selectedControllableNewPaletteGroupField,
        selectedControllableNewPaletteColorField,
        controllableCostsHanaViewMode,
        selectedControllableHanaChartFilterField,
        selectedControllableHanaChartFilterValue,
        selectedControllableHanaPaletteGroupField,
        selectedControllableHanaPaletteColorField,
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
        laborNewViewMode,
        selectedLaborNewChartFilterField,
        selectedLaborNewChartFilterValue,
        selectedLaborNewPaletteGroupField,
        selectedLaborNewPaletteColorField,
        laborHanaViewMode,
        selectedLaborHanaChartFilterField,
        selectedLaborHanaChartFilterValue,
        selectedLaborHanaPaletteGroupField,
        selectedLaborHanaPaletteColorField,
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
              <div className="dashboard-toolbar">
                <div className="global-date-filter">
                  <div className="global-date-filter-control">
                    <div className="global-date-filter-slider-column">
                      <p className="global-date-filter-label">Date range</p>
                      {availableTimelineStamps.length > 0 ? (
                        <div className="global-date-filter-slider-region">
                          <div className="global-date-filter-track">
                            <Slider
                              className="global-date-filter-slider"
                              value={activeDateRangeIndices}
                              min={0}
                              max={maximumDateIndex}
                              step={1}
                              marks={dateSliderMarks}
                              disableSwap
                              valueLabelDisplay="auto"
                              valueLabelFormat={formatDateSliderValue}
                              getAriaValueText={formatDateSliderValue}
                              onChange={(_event, nextValue) => {
                                if (Array.isArray(nextValue)) {
                                  setSelectedDateRangeIndices(nextValue);
                                  setHasCustomizedDateRange(true);
                                }
                              }}
                              sx={dateSliderSx}
                            />
                          </div>
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

                <div className="toolbar-navigation-row">
                  <label className="mobile-group-selector">
                    <span className="mobile-group-selector-label">Category</span>
                    <select
                      className="mobile-group-selector-input"
                      value={selectedCardGroup}
                      onChange={(event) => {
                        setSelectedCardGroup(event.target.value);
                      }}
                    >
                      {CARD_CHIP_OPTIONS.map((cardGroup) => (
                        <option key={cardGroup.key} value={cardGroup.key}>
                          {cardGroup.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="card-chip-panel" role="navigation" aria-label="Metric groups">
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
                </div>

                <div className="toolbar-utility-zone">
                  <button
                    type="button"
                    className={`global-filter-toggle${isGlobalFiltersOpen ? ' global-filter-toggle-active' : ''}`}
                    aria-expanded={isGlobalFiltersOpen}
                    aria-controls="global-filter-tray"
                    onClick={() => {
                      setIsGlobalFiltersOpen((currentValue) => !currentValue);
                      setIsUtilityPanelOpen(false);
                    }}
                  >
                    <FontAwesomeIcon icon={faFilter} className="toolbar-button-icon" />
                    <span className="global-filter-toggle-label">
                      <span className="global-filter-toggle-label-wide">Global </span>
                      Filters
                    </span>
                    {activeGlobalFilterCount > 0 && (
                      <span className="global-filter-count" aria-label={`${activeGlobalFilterCount} active filters`}>
                        {activeGlobalFilterCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    className={`toolbar-more-button${isUtilityPanelOpen ? ' toolbar-more-button-active' : ''}`}
                    aria-expanded={isUtilityPanelOpen}
                    aria-controls="dashboard-utility-controls"
                    onClick={() => {
                      setIsUtilityPanelOpen((currentValue) => !currentValue);
                      setIsGlobalFiltersOpen(false);
                    }}
                  >
                    <FontAwesomeIcon icon={faEllipsis} className="toolbar-button-icon" />
                    <span className="toolbar-more-label">More</span>
                  </button>

                  <div
                    id="dashboard-utility-controls"
                    className={`display-controls${isUtilityPanelOpen ? ' display-controls-open' : ''}`}
                    aria-label="Display controls"
                  >
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
            </div>

            {isGlobalFiltersOpen && (
              <>
                <button
                  type="button"
                  className="global-filter-backdrop"
                  aria-label="Close global filters"
                  onClick={() => {
                    setIsGlobalFiltersOpen(false);
                  }}
                />
                <section
                  id="global-filter-tray"
                  className="global-filter-tray"
                  role="dialog"
                  aria-labelledby="global-filter-tray-title"
                >
                  <div className="global-filter-tray-heading">
                    <div>
                      <p className="global-filter-tray-eyebrow">Dashboard-wide</p>
                      <h2 id="global-filter-tray-title" className="global-filter-tray-title">
                        Global Filters
                      </h2>
                    </div>
                    <div className="global-filter-tray-actions">
                      <button
                        type="button"
                        className="global-filter-clear-button"
                        disabled={activeGlobalFilterCount === 0}
                        onClick={() => {
                          setGlobalFilters(createEmptyGlobalFilters());
                        }}
                      >
                        Reset all
                      </button>
                      <button
                        type="button"
                        className="global-filter-close-button"
                        onClick={() => {
                          setIsGlobalFiltersOpen(false);
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div className="global-filter-sheet-body">
                    <div className="global-filter-fields">
                      {GLOBAL_FILTER_DIMENSIONS.map((dimension) => (
                        <GlobalFilterField
                          key={dimension.key}
                          dimension={dimension}
                          options={globalFilterOptions[dimension.key]}
                          value={activeGlobalFilters[dimension.key]}
                          onChange={(nextValues) => {
                            setGlobalFilters((currentFilters) => ({
                              ...currentFilters,
                              [dimension.key]: nextValues
                            }));
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}

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
                  info={controllableCostsMetricInfo}
                  tooltipLegend={controllableCostsTooltipLegend}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <MetricOverviewBand
                      value={
                        controllableCostsState.loading || controllableCostsState.error
                          ? '--'
                          : controllableCostsSummaryValue
                      }
                      label="Total Cost"
                      forecastValue={formatForecastValue(
                        controllableCostsGoalCalculation,
                        formatOverviewCurrency
                      )}
                      legendItems={controllableCostsOverviewLegend}
                      ariaLabel="Controllable costs overview"
                    />
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
                              yAxis={controllableCostsPaletteChartYAxis}
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
                            setSelectedControllableChartFilterValue([]);
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

            {visibleCards.controllableCostsNew && (
              <article className="analytics-card" style={{ order: 2 }}>
                <CardHeader
                  title="Controllable Costs — New Data"
                  info={controllableCostsNewMetricInfo}
                  tooltipLegend={controllableCostsNewTooltipLegend}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <MetricOverviewBand
                      value={
                        controllableCostsNewState.loading || controllableCostsNewState.error
                          ? '--'
                          : controllableCostsNewSummaryValue
                      }
                      label="Total Cost"
                      forecastValue={formatForecastValue(
                        controllableCostsNewGoalCalculation,
                        formatOverviewCurrency
                      )}
                      legendItems={controllableCostsNewOverviewLegend}
                      ariaLabel="New controllable costs dataset overview"
                    />
                    <div ref={controllableCostsNewChartHostRef} className="chart-host">
                      {controllableCostsNewState.loading && (
                        <p className="chart-message">Loading new controllable costs workbook...</p>
                      )}

                      {!controllableCostsNewState.loading && controllableCostsNewState.error && (
                        <p className="chart-message chart-message-error">
                          {controllableCostsNewState.error}
                        </p>
                      )}

                      {!controllableCostsNewState.loading
                        && !controllableCostsNewState.error
                        && (baseFilteredControllableCostsNewRows.length === 0
                          || (isControllableCostsNewPareto
                            ? controllableCostsNewParetoChartData.labels.length === 0
                            : isControllableCostsNewPalette
                              ? controllableCostsNewPaletteChartData.labels.length === 0
                              : globallyFilteredControllableCostsNewRows.length === 0)) && (
                          <p className="chart-message">
                            {controllableCostsNewState.rows.length === 0
                              ? 'No rows were loaded from the new controllable costs workbook.'
                              : filteredControllableCostsNewRows.length === 0
                                  && controllableNewFilterApplies
                                ? 'No new controllable cost rows match the selected filters.'
                                : 'No new controllable cost rows fall within the selected date range.'}
                          </p>
                        )}

                      {!controllableCostsNewState.loading
                        && !controllableCostsNewState.error
                        && (isControllableCostsNewPareto
                          ? controllableCostsNewParetoChartData.labels.length > 0
                          : isControllableCostsNewPalette
                            ? controllableCostsNewPaletteChartData.labels.length > 0
                            : controllableCostsNewChartData.labels.length > 0)
                        && controllableCostsNewChartWidth > 0 && (
                          isControllableCostsNewPareto ? (
                            <ParetoMetricChart
                              width={controllableCostsNewChartWidth}
                              height={CHART_HEIGHT}
                              margin={DEFAULT_CHART_MARGIN}
                              labels={controllableCostsNewParetoChartData.labels}
                              values={controllableCostsNewParetoChartData.values}
                              cumulativeShares={controllableCostsNewParetoChartData.cumulativeShares}
                              barLabel="Total cost"
                              barColor="var(--chart-line)"
                              barAxis={CONTROLLABLE_COSTS_Y_AXIS}
                              barValueFormatter={formatCurrency}
                              goalLine={visibleControllableCostsNewGoalLine}
                              sx={sharedChartSx}
                            />
                          ) : isControllableCostsNewPalette ? (
                            <StackedCategoryBarChart
                              width={controllableCostsNewChartWidth}
                              height={CHART_HEIGHT}
                              margin={DEFAULT_CHART_MARGIN}
                              labels={controllableCostsNewPaletteChartData.labels}
                              yAxis={controllableCostsNewPaletteChartYAxis}
                              series={controllableCostsNewPaletteChartData.series.map(
                                (seriesItem) => ({
                                  ...seriesItem,
                                  valueFormatter: formatCurrency
                                })
                              )}
                              sx={sharedChartSx}
                            />
                          ) : (
                            <MetricTrendChart
                              variant={
                                chartVariants.controllableCostsNew === 'bar' ? 'bar' : 'line'
                              }
                              width={controllableCostsNewChartWidth}
                              height={CHART_HEIGHT}
                              margin={DEFAULT_CHART_MARGIN}
                              labels={controllableCostsNewChartData.labels}
                              yAxis={controllableCostsNewChartYAxis}
                              series={[
                                {
                                  data: controllableCostsNewChartData.controllable,
                                  label: 'Controllable',
                                  color: 'var(--chart-line)',
                                  valueFormatter: formatCurrency,
                                  showMark: controllableCostsNewChartData.labels.length <= 1
                                },
                                {
                                  data: controllableCostsNewChartData.uncontrollable,
                                  label: 'Uncontrollable',
                                  color: 'var(--chart-accent-line)',
                                  valueFormatter: formatCurrency,
                                  showMark: controllableCostsNewChartData.labels.length <= 1
                                }
                              ]}
                              goalLine={visibleControllableCostsNewGoalLine}
                              sx={sharedChartSx}
                            />
                          )
                        )}
                    </div>

                    <div className="chart-control-row chart-control-row-single">
                      <div className="chart-control-row-toggle">
                        <ChartTypeToggle
                          value={chartVariants.controllableCostsNew}
                          onChange={(nextVariant) => {
                            if (nextVariant === 'pareto') {
                              setSelectedControllableNewChartFilterField(
                                CONTROLLABLE_NEW_PARETO_FILTER_FIELDS[0].value
                              );
                            }

                            setChartVariants((currentValue) => ({
                              ...currentValue,
                              controllableCostsNew: nextVariant
                            }));
                          }}
                          alwaysGridToggle
                          supportsFilter
                          supportsPalette
                          supportsPareto
                          filterToggleAriaLabel="New controllable costs time series"
                          filterFieldValue={activeControllableNewChartFilterField.value}
                          filterFieldOptions={CONTROLLABLE_NEW_CHART_FILTER_FIELDS}
                          paretoFieldOptions={CONTROLLABLE_NEW_PARETO_FILTER_FIELDS}
                          filterFieldAriaLabel="Select new controllable costs filter field"
                          onFilterFieldChange={(nextField) => {
                            setSelectedControllableNewChartFilterField(nextField);
                            setSelectedControllableNewChartFilterValue([]);
                          }}
                          filterValue={activeControllableNewChartFilterValue}
                          filterValueOptions={controllableNewChartFilterValueOptions}
                          filterValueAllLabel={activeControllableNewChartFilterField.allLabel}
                          filterValueAriaLabel="Select new controllable costs filter value"
                          onFilterValueChange={setSelectedControllableNewChartFilterValue}
                          paletteToggleAriaLabel="New controllable costs grouped palette chart"
                          paletteGroupFieldValue={activeControllableNewPaletteGroupField.value}
                          paletteGroupFieldOptions={controllableNewPaletteGroupFieldOptions}
                          paletteGroupFieldAriaLabel="Select new controllable costs group field"
                          onPaletteGroupFieldChange={(nextField) => {
                            setSelectedControllableNewPaletteGroupField(nextField);

                            if (nextField === activeControllableNewPaletteColorField.value) {
                              const nextColorField =
                                CONTROLLABLE_NEW_PALETTE_FIELDS.find(
                                  (option) => option.value !== nextField
                                )?.value ?? nextField;

                              setSelectedControllableNewPaletteColorField(nextColorField);
                            }
                          }}
                          paletteColorFieldValue={activeControllableNewPaletteColorField.value}
                          paletteColorFieldOptions={controllableNewPaletteColorFieldOptions}
                          paletteColorFieldAriaLabel="Select new controllable costs color field"
                          onPaletteColorFieldChange={(nextField) => {
                            setSelectedControllableNewPaletteColorField(nextField);

                            if (nextField === activeControllableNewPaletteGroupField.value) {
                              const nextGroupField =
                                CONTROLLABLE_NEW_PALETTE_FIELDS.find(
                                  (option) => option.value !== nextField
                                )?.value ?? nextField;

                              setSelectedControllableNewPaletteGroupField(nextGroupField);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="chart-footer chart-footer-match-labor">
                      <ToggleButtonGroup
                        value={controllableCostsNewViewMode}
                        exclusive
                        fullWidth
                        onChange={(_event, nextMode) => {
                          if (nextMode) {
                            setControllableCostsNewViewMode(nextMode);
                          }
                        }}
                        sx={timelineToggleGroupSx}
                      >
                        {Object.entries(CONTROLLABLE_COSTS_NEW_VIEW_CONFIG).map(
                          ([mode, config]) => (
                            <ToggleButton key={mode} value={mode} sx={timelineToggleButtonSx}>
                              {config.label}
                            </ToggleButton>
                          )
                        )}
                      </ToggleButtonGroup>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {visibleCards.controllableCostsHana && (
              <article className="analytics-card" style={{ order: 2 }}>
                <CardHeader
                  title="Controllable Costs HANA"
                  info={controllableCostsHanaMetricInfo}
                  tooltipLegend={controllableCostsHanaTooltipLegend}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <MetricOverviewBand
                      value={
                        controllableCostsHanaState.loading || controllableCostsHanaState.error
                          ? '--'
                          : controllableCostsHanaSummaryValue
                      }
                      label="Total Cost"
                      forecastValue={formatForecastValue(
                        controllableCostsHanaGoalCalculation,
                        formatOverviewCurrency
                      )}
                      legendItems={controllableCostsHanaOverviewLegend}
                      ariaLabel="HANA controllable costs overview"
                    />
                    <div ref={controllableCostsHanaChartHostRef} className="chart-host">
                      {controllableCostsHanaState.loading && (
                        <p className="chart-message">Loading HANA cost data...</p>
                      )}

                      {!controllableCostsHanaState.loading && controllableCostsHanaState.error && (
                        <p className="chart-message chart-message-error">
                          {controllableCostsHanaState.error}
                        </p>
                      )}

                      {!controllableCostsHanaState.loading
                        && !controllableCostsHanaState.error
                        && (baseFilteredControllableCostsHanaRows.length === 0
                          || (isControllableCostsHanaPareto
                            ? controllableCostsHanaParetoChartData.labels.length === 0
                            : isControllableCostsHanaPalette
                              ? controllableCostsHanaPaletteChartData.labels.length === 0
                              : globallyFilteredControllableCostsHanaRows.length === 0)) && (
                          <p className="chart-message">
                            {controllableCostsHanaState.rows.length === 0
                              ? 'No HANA cost rows are available for charting.'
                              : filteredControllableCostsHanaRows.length === 0
                                  && controllableHanaFilterApplies
                                ? 'No HANA cost rows match the selected filters.'
                                : 'No HANA cost rows fall within the selected date range.'}
                          </p>
                        )}

                      {!controllableCostsHanaState.loading
                        && !controllableCostsHanaState.error
                        && (isControllableCostsHanaPareto
                          ? controllableCostsHanaParetoChartData.labels.length > 0
                          : isControllableCostsHanaPalette
                            ? controllableCostsHanaPaletteChartData.labels.length > 0
                            : controllableCostsHanaChartData.labels.length > 0)
                        && controllableCostsHanaChartWidth > 0 && (
                          isControllableCostsHanaPareto ? (
                            <ParetoMetricChart
                              width={controllableCostsHanaChartWidth}
                              height={CHART_HEIGHT}
                              margin={DEFAULT_CHART_MARGIN}
                              labels={controllableCostsHanaParetoChartData.labels}
                              values={controllableCostsHanaParetoChartData.values}
                              cumulativeShares={controllableCostsHanaParetoChartData.cumulativeShares}
                              barLabel="Total cost"
                              barColor="var(--chart-line)"
                              barAxis={CONTROLLABLE_COSTS_Y_AXIS}
                              barValueFormatter={formatCurrency}
                              goalLine={visibleControllableCostsHanaGoalLine}
                              sx={sharedChartSx}
                            />
                          ) : isControllableCostsHanaPalette ? (
                            <StackedCategoryBarChart
                              width={controllableCostsHanaChartWidth}
                              height={CHART_HEIGHT}
                              margin={DEFAULT_CHART_MARGIN}
                              labels={controllableCostsHanaPaletteChartData.labels}
                              yAxis={controllableCostsHanaPaletteChartYAxis}
                              series={controllableCostsHanaPaletteChartData.series.map(
                                (seriesItem) => ({
                                  ...seriesItem,
                                  valueFormatter: formatCurrency
                                })
                              )}
                              sx={sharedChartSx}
                            />
                          ) : (
                            <MetricTrendChart
                              variant={chartVariants.controllableCostsHana === 'bar' ? 'bar' : 'line'}
                              width={controllableCostsHanaChartWidth}
                              height={CHART_HEIGHT}
                              margin={DEFAULT_CHART_MARGIN}
                              labels={controllableCostsHanaChartData.labels}
                              yAxis={controllableCostsHanaChartYAxis}
                              series={[
                                {
                                  data: controllableCostsHanaChartData.total,
                                  label: 'Total Cost',
                                  color: 'var(--chart-line)',
                                  valueFormatter: formatCurrency,
                                  showMark: controllableCostsHanaChartData.labels.length <= 1
                                }
                              ]}
                              goalLine={visibleControllableCostsHanaGoalLine}
                              sx={sharedChartSx}
                            />
                          )
                        )}
                    </div>

                    <div className="chart-control-row chart-control-row-single">
                      <div className="chart-control-row-toggle">
                        <ChartTypeToggle
                          value={chartVariants.controllableCostsHana}
                          onChange={(nextVariant) => {
                            if (nextVariant === 'pareto') {
                              setSelectedControllableHanaChartFilterField(
                                CONTROLLABLE_HANA_PARETO_FILTER_FIELDS[0].value
                              );
                            }

                            setChartVariants((currentValue) => ({
                              ...currentValue,
                              controllableCostsHana: nextVariant
                            }));
                          }}
                          alwaysGridToggle
                          supportsFilter
                          supportsPalette
                          supportsPareto
                          filterToggleAriaLabel="HANA costs time series"
                          filterFieldValue={activeControllableHanaChartFilterField.value}
                          filterFieldOptions={CONTROLLABLE_HANA_CHART_FILTER_FIELDS}
                          paretoFieldOptions={CONTROLLABLE_HANA_PARETO_FILTER_FIELDS}
                          filterFieldAriaLabel="Select HANA costs filter field"
                          onFilterFieldChange={(nextField) => {
                            setSelectedControllableHanaChartFilterField(nextField);
                            setSelectedControllableHanaChartFilterValue([]);
                          }}
                          filterValue={activeControllableHanaChartFilterValue}
                          filterValueOptions={controllableHanaChartFilterValueOptions}
                          filterValueAllLabel={activeControllableHanaChartFilterField.allLabel}
                          filterValueAriaLabel="Select HANA costs filter value"
                          onFilterValueChange={setSelectedControllableHanaChartFilterValue}
                          paletteToggleAriaLabel="HANA costs grouped palette chart"
                          paletteGroupFieldValue={activeControllableHanaPaletteGroupField.value}
                          paletteGroupFieldOptions={controllableHanaPaletteGroupFieldOptions}
                          paletteGroupFieldAriaLabel="Select HANA costs group field"
                          onPaletteGroupFieldChange={(nextField) => {
                            setSelectedControllableHanaPaletteGroupField(nextField);

                            if (nextField === activeControllableHanaPaletteColorField.value) {
                              const nextColorField = CONTROLLABLE_HANA_PALETTE_FIELDS.find(
                                (option) => option.value !== nextField
                              )?.value ?? nextField;

                              setSelectedControllableHanaPaletteColorField(nextColorField);
                            }
                          }}
                          paletteColorFieldValue={activeControllableHanaPaletteColorField.value}
                          paletteColorFieldOptions={controllableHanaPaletteColorFieldOptions}
                          paletteColorFieldAriaLabel="Select HANA costs color field"
                          onPaletteColorFieldChange={(nextField) => {
                            setSelectedControllableHanaPaletteColorField(nextField);

                            if (nextField === activeControllableHanaPaletteGroupField.value) {
                              const nextGroupField = CONTROLLABLE_HANA_PALETTE_FIELDS.find(
                                (option) => option.value !== nextField
                              )?.value ?? nextField;

                              setSelectedControllableHanaPaletteGroupField(nextGroupField);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="chart-footer chart-footer-match-labor">
                      <ToggleButtonGroup
                        value={controllableCostsHanaViewMode}
                        exclusive
                        fullWidth
                        onChange={(_event, nextMode) => {
                          if (nextMode) {
                            setControllableCostsHanaViewMode(nextMode);
                          }
                        }}
                        sx={timelineToggleGroupSx}
                      >
                        {Object.entries(CONTROLLABLE_COSTS_HANA_VIEW_CONFIG).map(([mode, config]) => (
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
              <article className="analytics-card" style={{ order: 8 }}>
                <CardHeader
                  title="SIF Incidents"
                  info={METRIC_INFO.sif}
                  tooltipLegend={sifTooltipLegend}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <MetricOverviewBand
                      value={sifState.loading || sifState.error ? '--' : sifSummaryValue}
                      label="SIF Incidents"
                      forecastValue={formatForecastValue(
                        sifForecastCalculation,
                        formatIncidentCount
                      )}
                      legendItems={sifOverviewLegend}
                      ariaLabel="SIF incidents overview"
                    />
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
                            setSelectedSifChartFilterValue([]);
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
              <article className="analytics-card" style={{ order: 7 }}>
                <CardHeader
                  title="Potential SIF Incidents"
                  info={METRIC_INFO.potentialSif}
                  tooltipLegend={potentialSifTooltipLegend}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <MetricOverviewBand
                      value={
                        potentialSifState.loading || potentialSifState.error
                          ? '--'
                          : potentialSifSummaryValue
                      }
                      label="Potential SIFs"
                      forecastValue={formatForecastValue(
                        potentialSifForecastCalculation,
                        formatIncidentCount
                      )}
                      legendItems={potentialSifOverviewLegend}
                      ariaLabel="Potential SIF incidents overview"
                    />
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
                            setSelectedPotentialSifChartFilterValue([]);
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
              <article className="analytics-card" style={{ order: 5 }}>
                <CardHeader
                  title="Near Miss Frequency Rate"
                  info={nmfrMetricInfo}
                  tooltipLegend={nmfrTooltipLegend}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <MetricOverviewBand
                      value={nmfrState.loading || nmfrState.error ? '--' : nmfrSummaryValue}
                      label="NMFR"
                      forecastValue={formatForecastValue(nmfrGoalCalculation, formatNumber)}
                      legendItems={nmfrOverviewLegend}
                      ariaLabel="Near miss frequency rate overview"
                    />
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
                              goalLine={labeledNmfrGoalLine}
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
                              goalLine={labeledNmfrGoalLine}
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
                            setSelectedNmfrChartFilterValue([]);
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
              <article className="analytics-card" style={{ order: 6 }}>
                <CardHeader
                  title="On Time Delivery (OTD)"
                  info={otdMetricInfo}
                  tooltipLegend={otdTooltipLegend}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <MetricOverviewBand
                      value={otdState.loading || otdState.error ? '--' : otdSummaryValue}
                      label="Percent Delivered"
                      forecastValue={formatForecastValue(
                        otdGoalCalculation,
                        formatPercentValue
                      )}
                      legendItems={otdOverviewLegend}
                      ariaLabel="On time delivery overview"
                    />
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
                              barAxis={OTD_UNITS_Y_AXIS}
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
                              yAxis={otdPaletteChartYAxis}
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
                              yAxis={isOtdBarChart ? otdUnitsChartYAxis : otdPercentChartYAxis}
                              series={isOtdBarChart
                                ? [
                                  {
                                    data: otdChartData.contract,
                                    label: 'Contract Commitment',
                                    color: 'var(--chart-line)',
                                    valueFormatter: formatUnits
                                  },
                                  {
                                    data: otdChartData.deliveredForChart,
                                    label: 'Actuals Delivered',
                                    color: 'var(--chart-secondary-line)',
                                    valueFormatter: formatUnits
                                  }
                                ]
                                : [
                                  {
                                    data: otdChartData.deliveredPercent,
                                    label: 'Percent Delivered',
                                    color: 'var(--chart-line)',
                                    valueFormatter: formatPercentValue,
                                    showMark: false
                                  }
                                ]}
                              tooltipComponent={OtdChartTooltip}
                              tooltipProps={{
                                chartData: otdChartData
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
                            setSelectedOtdChartFilterValue([]);
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
              <article className="analytics-card" style={{ order: 3 }}>
                <CardHeader
                  title="Direct Labor Utilization"
                  info={laborMetricInfo}
                  tooltipLegend={laborTooltipLegend}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <MetricOverviewBand
                      value={laborState.loading || laborState.error ? '--' : laborSummaryValue}
                      label="Direct Labor"
                      forecastValue={formatForecastValue(
                        laborGoalCalculation,
                        formatPercentValue
                      )}
                      legendItems={laborOverviewLegend}
                      ariaLabel="Direct labor utilization overview"
                    />
                    <div ref={laborChartHostRef} className="chart-host">
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
                            setSelectedLaborChartFilterValue([]);
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

            {visibleCards.laborNew && (
              <article className="analytics-card" style={{ order: 4 }}>
                <CardHeader
                  title="Labor Utilization — New Data"
                  info={laborNewMetricInfo}
                  tooltipLegend={laborNewTooltipLegend}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <MetricOverviewBand
                      value={
                        laborNewState.loading || laborNewState.error
                          ? '--'
                          : laborNewSummaryValue
                      }
                      label="Direct Labor"
                      forecastValue={formatForecastValue(
                        laborNewGoalCalculation,
                        formatPercentValue
                      )}
                      legendItems={laborNewOverviewLegend}
                      ariaLabel="New labor utilization dataset overview"
                    />
                    <div ref={laborNewChartHostRef} className="chart-host">
                      {laborNewState.loading && (
                        <p className="chart-message">Loading new labor utilization workbook...</p>
                      )}

                      {!laborNewState.loading && laborNewState.error && (
                        <p className="chart-message chart-message-error">
                          {laborNewState.error}
                        </p>
                      )}

                      {!laborNewState.loading
                        && !laborNewState.error
                        && (laborNewState.rows.length === 0
                          || (isLaborNewPareto
                            ? laborNewParetoChartData.labels.length === 0
                            : isLaborNewPalette
                              ? laborNewPaletteChartData.labels.length === 0
                              : filteredLaborNewRows.length === 0
                                || laborNewChartData.labels.length === 0)) && (
                          <p className="chart-message">
                            {laborNewState.rows.length === 0
                              ? 'No rows were loaded from the new labor workbook.'
                              : filteredLaborNewRows.length === 0 && laborNewFilterApplies
                                ? 'No new labor rows match the selected filters.'
                                : visibleLaborNewRows.length === 0
                                  ? 'No new labor rows fall within the selected date range.'
                                  : 'No Labor Direct or Labor Indirect rows are available to chart.'}
                          </p>
                        )}

                      {!laborNewState.loading
                        && !laborNewState.error
                        && (isLaborNewPareto
                          ? laborNewParetoChartData.labels.length > 0
                          : isLaborNewPalette
                            ? laborNewPaletteChartData.labels.length > 0
                            : laborNewChartData.labels.length > 0)
                        && laborNewChartWidth > 0 && (
                          isLaborNewPareto ? (
                            <ParetoMetricChart
                              width={laborNewChartWidth}
                              height={CHART_HEIGHT}
                              margin={LABOR_CHART_MARGIN}
                              labels={laborNewParetoChartData.labels}
                              values={laborNewParetoChartData.values}
                              cumulativeShares={laborNewParetoChartData.cumulativeShares}
                              barLabel="Direct hours"
                              barColor="var(--chart-line)"
                              barAxis={LABOR_HOURS_Y_AXIS}
                              barValueFormatter={formatHours}
                              goalLine={laborNewGoalLine}
                              sx={sharedChartSx}
                            />
                          ) : isLaborNewPalette ? (
                            <StackedCategoryBarChart
                              width={laborNewChartWidth}
                              height={CHART_HEIGHT}
                              margin={LABOR_CHART_MARGIN}
                              labels={laborNewPaletteChartData.labels}
                              yAxis={LABOR_HOURS_Y_AXIS}
                              series={laborNewPaletteChartData.series.map((seriesItem) => ({
                                ...seriesItem,
                                valueFormatter: formatHours
                              }))}
                              sx={sharedChartSx}
                            />
                          ) : (
                            <MetricTrendChart
                              variant={chartVariants.laborNew === 'bar' ? 'bar' : 'line'}
                              width={laborNewChartWidth}
                              height={CHART_HEIGHT}
                              margin={LABOR_CHART_MARGIN}
                              labels={laborNewChartData.labels}
                              yAxis={LABOR_Y_AXIS}
                              series={laborNewChartSeries}
                              sx={sharedChartSx}
                              tooltipComponent={
                                isLaborNewBarChart ? LaborBarChartTooltip : LaborChartTooltip
                              }
                              tooltipTrigger={isLaborNewBarChart ? 'item' : 'axis'}
                              tooltipProps={{
                                chartData: laborNewChartData
                              }}
                              goalLine={laborNewGoalLine}
                            />
                          )
                        )}
                    </div>

                    <div className="chart-control-row chart-control-row-single">
                      <div className="chart-control-row-toggle">
                        <ChartTypeToggle
                          value={chartVariants.laborNew}
                          onChange={(nextVariant) => {
                            if (nextVariant === 'pareto') {
                              setSelectedLaborNewChartFilterField(
                                LABOR_NEW_PARETO_FILTER_FIELDS[0].value
                              );
                            }

                            setChartVariants((currentValue) => ({
                              ...currentValue,
                              laborNew: nextVariant
                            }));
                          }}
                          alwaysGridToggle
                          supportsFilter
                          supportsPalette
                          supportsPareto
                          filterToggleAriaLabel="Filter new labor utilization chart"
                          filterFieldValue={activeLaborNewChartFilterField.value}
                          filterFieldOptions={LABOR_NEW_CHART_FILTER_FIELDS}
                          paretoFieldOptions={LABOR_NEW_PARETO_FILTER_FIELDS}
                          filterFieldAriaLabel="Select new labor filter field"
                          onFilterFieldChange={(nextField) => {
                            setSelectedLaborNewChartFilterField(nextField);
                            setSelectedLaborNewChartFilterValue([]);
                          }}
                          filterValue={activeLaborNewChartFilterValue}
                          filterValueOptions={laborNewChartFilterValueOptions}
                          filterValueAllLabel={activeLaborNewChartFilterField.allLabel}
                          filterValueAriaLabel="Select new labor filter values"
                          onFilterValueChange={setSelectedLaborNewChartFilterValue}
                          paletteToggleAriaLabel="New labor grouped palette chart"
                          paletteGroupFieldValue={activeLaborNewPaletteGroupField.value}
                          paletteGroupFieldOptions={laborNewPaletteGroupFieldOptions}
                          paletteGroupFieldAriaLabel="Select new labor group field"
                          onPaletteGroupFieldChange={(nextField) => {
                            setSelectedLaborNewPaletteGroupField(nextField);

                            if (nextField === activeLaborNewPaletteColorField.value) {
                              const nextColorField =
                                LABOR_NEW_PALETTE_FIELDS.find(
                                  (option) => option.value !== nextField
                                )?.value ?? nextField;

                              setSelectedLaborNewPaletteColorField(nextColorField);
                            }
                          }}
                          paletteColorFieldValue={activeLaborNewPaletteColorField.value}
                          paletteColorFieldOptions={laborNewPaletteColorFieldOptions}
                          paletteColorFieldAriaLabel="Select new labor color field"
                          onPaletteColorFieldChange={(nextField) => {
                            setSelectedLaborNewPaletteColorField(nextField);

                            if (nextField === activeLaborNewPaletteGroupField.value) {
                              const nextGroupField =
                                LABOR_NEW_PALETTE_FIELDS.find(
                                  (option) => option.value !== nextField
                                )?.value ?? nextField;

                              setSelectedLaborNewPaletteGroupField(nextGroupField);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="chart-footer chart-footer-match-labor">
                      <ToggleButtonGroup
                        value={laborNewViewMode}
                        exclusive
                        fullWidth
                        onChange={(_event, nextMode) => {
                          if (nextMode) {
                            setLaborNewViewMode(nextMode);
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

            {visibleCards.laborHana && (
              <article className="analytics-card" style={{ order: 4 }}>
                <CardHeader
                  title="Labor Utilization HANA"
                  info={laborHanaMetricInfo}
                  tooltipLegend={laborHanaTooltipLegend}
                />

                <div className="dashboard-grid">
                  <div className="visual-column">
                    <MetricOverviewBand
                      value={
                        laborHanaState.loading || laborHanaState.error
                          ? '--'
                          : laborHanaSummaryValue
                      }
                      label="Direct Labor"
                      forecastValue={formatForecastValue(
                        laborHanaGoalCalculation,
                        formatPercentValue
                      )}
                      legendItems={laborHanaOverviewLegend}
                      ariaLabel="HANA direct labor utilization overview"
                    />
                    <div
                      ref={laborHanaChartHostRef}
                      className="chart-host"
                    >
                      {laborHanaState.loading && (
                        <p className="chart-message">Loading HANA labor utilization data...</p>
                      )}

                      {!laborHanaState.loading && laborHanaState.error && (
                        <p className="chart-message chart-message-error">
                          {laborHanaState.error}
                        </p>
                      )}

                      {!laborHanaState.loading &&
                        !laborHanaState.error &&
                        (laborHanaState.rows.length === 0
                          || (isLaborHanaPareto
                            ? laborHanaParetoChartData.labels.length === 0
                            : isLaborHanaPalette
                              ? laborHanaPaletteChartData.labels.length === 0
                              : filteredLaborHanaRows.length === 0
                                || laborHanaChartData.labels.length === 0)) && (
                          <p className="chart-message">
                            {laborHanaState.rows.length === 0
                              ? 'No HANA labor rows are available for charting.'
                              : filteredLaborHanaRows.length === 0 && laborHanaFilterApplies
                                ? 'No HANA labor rows match the selected filters.'
                                : 'No HANA labor months fall within the selected date range.'}
                          </p>
                        )}

                      {!laborHanaState.loading &&
                        !laborHanaState.error &&
                        (isLaborHanaPareto
                          ? laborHanaParetoChartData.labels.length > 0
                          : isLaborHanaPalette
                            ? laborHanaPaletteChartData.labels.length > 0
                            : laborHanaChartData.labels.length > 0) &&
                        laborHanaChartWidth > 0 && (
                          isLaborHanaPareto ? (
                            <ParetoMetricChart
                              width={laborHanaChartWidth}
                              height={CHART_HEIGHT}
                              margin={LABOR_CHART_MARGIN}
                              labels={laborHanaParetoChartData.labels}
                              values={laborHanaParetoChartData.values}
                              cumulativeShares={laborHanaParetoChartData.cumulativeShares}
                              barLabel="Direct hours"
                              barColor="var(--chart-line)"
                              barAxis={LABOR_HOURS_Y_AXIS}
                              barValueFormatter={formatHours}
                              goalLine={laborHanaGoalLine}
                              sx={sharedChartSx}
                            />
                          ) : isLaborHanaPalette ? (
                            <StackedCategoryBarChart
                              width={laborHanaChartWidth}
                              height={CHART_HEIGHT}
                              margin={LABOR_CHART_MARGIN}
                              labels={laborHanaPaletteChartData.labels}
                              yAxis={LABOR_HOURS_Y_AXIS}
                              series={laborHanaPaletteChartData.series.map((seriesItem) => ({
                                ...seriesItem,
                                valueFormatter: formatHours
                              }))}
                              sx={sharedChartSx}
                            />
                          ) : (
                            <MetricTrendChart
                                variant={chartVariants.laborHana === 'bar' ? 'bar' : 'line'}
                                width={laborHanaChartWidth}
                                height={CHART_HEIGHT}
                                margin={LABOR_CHART_MARGIN}
                                labels={laborHanaChartData.labels}
                                yAxis={LABOR_Y_AXIS}
                                series={laborHanaChartSeries}
                                sx={sharedChartSx}
                                tooltipComponent={
                                  isLaborHanaBarChart ? LaborBarChartTooltip : LaborChartTooltip
                                }
                                tooltipTrigger={isLaborHanaBarChart ? 'item' : 'axis'}
                                tooltipProps={{
                                  chartData: laborHanaChartData
                                }}
                                goalLine={laborHanaGoalLine}
                              />
                          )
                        )}
                    </div>

                    <div className="chart-control-row chart-control-row-single">
                      <div className="chart-control-row-toggle">
                        <ChartTypeToggle
                          value={chartVariants.laborHana}
                          onChange={(nextVariant) => {
                            if (nextVariant === 'pareto') {
                              setSelectedLaborHanaChartFilterField(
                                LABOR_HANA_PARETO_FILTER_FIELDS[0].value
                              );
                            }

                            setChartVariants((currentValue) => ({
                              ...currentValue,
                              laborHana: nextVariant
                            }));
                          }}
                          alwaysGridToggle
                          supportsFilter
                          supportsPalette
                          supportsPareto
                          filterToggleAriaLabel="Filter HANA labor chart"
                          filterFieldValue={activeLaborHanaChartFilterField.value}
                          filterFieldOptions={LABOR_HANA_CHART_FILTER_FIELDS}
                          paretoFieldOptions={LABOR_HANA_PARETO_FILTER_FIELDS}
                          filterFieldAriaLabel="Select HANA labor filter field"
                          onFilterFieldChange={(nextField) => {
                            setSelectedLaborHanaChartFilterField(nextField);
                            setSelectedLaborHanaChartFilterValue([]);
                          }}
                          filterValue={activeLaborHanaChartFilterValue}
                          filterValueOptions={laborHanaChartFilterValueOptions}
                          filterValueAllLabel={activeLaborHanaChartFilterField.allLabel}
                          filterValueAriaLabel="Select HANA labor filter value"
                          onFilterValueChange={setSelectedLaborHanaChartFilterValue}
                          paletteToggleAriaLabel="HANA labor grouped palette chart"
                          paletteGroupFieldValue={activeLaborHanaPaletteGroupField.value}
                          paletteGroupFieldOptions={laborHanaPaletteGroupFieldOptions}
                          paletteGroupFieldAriaLabel="Select HANA labor group field"
                          onPaletteGroupFieldChange={(nextField) => {
                            setSelectedLaborHanaPaletteGroupField(nextField);

                            if (nextField === activeLaborHanaPaletteColorField.value) {
                              const nextColorField =
                                LABOR_HANA_PALETTE_FIELDS.find(
                                  (option) => option.value !== nextField
                                )?.value ?? nextField;

                              setSelectedLaborHanaPaletteColorField(nextColorField);
                            }
                          }}
                          paletteColorFieldValue={activeLaborHanaPaletteColorField.value}
                          paletteColorFieldOptions={laborHanaPaletteColorFieldOptions}
                          paletteColorFieldAriaLabel="Select HANA labor color field"
                          onPaletteColorFieldChange={(nextField) => {
                            setSelectedLaborHanaPaletteColorField(nextField);

                            if (nextField === activeLaborHanaPaletteGroupField.value) {
                              const nextGroupField =
                                LABOR_HANA_PALETTE_FIELDS.find(
                                  (option) => option.value !== nextField
                                )?.value ?? nextField;

                              setSelectedLaborHanaPaletteGroupField(nextGroupField);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="chart-footer chart-footer-match-labor">
                      <ToggleButtonGroup
                        value={laborHanaViewMode}
                        exclusive
                        fullWidth
                        onChange={(_event, nextMode) => {
                          if (nextMode) {
                            setLaborHanaViewMode(nextMode);
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
      boxShadow: '0 12px 28px var(--popover-shadow)'
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

const autocompleteOptionCheckboxSx = {
  p: 0.25,
  mr: 0.6,
  color: 'var(--text-secondary)',
  '&.Mui-checked': {
    color: 'var(--selected-bg)'
  }
};

const inlineChartFilterAutocompleteStyles = {
  width: '100%',
  minWidth: 0,
  '& .MuiOutlinedInput-root': {
    minHeight: 32,
    height: 32,
    flexWrap: 'nowrap',
    borderRadius: '999px',
    padding: '0 50px 0 10px !important',
    fontSize: '0.75rem',
    color: 'var(--input-text)',
    backgroundColor: 'var(--input-bg)'
  },
  '& .MuiAutocomplete-input': {
    minWidth: '20px !important',
    padding: '0 !important',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--input-text)'
  },
  '& .MuiAutocomplete-input::placeholder': {
    color: 'var(--input-text)',
    opacity: 1
  },
  '& .chart-filter-value-summary': {
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexShrink: 1,
    fontWeight: 600,
    color: 'var(--input-text)'
  },
  '& .MuiOutlinedInput-root.Mui-focused .chart-filter-value-summary': {
    display: 'none'
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
  '& .MuiAutocomplete-endAdornment': {
    right: 5,
    top: '50%',
    transform: 'translateY(-50%)'
  },
  '& .MuiAutocomplete-clearIndicator, & .MuiAutocomplete-popupIndicator': {
    p: 0.25,
    color: 'var(--input-text)'
  },
  '& .MuiSvgIcon-root': {
    fontSize: '0.95rem'
  }
};

const globalFilterSelectStyles = {
  control: (baseStyles, state) => ({
    ...baseStyles,
    minHeight: 40,
    borderColor: state.isFocused ? 'var(--selected-bg)' : 'var(--input-border)',
    borderRadius: 10,
    backgroundColor: 'var(--input-bg)',
    boxShadow: 'none',
    fontSize: '0.76rem',
    fontWeight: 600,
    ':hover': {
      borderColor: 'var(--selected-bg)'
    }
  }),
  valueContainer: (baseStyles) => ({
    ...baseStyles,
    gap: 3,
    padding: '3px 6px'
  }),
  input: (baseStyles) => ({
    ...baseStyles,
    color: 'var(--input-text)',
    margin: 0
  }),
  placeholder: (baseStyles) => ({
    ...baseStyles,
    color: 'var(--text-secondary)',
    opacity: 0.8
  }),
  multiValue: (baseStyles) => ({
    ...baseStyles,
    maxWidth: '100%',
    margin: 0,
    border: '1px solid var(--input-border)',
    borderRadius: 999,
    backgroundColor: 'var(--surface-muted)'
  }),
  multiValueLabel: (baseStyles) => ({
    ...baseStyles,
    overflow: 'hidden',
    padding: '3px 4px 3px 7px',
    color: 'var(--input-text)',
    textOverflow: 'ellipsis'
  }),
  multiValueRemove: (baseStyles) => ({
    ...baseStyles,
    borderRadius: 999,
    color: 'var(--text-secondary)',
    ':hover': {
      backgroundColor: 'var(--surface-hover, var(--surface-soft))',
      color: 'var(--text-primary)'
    }
  }),
  clearIndicator: (baseStyles) => ({
    ...baseStyles,
    padding: 5,
    color: 'var(--text-secondary)',
    ':hover': {
      color: 'var(--text-primary)'
    }
  }),
  dropdownIndicator: (baseStyles) => ({
    ...baseStyles,
    padding: 5,
    color: 'var(--text-secondary)',
    ':hover': {
      color: 'var(--text-primary)'
    }
  }),
  indicatorSeparator: (baseStyles) => ({
    ...baseStyles,
    backgroundColor: 'var(--input-border)'
  }),
  menuPortal: (baseStyles) => ({
    ...baseStyles,
    zIndex: 100
  }),
  menu: (baseStyles) => ({
    ...baseStyles,
    overflow: 'hidden',
    border: '1px solid var(--input-border)',
    borderRadius: 10,
    backgroundColor: 'var(--input-bg)',
    boxShadow: '0 14px 32px var(--popover-shadow)'
  }),
  menuList: (baseStyles) => ({
    ...baseStyles,
    padding: 4,
    backgroundColor: 'var(--input-bg)'
  }),
  option: (baseStyles, state) => ({
    ...baseStyles,
    borderRadius: 7,
    backgroundColor: state.isSelected
      ? 'var(--selected-bg)'
      : state.isFocused
        ? 'var(--surface-hover, var(--surface-soft))'
        : 'var(--input-bg)',
    color: state.isSelected ? 'var(--selected-text)' : 'var(--input-text)',
    fontSize: '0.76rem',
    ':active': {
      backgroundColor: state.isSelected ? 'var(--selected-bg)' : 'var(--surface-soft)'
    }
  }),
  noOptionsMessage: (baseStyles) => ({
    ...baseStyles,
    color: 'var(--text-secondary)',
    fontSize: '0.76rem'
  })
};
