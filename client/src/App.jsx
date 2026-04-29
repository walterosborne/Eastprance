import { useEffect, useRef, useState } from 'react';
import {
  FormControl,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';

const ALL_FILTER_VALUE = '__all__';
const OTD_MONTH_COLUMNS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
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
const DATE_FIELD_OPTIONS = [
  { value: 'START_DATE', label: 'Start date' },
  { value: 'END_DATE', label: 'End date' }
];

const VIEW_CONFIG = {
  monthly: {
    label: 'Monthly',
    titleLabel: 'Monthly',
    divisor: 12,
    seriesLabel: 'Monthly expense'
  },
  quarterly: {
    label: 'Quarterly',
    titleLabel: 'Quarterly',
    divisor: 4,
    seriesLabel: 'Quarterly expense'
  },
  yearly: {
    label: 'Yearly',
    titleLabel: 'Yearly',
    divisor: 1,
    seriesLabel: 'Yearly expense'
  }
};

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

const monthLabelFormatter = new Intl.DateTimeFormat('en-US', {
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

function formatCurrency(value) {
  return currencyFormatter.format(value ?? 0);
}

function formatNumber(value) {
  return numberFormatter.format(value ?? 0);
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

function getBucket(referenceDate, viewMode) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();

  if (viewMode === 'monthly') {
    const bucketDate = new Date(Date.UTC(year, month, 1));

    return {
      key: `${year}-${month}`,
      label: monthLabelFormatter.format(bucketDate),
      sortValue: bucketDate.getTime()
    };
  }

  if (viewMode === 'quarterly') {
    const quarter = Math.floor(month / 3) + 1;
    const quarterStartMonth = (quarter - 1) * 3;
    const bucketDate = new Date(Date.UTC(year, quarterStartMonth, 1));

    return {
      key: `${year}-Q${quarter}`,
      label: `Q${quarter} ${year}`,
      sortValue: bucketDate.getTime()
    };
  }

  const bucketDate = new Date(Date.UTC(year, 0, 1));

  return {
    key: `${year}`,
    label: `${year}`,
    sortValue: bucketDate.getTime()
  };
}

function buildCostChartData(rows, viewMode, dateField) {
  const buckets = new Map();
  const divisor = VIEW_CONFIG[viewMode].divisor;

  rows.forEach((row) => {
    const annualAmount = Number(row.ANNUAL_AMT);
    const referenceDate = new Date(row[dateField]);

    if (!Number.isFinite(annualAmount) || Number.isNaN(referenceDate.getTime())) {
      return;
    }

    const bucket = getBucket(referenceDate, viewMode);
    const currentValue = buckets.get(bucket.key) ?? {
      label: bucket.label,
      sortValue: bucket.sortValue,
      total: 0
    };

    currentValue.total += annualAmount / divisor;
    buckets.set(bucket.key, currentValue);
  });

  return Array.from(buckets.values())
    .sort((left, right) => left.sortValue - right.sortValue)
    .map((bucket) => ({
      label: bucket.label,
      total: Number(bucket.total.toFixed(2))
    }));
}

function buildOtdChartData(rows) {
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

    OTD_MONTH_COLUMNS.forEach((month, index) => {
      const value = Number(row[month]);

      if (Number.isFinite(value)) {
        targetSeries[index] += value;
      }
    });
  });

  return {
    labels: OTD_MONTH_COLUMNS,
    contract: contractTotals.map((value) => Number(value.toFixed(2))),
    delivered: deliveredTotals.map((value) => Number(value.toFixed(2)))
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

function buildLaborUtilizationChartData(rows) {
  const monthlyTotals = LABOR_MONTH_COLUMNS.map(() => 0);
  let directRowCount = 0;
  let annualTotal = 0;

  rows.forEach((row) => {
    if (getLaborCategoryGroup(row.labor_category) !== 'direct') {
      return;
    }

    directRowCount += 1;

    const total2026 = Number(row.total_2026);

    if (Number.isFinite(total2026)) {
      annualTotal += total2026;
    }

    LABOR_MONTH_COLUMNS.forEach(({ key }, index) => {
      const value = Number(row[key]);

      if (Number.isFinite(value)) {
        monthlyTotals[index] += value;
      }
    });
  });

  return {
    labels: LABOR_MONTH_COLUMNS.map((month) => month.label),
    totals: monthlyTotals.map((value) => Number(value.toFixed(2))),
    directRowCount,
    annualTotal: Number(annualTotal.toFixed(2))
  };
}

function useChartWidth(minWidth = 320) {
  const chartHostRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(minWidth);

  useEffect(() => {
    const chartHost = chartHostRef.current;

    if (!chartHost) {
      return undefined;
    }

    const updateChartWidth = (width) => {
      setChartWidth(Math.max(minWidth, Math.floor(width)));
    };

    updateChartWidth(chartHost.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry) {
        updateChartWidth(entry.contentRect.width);
      }
    });

    observer.observe(chartHost);

    return () => observer.disconnect();
  }, [minWidth]);

  return { chartHostRef, chartWidth };
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
  const [paymentsState, setPaymentsState] = useState({
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
  const [viewMode, setViewMode] = useState('monthly');
  const [selectedDateField, setSelectedDateField] = useState('START_DATE');
  const [selectedPaymentType, setSelectedPaymentType] = useState(ALL_FILTER_VALUE);
  const [selectedPaymentCategory, setSelectedPaymentCategory] = useState(ALL_FILTER_VALUE);
  const [selectedProgram, setSelectedProgram] = useState(ALL_FILTER_VALUE);
  const [selectedSite, setSelectedSite] = useState(ALL_FILTER_VALUE);
  const [selectedOtdType, setSelectedOtdType] = useState(ALL_FILTER_VALUE);
  const [selectedForecastedCc, setSelectedForecastedCc] = useState(ALL_FILTER_VALUE);
  const [selectedPool, setSelectedPool] = useState(ALL_FILTER_VALUE);
  const [selectedUnionType, setSelectedUnionType] = useState(ALL_FILTER_VALUE);
  const [selectedWorkerType, setSelectedWorkerType] = useState(ALL_FILTER_VALUE);
  const [selectedTimeType, setSelectedTimeType] = useState(ALL_FILTER_VALUE);
  const { chartHostRef: costChartHostRef, chartWidth: costChartWidth } = useChartWidth(280);
  const { chartHostRef: otdChartHostRef, chartWidth: otdChartWidth } = useChartWidth(280);
  const { chartHostRef: laborChartHostRef, chartWidth: laborChartWidth } = useChartWidth(280);

  useEffect(() => {
    let isMounted = true;

    async function loadPaymentsData() {
      const startTime = performance.now();

      try {
        const payload = await fetchJson('payments', '/api/payments');

        if (!isMounted) {
          logClientDebug('payments', 'Component unmounted before payment state update.');
          return;
        }

        setPaymentsState({
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          loading: false,
          error: '',
          source: getSourceLabel(payload.source)
        });
        setSelectedDateField('START_DATE');
        setSelectedPaymentType(ALL_FILTER_VALUE);
        setSelectedPaymentCategory(ALL_FILTER_VALUE);

        logClientDebug('payments', 'Payment state updated.', {
          rowCount: Array.isArray(payload.rows) ? payload.rows.length : 0,
          source: payload.source,
          totalDuration: formatDebugDuration(performance.now() - startTime)
        });
      } catch (error) {
        if (!isMounted) {
          logClientDebug('payments', 'Component unmounted after payment load failure.', {
            error: error.message
          });
          return;
        }

        setPaymentsState({
          rows: [],
          loading: false,
          error: error.message || 'Unable to reach the backend.',
          source: ''
        });

        logClientDebug('payments', 'Payment load failed.', {
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

    loadPaymentsData();
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

  const paymentTypeOptions = getFilterOptions(paymentsState.rows, 'payment_type');
  const paymentCategoryOptions = getFilterOptions(paymentsState.rows, 'payment_summary_type');
  const activePaymentType = normalizeFilterValue(selectedPaymentType, paymentTypeOptions);
  const activePaymentCategory = normalizeFilterValue(
    selectedPaymentCategory,
    paymentCategoryOptions
  );
  const filteredPayments = paymentsState.rows.filter((row) => {
    const paymentTypeMatches =
      activePaymentType === ALL_FILTER_VALUE || row.payment_type === activePaymentType;
    const paymentCategoryMatches =
      activePaymentCategory === ALL_FILTER_VALUE ||
      row.payment_summary_type === activePaymentCategory;

    return paymentTypeMatches && paymentCategoryMatches;
  });
  const costChartData = buildCostChartData(filteredPayments, viewMode, selectedDateField);
  const selectedDateFieldLabel =
    DATE_FIELD_OPTIONS.find((option) => option.value === selectedDateField)?.label ?? 'Start date';
  const costTitle = `${VIEW_CONFIG[viewMode].titleLabel} Costs by ${selectedDateFieldLabel}`;

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
  const otdChartData = buildOtdChartData(filteredOtdRows);

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
  const laborChartData = buildLaborUtilizationChartData(filteredLaborRows);

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="page-layout">
          <div className="page-header">
            <div>
              <p className="chart-eyebrow">Dashboard</p>
              <h1 className="page-title">Costs, Delivery, and Labor</h1>
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

          <div className="cards-grid">
            <article className="analytics-card">
              <div className="card-header">
                <div>
                  <p className="card-kicker">Expense trend</p>
                  <h2 className="card-title">{costTitle}</h2>
                </div>
                {paymentsState.source && <p className="chart-source">{paymentsState.source}</p>}
              </div>

              <div className="dashboard-grid">
                <aside className="filter-panel">
                  <div className="filter-panel-header">
                    <p className="filter-heading">Filters</p>
                    <p className="filter-copy">
                      Narrow the cost chart by date basis, payment type, and payment category.
                    </p>
                  </div>

                  <div className="filter-fields">
                    <div className="filter-group">
                      <label className="filter-label" htmlFor="date-field-filter">
                        Display by
                      </label>
                      <FormControl fullWidth size="small" sx={filterSelectStyles}>
                        <Select
                          id="date-field-filter"
                          value={selectedDateField}
                          onChange={(event) => {
                            setSelectedDateField(event.target.value);
                          }}
                          MenuProps={selectMenuProps}
                        >
                          {DATE_FIELD_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </div>

                    <div className="filter-group">
                      <label className="filter-label" htmlFor="payment-type-filter">
                        Payment type
                      </label>
                      <FormControl fullWidth size="small" sx={filterSelectStyles}>
                        <Select
                          id="payment-type-filter"
                          value={activePaymentType}
                          displayEmpty
                          onChange={(event) => {
                            setSelectedPaymentType(event.target.value);
                          }}
                          renderValue={(value) =>
                            value === ALL_FILTER_VALUE ? 'All payment types' : value
                          }
                          MenuProps={selectMenuProps}
                        >
                          <MenuItem value={ALL_FILTER_VALUE}>All payment types</MenuItem>
                          {paymentTypeOptions.map((option) => (
                            <MenuItem key={option} value={option}>
                              {option}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </div>

                    <div className="filter-group">
                      <label className="filter-label" htmlFor="payment-category-filter">
                        Payment category
                      </label>
                      <FormControl fullWidth size="small" sx={filterSelectStyles}>
                        <Select
                          id="payment-category-filter"
                          value={activePaymentCategory}
                          displayEmpty
                          onChange={(event) => {
                            setSelectedPaymentCategory(event.target.value);
                          }}
                          renderValue={(value) =>
                            value === ALL_FILTER_VALUE ? 'All payment categories' : value
                          }
                          MenuProps={selectMenuProps}
                        >
                          <MenuItem value={ALL_FILTER_VALUE}>All payment categories</MenuItem>
                          {paymentCategoryOptions.map((option) => (
                            <MenuItem key={option} value={option}>
                              {option}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </div>
                  </div>

                  <p className="filter-summary">
                    Showing {filteredPayments.length} of {paymentsState.rows.length} payment rows.
                  </p>
                </aside>

                <div className="visual-column">
                  <div ref={costChartHostRef} className="chart-host">
                    {paymentsState.loading && <p className="chart-message">Loading cost data...</p>}

                    {!paymentsState.loading && paymentsState.error && (
                      <p className="chart-message chart-message-error">{paymentsState.error}</p>
                    )}

                    {!paymentsState.loading &&
                      !paymentsState.error &&
                      costChartData.length === 0 && (
                        <p className="chart-message">
                          {paymentsState.rows.length === 0
                            ? 'No payment rows are available for charting.'
                            : 'No payment rows match the selected filters.'}
                        </p>
                      )}

                    {!paymentsState.loading &&
                      !paymentsState.error &&
                      costChartData.length > 0 && (
                        <LineChart
                          width={costChartWidth}
                          height={360}
                          margin={{ top: 24, right: 24, bottom: 36, left: 72 }}
                          xAxis={[
                            {
                              scaleType: 'point',
                              data: costChartData.map((bucket) => bucket.label)
                            }
                          ]}
                          yAxis={[
                            {
                              valueFormatter: formatCurrency
                            }
                          ]}
                          series={[
                            {
                              data: costChartData.map((bucket) => bucket.total),
                              label: `${VIEW_CONFIG[viewMode].seriesLabel} from ANNUAL_AMT`,
                              color: 'var(--chart-line)',
                              valueFormatter: formatCurrency,
                              showMark: false
                            }
                          ]}
                          grid={{ horizontal: true }}
                          sx={sharedChartSx}
                        />
                      )}
                  </div>

                  <div className="chart-footer">
                    <p className="chart-note">
                      Values are derived from ANNUAL_AMT and normalized to the selected cadence.
                    </p>

                    <ToggleButtonGroup
                      value={viewMode}
                      exclusive
                      fullWidth
                      onChange={(_event, nextMode) => {
                        if (nextMode) {
                          setViewMode(nextMode);
                        }
                      }}
                      sx={{
                        backgroundColor: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        borderRadius: '18px',
                        padding: '0.25rem'
                      }}
                    >
                      {Object.entries(VIEW_CONFIG).map(([mode, config]) => (
                        <ToggleButton
                          key={mode}
                          value={mode}
                          sx={{
                            border: 0,
                            borderRadius: '14px !important',
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                            textTransform: 'none',
                            '&.Mui-selected': {
                              backgroundColor: 'var(--selected-bg)',
                              color: 'var(--selected-text)'
                            },
                            '&.Mui-selected:hover': {
                              backgroundColor: 'var(--selected-bg)'
                            }
                          }}
                        >
                          {config.label}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </div>
                </div>
              </div>
            </article>

            <article className="analytics-card">
              <div className="card-header">
                <div>
                  <p className="card-kicker">Delivery trend</p>
                  <h2 className="card-title">On Time Delivery (OTD)</h2>
                </div>
                {otdState.source && <p className="chart-source">{otdState.source}</p>}
              </div>

              <div className="dashboard-grid">
                <aside className="filter-panel">
                  <div className="filter-panel-header">
                    <p className="filter-heading">Filters</p>
                    <p className="filter-copy">
                      Narrow the OTD chart by program, site, and type.
                    </p>
                  </div>

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
                          renderValue={(value) => (value === ALL_FILTER_VALUE ? 'All programs' : value)}
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
                          renderValue={(value) => (value === ALL_FILTER_VALUE ? 'All sites' : value)}
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
                          renderValue={(value) => (value === ALL_FILTER_VALUE ? 'All types' : value)}
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
                      filteredOtdRows.length > 0 && (
                        <LineChart
                          width={otdChartWidth}
                          height={360}
                          margin={{ top: 24, right: 24, bottom: 36, left: 72 }}
                          xAxis={[
                            {
                              scaleType: 'point',
                              data: otdChartData.labels
                            }
                          ]}
                          yAxis={[
                            {
                              valueFormatter: formatNumber
                            }
                          ]}
                          series={[
                            {
                              data: otdChartData.contract,
                              label: 'Contract Commitment',
                              color: 'var(--chart-line)',
                              valueFormatter: formatNumber,
                              showMark: false
                            },
                            {
                              data: otdChartData.delivered,
                              label: 'Actual Delivered',
                              color: 'var(--chart-secondary-line)',
                              valueFormatter: formatNumber,
                              showMark: false
                            }
                          ]}
                          grid={{ horizontal: true }}
                          sx={sharedChartSx}
                        />
                      )}
                  </div>

                  <div className="chart-footer">
                    <p className="chart-note">
                      Monthly totals for Contract Commitment and Actual Delivered.
                    </p>
                  </div>
                </div>
              </div>
            </article>

            <article className="analytics-card">
              <div className="card-header">
                <div>
                  <p className="card-kicker">Labor trend</p>
                  <h2 className="card-title">Direct Labor Utilization</h2>
                </div>
                {laborState.source && <p className="chart-source">{laborState.source}</p>}
              </div>

              <div className="dashboard-grid">
                <aside className="filter-panel">
                  <div className="filter-panel-header">
                    <p className="filter-heading">Filters</p>
                    <p className="filter-copy">
                      Narrow the direct labor chart by facility, pool, union status, worker type,
                      and time type.
                    </p>
                  </div>

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
                          renderValue={(value) => (value === ALL_FILTER_VALUE ? 'All pools' : value)}
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
                    Using {laborChartData.directRowCount} direct rows from {filteredLaborRows.length}{' '}
                    filtered labor rows.
                  </p>
                </aside>

                <div className="visual-column">
                  <div ref={laborChartHostRef} className="chart-host">
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
                      laborChartData.directRowCount === 0 && (
                        <p className="chart-message">
                          No filtered rows qualify as direct labor based on Labor Category.
                        </p>
                      )}

                    {!laborState.loading &&
                      !laborState.error &&
                      laborChartData.directRowCount > 0 && (
                        <LineChart
                          width={laborChartWidth}
                          height={360}
                          margin={{ top: 24, right: 24, bottom: 36, left: 72 }}
                          xAxis={[
                            {
                              scaleType: 'point',
                              data: laborChartData.labels
                            }
                          ]}
                          yAxis={[
                            {
                              valueFormatter: formatNumber
                            }
                          ]}
                          series={[
                            {
                              data: laborChartData.totals,
                              label: 'Direct labor hours',
                              color: 'var(--chart-line)',
                              valueFormatter: formatNumber,
                              showMark: false
                            }
                          ]}
                          grid={{ horizontal: true }}
                          sx={sharedChartSx}
                        />
                      )}
                  </div>

                  <div className="chart-footer">
                    <p className="chart-note">
                      Only rows whose Labor Category contains "Labor Direct" feed this chart. 2026
                      hours in view: {formatNumber(laborChartData.annualTotal)}.
                    </p>
                  </div>
                </div>
              </div>
            </article>
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
      borderRadius: '18px',
      border: '1px solid var(--border)',
      backgroundColor: 'var(--input-bg)',
      color: 'var(--input-text)',
      boxShadow: '0 12px 28px rgba(0, 0, 0, 0.08)'
    }
  }
};

const filterSelectStyles = {
  '& .MuiOutlinedInput-root': {
    minHeight: 52,
    borderRadius: '16px',
    color: 'var(--input-text)',
    backgroundColor: 'var(--input-bg)'
  },
  '& .MuiSelect-select': {
    padding: '14px 16px',
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
    color: 'var(--input-text)'
  }
};
