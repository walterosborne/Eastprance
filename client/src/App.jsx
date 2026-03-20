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

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
});

function formatCurrency(value) {
  return currencyFormatter.format(value ?? 0);
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

function getBucket(startDate, viewMode) {
  const year = startDate.getUTCFullYear();
  const month = startDate.getUTCMonth();

  if (viewMode === 'monthly') {
    const bucketDate = new Date(Date.UTC(year, month, 1));

    return {
      key: `${year}-${month}`,
      label: monthFormatter.format(bucketDate),
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

function buildChartData(rows, viewMode, dateField) {
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

export default function App() {
  const [payments, setPayments] = useState([]);
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    return window.localStorage.getItem('expense-theme-mode') === 'dark' ? 'dark' : 'light';
  });
  const [viewMode, setViewMode] = useState('monthly');
  const [selectedDateField, setSelectedDateField] = useState('START_DATE');
  const [selectedPaymentType, setSelectedPaymentType] = useState(ALL_FILTER_VALUE);
  const [selectedPaymentCategory, setSelectedPaymentCategory] = useState(ALL_FILTER_VALUE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [chartWidth, setChartWidth] = useState(320);
  const chartHostRef = useRef(null);

  useEffect(() => {
    async function loadPayments() {
      try {
        const response = await fetch('/api/payments');

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data = await response.json();

        setPayments(Array.isArray(data.rows) ? data.rows : []);
        setSource(data.source === 'mssql' ? 'SQL Server data' : '');
        setSelectedDateField('START_DATE');
        setSelectedPaymentType(ALL_FILTER_VALUE);
        setSelectedPaymentCategory(ALL_FILTER_VALUE);
        setError('');
      } catch (error) {
        setError(error.message || 'Unable to reach the backend.');
        setPayments([]);
        setSource('');
      } finally {
        setLoading(false);
      }
    }

    loadPayments();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    window.localStorage.setItem('expense-theme-mode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    const chartHost = chartHostRef.current;

    if (!chartHost) {
      return undefined;
    }

    const updateChartWidth = (width) => {
      setChartWidth(Math.max(280, Math.floor(width)));
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
  }, []);

  const paymentTypeOptions = getFilterOptions(payments, 'payment_type');
  const paymentCategoryOptions = getFilterOptions(payments, 'payment_summary_type');
  const activePaymentType = normalizeFilterValue(selectedPaymentType, paymentTypeOptions);
  const activePaymentCategory = normalizeFilterValue(
    selectedPaymentCategory,
    paymentCategoryOptions
  );
  const filteredPayments = payments.filter((row) => {
    const paymentTypeMatches =
      activePaymentType === ALL_FILTER_VALUE || row.payment_type === activePaymentType;
    const paymentCategoryMatches =
      activePaymentCategory === ALL_FILTER_VALUE ||
      row.payment_summary_type === activePaymentCategory;

    return paymentTypeMatches && paymentCategoryMatches;
  });
  const chartData = buildChartData(filteredPayments, viewMode, selectedDateField);
  const viewConfig = VIEW_CONFIG[viewMode];
  const selectedDateFieldLabel =
    DATE_FIELD_OPTIONS.find((option) => option.value === selectedDateField)?.label ?? 'Start date';
  const chartTitle = `${viewConfig.titleLabel} Costs by ${selectedDateFieldLabel}`;

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="chart-layout">
          <div className="chart-header">
            <div>
              <p className="chart-eyebrow">Expense trend</p>
              <h1>{chartTitle}</h1>
            </div>
            <div className="header-actions">
              {source && <p className="chart-source">{source}</p>}
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

          <div className="dashboard-grid">
            <aside className="filter-panel">
              <div className="filter-panel-header">
                <p className="filter-heading">Filters</p>
                <p className="filter-copy">
                  Narrow the chart to a payment type or payment category.
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
                Showing {filteredPayments.length} of {payments.length} payment rows.
              </p>
            </aside>

            <div className="visual-column">
              <div ref={chartHostRef} className="chart-host">
                {loading && <p className="chart-message">Loading expense data...</p>}

                {!loading && error && <p className="chart-message chart-message-error">{error}</p>}

                {!loading && !error && chartData.length === 0 && (
                  <p className="chart-message">
                    {payments.length === 0
                      ? 'No payment rows are available for charting.'
                      : 'No payment rows match the selected filters.'}
                  </p>
                )}

                {!loading && !error && chartData.length > 0 && (
                  <LineChart
                    width={chartWidth}
                    height={360}
                    margin={{ top: 24, right: 24, bottom: 36, left: 72 }}
                    xAxis={[
                      {
                        scaleType: 'point',
                        data: chartData.map((bucket) => bucket.label)
                      }
                    ]}
                    yAxis={[
                      {
                        valueFormatter: formatCurrency
                      }
                    ]}
                    series={[
                      {
                        data: chartData.map((bucket) => bucket.total),
                        label: `${viewConfig.seriesLabel} from ANNUAL_AMT`,
                        color: 'var(--chart-line)',
                        valueFormatter: formatCurrency,
                        showMark: false
                      }
                    ]}
                    grid={{ horizontal: true }}
                    sx={{
                      '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': {
                        stroke: 'var(--chart-grid)'
                      },
                      '& .MuiChartsGrid-line': {
                        stroke: 'var(--chart-grid)'
                      },
                      '& .MuiChartsAxis-tickLabel, & .MuiChartsLegend-label': {
                        fill: 'var(--chart-text)'
                      }
                    }}
                  />
                )}
              </div>

              <div className="chart-footer">
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
