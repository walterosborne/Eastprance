import { getLatestDataMonth, hasKpiValue, KpiMonthLabel } from './KpiMonth';
import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartColumn, faChartLine } from '@fortawesome/free-solid-svg-icons';
import {
  Autocomplete,
  Checkbox,
  FormControl,
  MenuItem,
  Paper,
  Select,
  TextField,
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
  useAxesTooltip
} from '@mui/x-charts';

const RAW_TABLE_NAME = 'finance_dev.analytics.dev_cv_transaction_details';
const ALL_FILTER_VALUE = '__all__';
const MAX_PALETTE_GROUPS = 20;
const CHART_HEIGHT = 332;
const CHART_MARGIN = { top: 12, right: 12, bottom: 4, left: 0 };
const VIEW_CONFIG = {
  monthly: { label: 'Monthly' },
  quarterly: { label: 'Quarterly' },
  yearly: { label: 'Annual' }
};
const FILTER_FIELDS = [
  { value: 'division', label: 'Division', allLabel: 'All divisions' },
  { value: 'business_unit', label: 'Business Unit', allLabel: 'All business units' },
  { value: 'facility', label: 'Facility', allLabel: 'All facilities' }
];
const PALETTE_COLORS = [
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
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gridAutoRows: 'minmax(0, 1fr)',
  width: '88px',
  minWidth: '88px',
  alignItems: 'center',
  backgroundColor: 'var(--surface-muted)',
  border: '1px solid var(--border)',
  borderRadius: '14px',
  padding: '0.18rem',
  gap: '0.18rem',
  overflow: 'hidden',
  '& .MuiToggleButtonGroup-grouped': {
    width: '100%',
    minWidth: 0,
    margin: 0,
    border: 0
  }
};

const chartTypeToggleButtonSx = {
  minWidth: 28,
  width: '100%',
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

const inlineSelectSx = {
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
  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline, & .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--text-primary)'
  },
  '& .MuiSvgIcon-root': {
    color: 'var(--input-text)',
    fontSize: '0.95rem'
  }
};

const inlineAutocompleteSx = {
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
  '& .raw-filter-value-summary': {
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexShrink: 1,
    fontWeight: 600,
    color: 'var(--input-text)'
  },
  '& .MuiOutlinedInput-root.Mui-focused .raw-filter-value-summary': {
    display: 'none'
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--input-border)'
  },
  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline, & .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
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

const optionCheckboxSx = {
  p: 0.25,
  mr: 0.6,
  color: 'var(--text-secondary)',
  '&.Mui-checked': {
    color: 'var(--selected-bg)'
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

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});
const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});
const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});
const monthYearFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
});

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatCurrency(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? currencyFormatter.format(numericValue) : '--';
}

function formatOverviewCurrency(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? compactCurrencyFormatter.format(numericValue) : '--';
}

function formatMillionsCurrencyAxis(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '';
  const sign = numericValue < 0 ? '-' : '';
  return `${sign}$${numberFormatter.format(Math.abs(numericValue) / 1000000)}M`;
}

function formatPercent(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numberFormatter.format(numericValue * 100)}%` : '--';
}

function getMonthStamp(row) {
  const year = Number(row?.year);
  const month = Number(row?.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return Date.UTC(year, month - 1, 1);
}

function getLastCompletedMonthStamp() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
}

function getVisibleRows(rows) {
  const lastCompletedMonthStamp = getLastCompletedMonthStamp();
  return rows.filter((row) => {
    const stamp = getMonthStamp(row);
    return stamp != null && stamp >= Date.UTC(2025, 0, 1) && stamp <= lastCompletedMonthStamp;
  });
}

function getFilterOptions(rows, fieldName) {
  return [...new Set(rows.map((row) => normalizeText(row?.[fieldName])).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function buildTrendData(rows, viewMode) {
  const buckets = new Map();

  rows.forEach((row) => {
    const stamp = getMonthStamp(row);
    const cost = Number(row?.cost);
    if (stamp == null || !Number.isFinite(cost)) return;

    const date = new Date(stamp);
    const year = date.getUTCFullYear();
    const monthIndex = date.getUTCMonth();
    const quarter = Math.floor(monthIndex / 3) + 1;
    const key = viewMode === 'yearly'
      ? String(year)
      : viewMode === 'quarterly'
        ? `${year}-Q${quarter}`
        : String(stamp);
    const label = viewMode === 'yearly'
      ? String(year)
      : viewMode === 'quarterly'
        ? `Q${quarter} ${year}`
        : monthYearFormatter.format(date);
    const sortValue = viewMode === 'yearly'
      ? year
      : viewMode === 'quarterly'
        ? year * 10 + quarter
        : stamp;
    const bucket = buckets.get(key) ?? {
      label,
      sortValue,
      total: 0,
      controllable: 0,
      uncontrollable: 0,
      unclassified: 0
    };
    const classification = normalizeText(row?.controllable).toLowerCase();

    bucket.total += cost;
    if (classification === 'controllable') {
      bucket.controllable += cost;
    } else if (classification === 'uncontrollable') {
      bucket.uncontrollable += cost;
    } else {
      bucket.unclassified += cost;
    }
    buckets.set(key, bucket);
  });

  const ordered = [...buckets.values()].sort((left, right) => left.sortValue - right.sortValue);
  return {
    labels: ordered.map((bucket) => bucket.label),
    total: ordered.map((bucket) => Number(bucket.total.toFixed(2))),
    controllable: ordered.map((bucket) => Number(bucket.controllable.toFixed(2))),
    uncontrollable: ordered.map((bucket) => Number(bucket.uncontrollable.toFixed(2))),
    unclassified: ordered.map((bucket) => Number(bucket.unclassified.toFixed(2)))
  };
}

function buildPaletteData(rows, groupFieldName, colorFieldName) {
  const groups = new Map();
  const colorTotals = new Map();

  rows.forEach((row) => {
    const cost = Number(row?.cost);
    if (!Number.isFinite(cost)) return;

    const groupLabel = normalizeText(row?.[groupFieldName]) || 'Unspecified';
    const colorLabel = normalizeText(row?.[colorFieldName]) || 'Unspecified';
    const group = groups.get(groupLabel) ?? {
      label: groupLabel,
      magnitude: 0,
      breakdown: new Map()
    };

    group.magnitude += Math.abs(cost);
    group.breakdown.set(colorLabel, (group.breakdown.get(colorLabel) ?? 0) + cost);
    groups.set(groupLabel, group);
    colorTotals.set(colorLabel, (colorTotals.get(colorLabel) ?? 0) + Math.abs(cost));
  });

  const visibleGroups = [...groups.values()]
    .sort((left, right) => right.magnitude - left.magnitude || left.label.localeCompare(right.label))
    .slice(0, MAX_PALETTE_GROUPS);
  const visibleColorSet = new Set();
  visibleGroups.forEach((group) => {
    group.breakdown.forEach((value, label) => {
      if (Number.isFinite(value) && value !== 0) visibleColorSet.add(label);
    });
  });
  const colorLabels = [...colorTotals.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label]) => label)
    .filter((label) => visibleColorSet.has(label));

  return {
    labels: visibleGroups.map((group) => group.label),
    series: colorLabels.map((label, index) => ({
      id: `raw-palette-${label}`,
      label,
      color: PALETTE_COLORS[index % PALETTE_COLORS.length],
      data: visibleGroups.map((group) => Number((group.breakdown.get(label) ?? 0).toFixed(2))),
      valueFormatter: formatCurrency,
      stack: 'total'
    }))
  };
}

function buildParetoData(rows, fieldName) {
  const totals = new Map();
  rows.forEach((row) => {
    const cost = Number(row?.cost);
    if (!Number.isFinite(cost) || cost <= 0) return;
    const label = normalizeText(row?.[fieldName]) || 'Unspecified';
    totals.set(label, (totals.get(label) ?? 0) + cost);
  });

  const entries = [...totals.entries()]
    .map(([label, total]) => ({ label, total: Number(total.toFixed(2)) }))
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
    .slice(0, MAX_PALETTE_GROUPS);
  const grandTotal = entries.reduce((sum, entry) => sum + entry.total, 0);
  let runningTotal = 0;

  return {
    labels: entries.map((entry) => entry.label),
    values: entries.map((entry) => entry.total),
    cumulativeShares: entries.map((entry) => {
      runningTotal += entry.total;
      return grandTotal > 0 ? runningTotal / grandTotal : 0;
    })
  };
}

function getGoalLine(totalSeries) {
  const values = totalSeries.map(Number).filter(Number.isFinite);
  if (values.length === 0) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { value: average * 0.95 };
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

function StandardChartTooltip(props) {
  const tooltipData = useAxesTooltip();
  if (!tooltipData?.length) return null;

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
        {tooltipData.map(({ axisId, axisFormattedValue, seriesItems }) => (
          <table key={axisId} style={{ borderCollapse: 'collapse', minWidth: 220 }}>
            <caption
              style={{
                padding: '8px 12px',
                textAlign: 'left',
                borderBottom: '1px solid var(--border)',
                color: 'var(--input-text)',
                fontWeight: 600
              }}
            >
              {axisFormattedValue}
            </caption>
            <tbody>
              {seriesItems
                .filter((item) => item?.formattedValue != null)
                .map((item) => (
                  <tr key={item.seriesId}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>
                      <TooltipMark color={item.color} />
                      {item.formattedLabel}
                    </th>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                      {item.formattedValue}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        ))}
      </Paper>
    </ChartsTooltipContainer>
  );
}

function PaletteChartToggleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none">
      <rect x="8" y="3.5" width="8" height="4" rx="1" fill="currentColor" />
      <rect x="8" y="9.8" width="8" height="4" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="8" y="16.1" width="8" height="4" rx="1" fill="currentColor" opacity="0.6" />
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

function useChartWidth() {
  const [chartHost, setChartHost] = useState(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    if (!chartHost) return undefined;
    const measure = () => setChartWidth(Math.max(0, Math.floor(chartHost.clientWidth)));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setChartWidth(Math.max(0, Math.floor(entry.contentRect.width)));
    });
    observer.observe(chartHost);
    return () => observer.disconnect();
  }, [chartHost]);

  return { chartHostRef: setChartHost, chartWidth };
}

function ChartControls({
  variant,
  onVariantChange,
  filterField,
  onFilterFieldChange,
  filterValues,
  onFilterValuesChange,
  filterValueOptions,
  paletteGroupField,
  onPaletteGroupFieldChange,
  paletteColorField,
  onPaletteColorFieldChange
}) {
  const isFilterMode = variant === 'line' || variant === 'bar';
  const isPaletteMode = variant === 'palette';
  const isParetoMode = variant === 'pareto';
  const activeFilter = FILTER_FIELDS.find((option) => option.value === filterField) ?? FILTER_FIELDS[0];
  const paletteGroupOptions = FILTER_FIELDS.filter((option) => option.value !== paletteColorField);
  const paletteColorOptions = FILTER_FIELDS.filter((option) => option.value !== paletteGroupField);

  return (
    <div className="chart-type-toggle-bar chart-type-toggle-bar-with-filter">
      <ToggleButtonGroup
        value={variant}
        exclusive
        size="small"
        onChange={(_event, nextVariant) => {
          if (nextVariant) onVariantChange(nextVariant);
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
        <ToggleButton value="palette" sx={chartTypeToggleButtonSx} aria-label="Grouped palette chart">
          <PaletteChartToggleIcon />
        </ToggleButton>
        <ToggleButton value="pareto" sx={chartTypeToggleButtonSx} aria-label="Pareto chart">
          <ParetoChartToggleIcon />
        </ToggleButton>
      </ToggleButtonGroup>

      <div className={`chart-type-inline-filter chart-type-inline-filter-visible${isParetoMode ? ' chart-type-inline-filter-single' : ''}`}>
        {(isFilterMode || isParetoMode) && (
          <FormControl fullWidth size="small" sx={inlineSelectSx}>
            <Select
              value={filterField}
              onChange={(event) => onFilterFieldChange(event.target.value)}
              renderValue={() => activeFilter.label}
              MenuProps={selectMenuProps}
              inputProps={{ 'aria-label': 'Select Databricks Raw filter field' }}
            >
              {FILTER_FIELDS.map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {isFilterMode && (
          <Autocomplete
            multiple
            disableCloseOnSelect
            options={filterValueOptions}
            value={filterValues}
            onChange={(_event, nextValues) => onFilterValuesChange(nextValues)}
            renderValue={(selectedValues) => (
              <span className="raw-filter-value-summary">
                {selectedValues.length === 1 ? selectedValues[0] : `${selectedValues.length} selected`}
              </span>
            )}
            renderOption={(optionProps, option, { selected }) => {
              const { key, ...remainingOptionProps } = optionProps;
              return (
                <li key={key} {...remainingOptionProps}>
                  <Checkbox checked={selected} size="small" disableRipple sx={optionCheckboxSx} />
                  {option}
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={filterValues.length === 0 ? activeFilter.allLabel : ''}
                inputProps={{ ...params.inputProps, 'aria-label': 'Select Databricks Raw filter values' }}
              />
            )}
            slotProps={{ paper: selectMenuProps.PaperProps }}
            sx={inlineAutocompleteSx}
          />
        )}

        {isPaletteMode && (
          <>
            <div className="chart-type-inline-field">
              <span className="chart-type-inline-field-label">Group by</span>
              <FormControl fullWidth size="small" sx={inlineSelectSx}>
                <Select
                  value={paletteGroupField}
                  onChange={(event) => onPaletteGroupFieldChange(event.target.value)}
                  MenuProps={selectMenuProps}
                  inputProps={{ 'aria-label': 'Select Databricks Raw group field' }}
                >
                  {paletteGroupOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </div>
            <div className="chart-type-inline-field">
              <span className="chart-type-inline-field-label">Color by</span>
              <FormControl fullWidth size="small" sx={inlineSelectSx}>
                <Select
                  value={paletteColorField}
                  onChange={(event) => onPaletteColorFieldChange(event.target.value)}
                  MenuProps={selectMenuProps}
                  inputProps={{ 'aria-label': 'Select Databricks Raw color field' }}
                >
                  {paletteColorOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TrendChart({ width, variant, data, goalLine }) {
  const series = [
    {
      data: data.controllable,
      label: 'Controllable',
      color: 'var(--chart-line)',
      valueFormatter: formatCurrency,
      showMark: data.labels.length <= 1
    },
    {
      data: data.uncontrollable,
      label: 'Uncontrollable',
      color: 'var(--chart-accent-line)',
      valueFormatter: formatCurrency,
      showMark: data.labels.length <= 1
    },
    {
      data: data.unclassified,
      label: 'Unclassified',
      color: 'var(--chart-secondary-line)',
      valueFormatter: formatCurrency,
      showMark: data.labels.length <= 1
    }
  ];
  const yAxis = [{
    min: 0,
    width: 66,
    valueFormatter: formatMillionsCurrencyAxis,
    tickLabelStyle: { fontSize: 11 }
  }];
  const commonProps = {
    width,
    height: CHART_HEIGHT,
    hideLegend: true,
    margin: CHART_MARGIN,
    xAxis: [{ scaleType: variant === 'bar' ? 'band' : 'point', height: 28, data: data.labels }],
    yAxis,
    series: variant === 'bar' ? series.map(({ showMark, ...item }) => item) : series,
    grid: { horizontal: true },
    sx: sharedChartSx,
    slots: { tooltip: StandardChartTooltip },
    slotProps: { tooltip: { trigger: 'axis' } },
    children: goalLine ? (
      <ChartsReferenceLine
        y={goalLine.value}
        label={`Goal ${formatMillionsCurrencyAxis(goalLine.value)}`}
        labelAlign="end"
        lineStyle={goalLineStyle}
        labelStyle={goalLabelStyle}
      />
    ) : null
  };

  return variant === 'bar' ? <BarChart {...commonProps} /> : <LineChart {...commonProps} />;
}

function ParetoChart({ width, data }) {
  return (
    <ChartsContainer
      width={width}
      height={CHART_HEIGHT}
      margin={CHART_MARGIN}
      series={[
        {
          type: 'bar',
          id: 'raw-pareto-bars',
          data: data.values,
          label: 'Total cost',
          color: 'var(--chart-line)',
          valueFormatter: formatCurrency,
          yAxisId: 'value-axis'
        },
        {
          type: 'line',
          id: 'raw-pareto-cumulative',
          data: data.cumulativeShares,
          label: 'Cumulative share',
          color: 'var(--chart-accent-line)',
          valueFormatter: formatPercent,
          yAxisId: 'cumulative-axis',
          showMark: false
        }
      ]}
      xAxis={[{ id: 'raw-pareto-categories', scaleType: 'band', height: 28, data: data.labels }]}
      yAxis={[
        {
          id: 'value-axis',
          min: 0,
          width: 66,
          valueFormatter: formatMillionsCurrencyAxis,
          tickLabelStyle: { fontSize: 11 }
        },
        {
          id: 'cumulative-axis',
          position: 'right',
          min: 0,
          max: 1,
          width: 52,
          valueFormatter: formatPercent,
          tickLabelStyle: { fontSize: 11 }
        }
      ]}
      sx={sharedChartSx}
    >
      <ChartsGrid horizontal />
      <BarPlot />
      <LinePlot />
      <MarkPlot />
      <ChartsXAxis axisId="raw-pareto-categories" />
      <ChartsYAxis axisId="value-axis" />
      <ChartsYAxis axisId="cumulative-axis" />
      <StandardChartTooltip trigger="axis" />
    </ChartsContainer>
  );
}

export default function DatabricksRawComparisonCard() {
  const [state, setState] = useState({ rows: [], loading: true, error: '' });
  const [viewMode, setViewMode] = useState('monthly');
  const [chartVariant, setChartVariant] = useState('line');
  const [filterField, setFilterField] = useState(FILTER_FIELDS[0].value);
  const [filterValues, setFilterValues] = useState([]);
  const [paletteGroupField, setPaletteGroupField] = useState(FILTER_FIELDS[0].value);
  const [paletteColorField, setPaletteColorField] = useState(FILTER_FIELDS[1].value);
  const { chartHostRef, chartWidth } = useChartWidth();

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch('/api/controllable-costs-databricks-raw', {
          signal: controller.signal,
          credentials: 'same-origin'
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || payload?.message || 'Unable to load raw Databricks costs.');
        }
        setState({
          rows: Array.isArray(payload?.rows) ? payload.rows : [],
          loading: false,
          error: ''
        });
      } catch (error) {
        if (error?.name === 'AbortError') return;
        setState({ rows: [], loading: false, error: error?.message || 'Unable to load raw Databricks costs.' });
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  const visibleRows = useMemo(() => getVisibleRows(state.rows), [state.rows]);
  const filterValueOptions = useMemo(
    () => getFilterOptions(visibleRows, filterField),
    [visibleRows, filterField]
  );
  const activeFilterValues = filterValues.filter((value) => filterValueOptions.includes(value));
  const filteredRows = useMemo(
    () => visibleRows.filter((row) => (
      activeFilterValues.length === 0
      || activeFilterValues.includes(normalizeText(row?.[filterField]))
    )),
    [visibleRows, filterField, activeFilterValues.join('|')]
  );
  const chartRows = chartVariant === 'line' || chartVariant === 'bar' ? filteredRows : visibleRows;
  const trendData = useMemo(
    () => buildTrendData(chartRows, viewMode),
    [chartRows, viewMode]
  );
  const paletteData = useMemo(
    () => buildPaletteData(visibleRows, paletteGroupField, paletteColorField),
    [visibleRows, paletteGroupField, paletteColorField]
  );
  const paretoData = useMemo(
    () => buildParetoData(visibleRows, filterField),
    [visibleRows, filterField]
  );
  const summaryMonth = getLatestDataMonth(chartRows,
    (row) => hasKpiValue(row.cost) ? getMonthStamp(row) : null
  );
  const summaryValue = chartRows.reduce((sum, row) =>
    summaryMonth != null && getMonthStamp(row) === summaryMonth && hasKpiValue(row.cost)
      ? sum + Number(row.cost) : sum, 0
  );
  const goalLine = useMemo(() => getGoalLine(trendData.controllable), [trendData.controllable]);
  const hasChartData = chartVariant === 'palette'
    ? paletteData.labels.length > 0
    : chartVariant === 'pareto'
      ? paretoData.labels.length > 0
      : trendData.labels.length > 0;
  const tooltipLegend = chartVariant === 'palette'
    ? paletteData.series.map((series) => ({ label: series.label, color: series.color }))
    : chartVariant === 'pareto'
      ? [
        { label: 'Total cost', color: 'var(--chart-line)' },
        { label: 'Cumulative share', color: 'var(--chart-accent-line)' }
      ]
      : [
        { label: 'Controllable', color: 'var(--chart-line)' },
        { label: 'Uncontrollable', color: 'var(--chart-accent-line)' },
        { label: 'Unclassified', color: 'var(--chart-secondary-line)' }
      ];

  return (
    <article className="analytics-card" style={{ order: 3 }} data-databricks-raw-comparison="true">
      <div className="card-header">
        <div className="card-header-main">
          <h2 className="card-title">Controllable Costs — Databricks Raw</h2>
        </div>
        <div className="card-info">
          <button type="button" className="card-info-trigger" aria-label="Databricks Raw metric info">?</button>
          <div className="card-info-tooltip" role="tooltip">
            <div className="metric-info-legend">
              <p className="metric-info-legend-title">Chart legend</p>
              <div className="metric-info-legend-list">
                {tooltipLegend.map((item) => (
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
            <p className="metric-info-paragraph">
              Raw Databricks controllable-cost transactions from {RAW_TABLE_NAME}, mapped through the same QMI hierarchy, facility, division-specific G/L, cost-category, and controllability rules used by the SQL extract.
            </p>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="visual-column">
          <section className="metric-overview-band" aria-label="Databricks Raw controllable costs overview">
            <div className="metric-overview-summary metric-overview-summary-kpi-only">
              <div className="metric-overview-primary">
                <p className="metric-overview-value">
                  {state.loading || state.error || summaryMonth == null ? '--' : formatOverviewCurrency(summaryValue)}
                </p>
                <p className="metric-overview-label">Total Cost</p>
                <p className="metric-overview-sublabel"><KpiMonthLabel stamp={summaryMonth} /></p>
              </div>
            </div>
          </section>

          <div ref={chartHostRef} className="chart-host">
            {state.loading && <p className="chart-message">Loading Databricks cost data...</p>}
            {!state.loading && state.error && (
              <p className="chart-message chart-message-error">{state.error}</p>
            )}
            {!state.loading && !state.error && !hasChartData && (
              <p className="chart-message">
                {state.rows.length === 0
                  ? 'No Databricks Raw costs are available for charting.'
                  : activeFilterValues.length > 0 && filteredRows.length === 0
                    ? 'No Databricks Raw costs were found for the selected filters.'
                    : 'No Databricks Raw costs were found in the completed-month date range.'}
              </p>
            )}
            {!state.loading && !state.error && hasChartData && chartWidth > 0 && (
              chartVariant === 'pareto' ? (
                <ParetoChart width={chartWidth} data={paretoData} />
              ) : chartVariant === 'palette' ? (
                <BarChart
                  width={chartWidth}
                  height={CHART_HEIGHT}
                  hideLegend
                  margin={CHART_MARGIN}
                  xAxis={[{ scaleType: 'band', height: 28, data: paletteData.labels }]}
                  yAxis={[{
                    min: 0,
                    width: 66,
                    valueFormatter: formatMillionsCurrencyAxis,
                    tickLabelStyle: { fontSize: 11 }
                  }]}
                  series={paletteData.series}
                  grid={{ horizontal: true }}
                  sx={sharedChartSx}
                  slots={{ tooltip: StandardChartTooltip }}
                  slotProps={{ tooltip: { trigger: 'axis' } }}
                />
              ) : (
                <TrendChart
                  width={chartWidth}
                  variant={chartVariant === 'bar' ? 'bar' : 'line'}
                  data={trendData}
                  goalLine={goalLine}
                />
              )
            )}
          </div>

          <div className="chart-control-row chart-control-row-single">
            <div className="chart-control-row-toggle">
              <ChartControls
                variant={chartVariant}
                onVariantChange={setChartVariant}
                filterField={filterField}
                onFilterFieldChange={(nextField) => {
                  setFilterField(nextField);
                  setFilterValues([]);
                }}
                filterValues={activeFilterValues}
                onFilterValuesChange={setFilterValues}
                filterValueOptions={filterValueOptions}
                paletteGroupField={paletteGroupField}
                onPaletteGroupFieldChange={(nextField) => {
                  setPaletteGroupField(nextField);
                  if (nextField === paletteColorField) {
                    setPaletteColorField(FILTER_FIELDS.find((option) => option.value !== nextField)?.value ?? nextField);
                  }
                }}
                paletteColorField={paletteColorField}
                onPaletteColorFieldChange={(nextField) => {
                  setPaletteColorField(nextField);
                  if (nextField === paletteGroupField) {
                    setPaletteGroupField(FILTER_FIELDS.find((option) => option.value !== nextField)?.value ?? nextField);
                  }
                }}
              />
            </div>
          </div>

          <div className="chart-footer chart-footer-match-labor">
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              fullWidth
              onChange={(_event, nextMode) => {
                if (nextMode) setViewMode(nextMode);
              }}
              sx={timelineToggleGroupSx}
              aria-label="Databricks Raw timeline"
            >
              {Object.entries(VIEW_CONFIG).map(([mode, config]) => (
                <ToggleButton key={mode} value={mode} sx={timelineToggleButtonSx}>
                  {config.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>
        </div>
      </div>
    </article>
  );
}

