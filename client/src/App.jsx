import { useEffect, useState } from 'react';
import {
  FormControl,
  MenuItem,
  Paper,
  Select,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import {
  ChartsTooltipContainer,
  useAxesTooltip
} from '@mui/x-charts/ChartsTooltip';

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
  { key: 'controllableCosts', label: 'Controllable Costs' },
  { key: 'otd', label: 'On Time Delivery (OTD)' },
  { key: 'labor', label: 'Direct Labor Utilization' }
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
const LABOR_CHART_MARGIN = { top: 12, right: 12, bottom: 20, left: 0 };
const CHART_HEIGHT = 332;
const OTD_Y_AXIS = [
  {
    width: 66,
    valueFormatter: formatCompactCurrency,
    tickLabelStyle: { fontSize: 11 }
  }
];
const LABOR_Y_AXIS = [
  {
    width: 64,
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

function formatCompactHours(value) {
  return `${formatCompactWholeNumber(value)} hours`;
}

function formatCompactHoursAxis(value) {
  return `${formatCompactWholeNumber(value)} hrs`;
}

function formatDebugDuration(durationMs) {
  return `${durationMs.toFixed(1)}ms`;
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

function getQuarterNumber(value) {
  const match = /^Q\s*([1-4])$/i.exec(String(value ?? '').trim());
  return match ? Number(match[1]) : null;
}

function buildControllableCostsChartData(rows, viewMode) {
  const buckets = new Map();

  rows.forEach((row) => {
    const cost = Number(row.cost);
    const year = Number(row.year);

    if (!Number.isFinite(cost) || !Number.isInteger(year)) {
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

function getOtdBuckets(viewMode) {
  if (viewMode === 'monthly') {
    return OTD_MONTH_COLUMNS.map(({ label }, index) => ({
      label,
      monthIndices: [index]
    }));
  }

  if (viewMode === 'quarterly') {
    return [0, 3, 6, 9].map((startIndex, quarterIndex) => ({
      label: `Q${quarterIndex + 1} 2026`,
      monthIndices: [startIndex, startIndex + 1, startIndex + 2]
    }));
  }

  return [
    {
      label: '2026',
      monthIndices: OTD_MONTH_COLUMNS.map((_month, index) => index)
    }
  ];
}

function buildOtdChartData(rows, viewMode) {
  const contractTotals = OTD_MONTH_COLUMNS.map(() => 0);
  const deliveredTotals = OTD_MONTH_COLUMNS.map(() => 0);

  rows.forEach((row) => {
    const targetSeries =
      row.measure_type === 'Contract Commitment'
        ? contractTotals
        : row.measure_type === 'Actual Delivered'
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

  const buckets = getOtdBuckets(viewMode);

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

function getLaborBuckets(viewMode) {
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
      monthIndices.push(monthIndex);
    }

    buckets.push({
      label: bucketConfig.bucketFormatter(LABOR_MONTH_COLUMNS[startIndex], startIndex),
      monthIndices
    });
  }

  return buckets;
}

function buildLaborUtilizationChartData(rows, viewMode) {
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

  const buckets = getLaborBuckets(viewMode);
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

  return {
    labels: buckets.map((bucket) => bucket.label),
    totals,
    direct,
    indirect,
    other,
    directRowCount,
    indirectRowCount,
    otherRowCount,
    annualTotal: Math.round(totals.reduce((sum, value) => sum + value, 0)),
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

          return renderTooltipTable({
            axisId,
            bucketLabel,
            seriesItems,
            extraRows: bucketValues
              ? [
                {
                  label: 'Other',
                  color: 'var(--chart-tertiary-line)',
                  formattedValue: formatHours(bucketValues.other)
                }
              ]
              : []
          });
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
  const [visibleCards, setVisibleCards] = useState({
    controllableCosts: true,
    otd: true,
    labor: true
  });
  const [isControllableCostsFiltersOpen, setIsControllableCostsFiltersOpen] = useState(false);
  const [isOtdFiltersOpen, setIsOtdFiltersOpen] = useState(false);
  const [isLaborFiltersOpen, setIsLaborFiltersOpen] = useState(false);
  const {
    chartHostRef: controllableCostsChartHostRef,
    chartWidth: controllableCostsChartWidth
  } = useChartWidth();
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

  const controllableAddressOptions = getFilterOptions(controllableCostsState.rows, 'address');
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
  const controllableCostsChartData = buildControllableCostsChartData(
    filteredControllableCostsRows,
    controllableCostsViewMode
  );

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
  const otdChartData = buildOtdChartData(filteredOtdRows, otdViewMode);

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
  const laborChartData = buildLaborUtilizationChartData(filteredLaborRows, laborViewMode);
  const hasVisibleCards = Object.values(visibleCards).some(Boolean);

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="page-layout">
          <div className="page-header">
            <div>
              <h1 className="page-title">Metrics Project</h1>
            </div>
            <div className="page-actions">
              <div className="card-chip-panel">
                {CARD_CHIP_OPTIONS.map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    className={`card-chip${visibleCards[card.key] ? ' card-chip-active' : ''}`}
                    aria-pressed={visibleCards[card.key]}
                    onClick={() => {
                      setVisibleCards((currentValue) => ({
                        ...currentValue,
                        [card.key]: !currentValue[card.key]
                      }));
                    }}
                  >
                    {card.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="theme-toggle"
                onClick={() => {
                  setThemeMode((currentMode) => (currentMode === 'light' ? 'dark' : 'light'));
                }}
              >
                {themeMode === 'light' ? 'Dark mode' : 'Light mode'}
              </button>
            </div>
          </div>

          <div className="cards-grid">
            {visibleCards.controllableCosts && (
              <article className="analytics-card">
                <div className="card-header">
                  <div>
                    <p className="card-kicker">Cost trend</p>
                    <h2 className="card-title">Controllable Costs</h2>
                  </div>
                </div>

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
                        filteredControllableCostsRows.length === 0 && (
                          <p className="chart-message">
                            {controllableCostsState.rows.length === 0
                              ? 'No controllable cost rows are available for charting.'
                              : 'No controllable cost rows match the selected filters.'}
                          </p>
                        )}

                      {!controllableCostsState.loading &&
                        !controllableCostsState.error &&
                        filteredControllableCostsRows.length > 0 &&
                        controllableCostsChartData.labels.length > 0 &&
                        controllableCostsChartWidth > 0 && (
                          <LineChart
                            width={controllableCostsChartWidth}
                            height={CHART_HEIGHT}
                            margin={DEFAULT_CHART_MARGIN}
                            xAxis={[
                              {
                                scaleType: 'point',
                                height: 28,
                                data: controllableCostsChartData.labels
                              }
                            ]}
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
                                color: 'var(--chart-secondary-line)',
                                valueFormatter: formatCurrency,
                                showMark: false
                              }
                            ]}
                            grid={{ horizontal: true }}
                            sx={sharedChartSx}
                            slots={{
                              tooltip: StandardChartTooltip
                            }}
                            slotProps={{
                              tooltip: {
                                trigger: 'axis'
                              }
                            }}
                          />
                        )}
                    </div>

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

            {visibleCards.otd && (
              <article className="analytics-card">
                <div className="card-header">
                  <div>
                    <p className="card-kicker">Delivery trend</p>
                    <h2 className="card-title">On Time Delivery (OTD)</h2>
                  </div>
                </div>

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
                        filteredOtdRows.length === 0 && (
                          <p className="chart-message">
                            {otdState.rows.length === 0
                              ? 'No OTD rows are available for charting.'
                              : 'No OTD rows match the selected filters.'}
                          </p>
                        )}

                      {!otdState.loading &&
                        !otdState.error &&
                        filteredOtdRows.length > 0 &&
                        otdChartWidth > 0 && (
                          <LineChart
                            width={otdChartWidth}
                            height={CHART_HEIGHT}
                            margin={DEFAULT_CHART_MARGIN}
                            xAxis={[
                              {
                                scaleType: 'point',
                                height: 28,
                                data: otdChartData.labels
                              }
                            ]}
                            yAxis={OTD_Y_AXIS}
                            series={[
                              {
                                data: otdChartData.contract,
                                label: 'Contract Commitment',
                                color: 'var(--chart-line)',
                                valueFormatter: formatCurrency,
                                showMark: false
                              },
                              {
                                data: otdChartData.delivered,
                                label: 'Actual Delivered',
                                color: 'var(--chart-secondary-line)',
                                valueFormatter: formatCurrency,
                                showMark: false
                              }
                            ]}
                            grid={{ horizontal: true }}
                            sx={sharedChartSx}
                            slots={{
                              tooltip: StandardChartTooltip
                            }}
                            slotProps={{
                              tooltip: {
                                trigger: 'axis'
                              }
                            }}
                          />
                        )}
                    </div>

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
              <article className="analytics-card">
                <div className="card-header">
                  <div>
                    <p className="card-kicker">Labor trend</p>
                    <h2 className="card-title">Direct Labor Utilization</h2>
                  </div>
                </div>

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
                        filteredLaborRows.length === 0 && (
                          <p className="chart-message">No labor rows match the selected filters.</p>
                        )}

                      {!laborState.loading &&
                        !laborState.error &&
                        filteredLaborRows.length > 0 &&
                        laborChartData.labels.length > 0 &&
                        laborChartWidth > 0 && (
                          <>
                            <span className="chart-axis-unit-label">Hours</span>
                            <LineChart
                              width={laborChartWidth}
                              height={CHART_HEIGHT}
                              margin={LABOR_CHART_MARGIN}
                              xAxis={[
                                {
                                  scaleType: 'point',
                                  height: 28,
                                  data: laborChartData.labels
                                }
                              ]}
                              yAxis={LABOR_Y_AXIS}
                              series={[
                                {
                                  data: laborChartData.totals,
                                  label: 'Total',
                                  color: 'var(--chart-line)',
                                  valueFormatter: formatHours,
                                  showMark: false
                                },
                                {
                                  data: laborChartData.direct,
                                  label: 'Direct',
                                  color: 'var(--chart-accent-line)',
                                  valueFormatter: formatHours,
                                  showMark: false
                                },
                                {
                                  data: laborChartData.indirect,
                                  label: 'Indirect',
                                  color: 'var(--chart-secondary-line)',
                                  valueFormatter: formatHours,
                                  showMark: false
                                }
                              ]}
                              grid={{ horizontal: true }}
                              sx={sharedChartSx}
                              slots={{
                                tooltip: LaborChartTooltip
                              }}
                              slotProps={{
                                tooltip: {
                                  trigger: 'axis',
                                  chartData: laborChartData
                                }
                              }}
                            />
                          </>
                        )}
                    </div>

                    <div className="chart-footer chart-footer-match-labor">
                      <div className="chart-note-shell">
                        <p className="chart-note">
                          Total hours include direct, indirect, and other labor categories for the
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
