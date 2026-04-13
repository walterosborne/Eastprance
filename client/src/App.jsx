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
const MONTH_COLUMNS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
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
  const contractTotals = MONTH_COLUMNS.map(() => 0);
  const deliveredTotals = MONTH_COLUMNS.map(() => 0);

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

    MONTH_COLUMNS.forEach((month, index) => {
      const value = Number(row[month]);

      if (Number.isFinite(value)) {
        targetSeries[index] += value;
      }
    });
  });

  return {
    labels: MONTH_COLUMNS,
    contract: contractTotals.map((value) => Number(value.toFixed(2))),
    delivered: deliveredTotals.map((value) => Number(value.toFixed(2)))
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

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
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
  const [viewMode, setViewMode] = useState('monthly');
  const [selectedDateField, setSelectedDateField] = useState('START_DATE');
  const [selectedPaymentType, setSelectedPaymentType] = useState(ALL_FILTER_VALUE);
  const [selectedPaymentCategory, setSelectedPaymentCategory] = useState(ALL_FILTER_VALUE);
  const [selectedProgram, setSelectedProgram] = useState(ALL_FILTER_VALUE);
  const [selectedSite, setSelectedSite] = useState(ALL_FILTER_VALUE);
  const [selectedOtdType, setSelectedOtdType] = useState(ALL_FILTER_VALUE);
  const { chartHostRef: costChartHostRef, chartWidth: costChartWidth } = useChartWidth(280);
  const { chartHostRef: otdChartHostRef, chartWidth: otdChartWidth } = useChartWidth(280);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      const [paymentsResult, otdResult] = await Promise.allSettled([
        fetchJson('/api/payments'),
        fetchJson('/api/otd')
      ]);

      if (!isMounted) {
        return;
      }

      if (paymentsResult.status === 'fulfilled') {
        setPaymentsState({
          rows: Array.isArray(paymentsResult.value.rows) ? paymentsResult.value.rows : [],
          loading: false,
          error: '',
          source: paymentsResult.value.source === 'mssql' ? 'SQL Server data' : ''
        });
        setSelectedDateField('START_DATE');
        setSelectedPaymentType(ALL_FILTER_VALUE);
        setSelectedPaymentCategory(ALL_FILTER_VALUE);
      } else {
        setPaymentsState({
          rows: [],
          loading: false,
          error: paymentsResult.reason.message || 'Unable to reach the backend.',
          source: ''
        });
      }

      if (otdResult.status === 'fulfilled') {
        setOtdState({
          rows: Array.isArray(otdResult.value.rows) ? otdResult.value.rows : [],
          loading: false,
          error: '',
          source: otdResult.value.fileName || 'Excel data'
        });
        setSelectedProgram(ALL_FILTER_VALUE);
        setSelectedSite(ALL_FILTER_VALUE);
        setSelectedOtdType(ALL_FILTER_VALUE);
      } else {
        setOtdState({
          rows: [],
          loading: false,
          error: otdResult.reason.message || 'Unable to load the OTD workbook.',
          source: ''
        });
      }
    }

    loadDashboardData();

    return () => {
      isMounted = false;
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

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="page-layout">
          <div className="page-header">
            <div>
              <p className="chart-eyebrow">Dashboard</p>
              <h1 className="page-title">Costs and Delivery</h1>
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
                      Monthly totals from the OTD workbook for Contract Commitment and Actual
                      Delivered.
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
