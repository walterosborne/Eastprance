import { useEffect, useMemo, useState } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';

const CHART_HEIGHT = 300;
const VIEW_CONFIG = {
  monthly: { label: 'Monthly' },
  quarterly: { label: 'Quarterly' },
  yearly: { label: 'Yearly' }
};

function normalizeText(value) {
  return String(value ?? '').trim();
}

function formatCurrency(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return '--';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(number);
}

function getMonthLabel(year, month) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function getBucket(row, viewMode) {
  const year = Number(row.year);
  const month = Number(row.month);

  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;

  if (viewMode === 'yearly') {
    return {
      key: `${year}`,
      stamp: Date.UTC(year, 0, 1),
      label: `${year}`
    };
  }

  if (viewMode === 'quarterly') {
    const quarter = Math.floor((month - 1) / 3) + 1;

    return {
      key: `${year}-Q${quarter}`,
      stamp: Date.UTC(year, (quarter - 1) * 3, 1),
      label: `Q${quarter} ${year}`
    };
  }

  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    stamp: Date.UTC(year, month - 1, 1),
    label: getMonthLabel(year, month)
  };
}

function buildChartData(rows, viewMode) {
  const buckets = new Map();

  rows.forEach((row) => {
    const bucket = getBucket(row, viewMode);
    const cost = Number(row.cost);

    if (!bucket || !Number.isFinite(cost)) return;

    const existing = buckets.get(bucket.key) ?? {
      ...bucket,
      controllable: 0,
      uncontrollable: 0,
      unclassified: 0,
      total: 0
    };
    const classification = normalizeText(row.controllable).toLowerCase();

    if (classification === 'controllable') {
      existing.controllable += cost;
    } else if (classification === 'uncontrollable') {
      existing.uncontrollable += cost;
    } else {
      existing.unclassified += cost;
    }

    existing.total += cost;
    buckets.set(bucket.key, existing);
  });

  const ordered = [...buckets.values()].sort((left, right) => left.stamp - right.stamp);

  return {
    labels: ordered.map((item) => item.label),
    controllable: ordered.map((item) => item.controllable),
    uncontrollable: ordered.map((item) => item.uncontrollable),
    unclassified: ordered.map((item) => item.unclassified),
    total: ordered.map((item) => item.total)
  };
}

function getPriorCompletedMonthTotal(rows) {
  const now = new Date();
  const priorMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year = priorMonth.getUTCFullYear();
  const month = priorMonth.getUTCMonth() + 1;

  return rows.reduce((sum, row) => (
    Number(row.year) === year && Number(row.month) === month
      ? sum + (Number(row.cost) || 0)
      : sum
  ), 0);
}

function getPriorCompletedMonthLabel() {
  const now = new Date();
  const priorMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(priorMonth);
}

export default function DatabricksRawComparisonCard() {
  const [state, setState] = useState({ loading: true, error: '', rows: [] });
  const [viewMode, setViewMode] = useState('monthly');
  const [chartVariant, setChartVariant] = useState('line');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setState({ loading: true, error: '', rows: [] });

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
          loading: false,
          error: '',
          rows: Array.isArray(payload?.rows) ? payload.rows : []
        });
      } catch (error) {
        if (error?.name === 'AbortError') return;

        setState({
          loading: false,
          error: error?.message || 'Unable to load raw Databricks costs.',
          rows: []
        });
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  const chartData = useMemo(
    () => buildChartData(state.rows, viewMode),
    [state.rows, viewMode]
  );
  const priorMonthTotal = useMemo(
    () => getPriorCompletedMonthTotal(state.rows),
    [state.rows]
  );
  const priorMonthLabel = getPriorCompletedMonthLabel();
  const hasData = chartData.labels.length > 0;
  const commonSeries = [
    {
      data: chartData.controllable,
      label: 'Controllable',
      color: 'var(--chart-line)',
      valueFormatter: formatCurrency
    },
    {
      data: chartData.uncontrollable,
      label: 'Uncontrollable',
      color: 'var(--chart-accent-line)',
      valueFormatter: formatCurrency
    },
    {
      data: chartData.unclassified,
      label: 'Unclassified',
      color: 'var(--chart-secondary-line)',
      valueFormatter: formatCurrency
    }
  ];

  return (
    <article
      className="analytics-card"
      style={{ order: 3 }}
      data-databricks-raw-comparison="true"
    >
      <div style={{ padding: '1rem 1rem 0' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
          Controllable Costs — Databricks Raw
        </h2>
      </div>

      <div className="dashboard-grid">
        <div className="visual-column">
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '0.75rem 0 0.25rem'
            }}
          >
            <div>
              <div style={{ fontSize: '1.7rem', fontWeight: 700 }}>
                {state.loading || state.error ? '--' : formatCurrency(priorMonthTotal)}
              </div>
              <div style={{ fontSize: '0.8rem', opacity: 0.72 }}>Total Cost</div>
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.72 }}>{priorMonthLabel}</div>
          </div>

          <div className="chart-host">
            {state.loading && (
              <p className="chart-message">Loading raw Databricks cost data...</p>
            )}

            {!state.loading && state.error && (
              <p className="chart-message chart-message-error">{state.error}</p>
            )}

            {!state.loading && !state.error && !hasData && (
              <p className="chart-message">No raw Databricks costs are available for charting.</p>
            )}

            {!state.loading && !state.error && hasData && (
              chartVariant === 'bar' ? (
                <BarChart
                  height={CHART_HEIGHT}
                  xAxis={[{ scaleType: 'band', data: chartData.labels }]}
                  series={commonSeries}
                  grid={{ horizontal: true }}
                />
              ) : (
                <LineChart
                  height={CHART_HEIGHT}
                  xAxis={[{ scaleType: 'point', data: chartData.labels }]}
                  series={commonSeries.map((series) => ({
                    ...series,
                    showMark: chartData.labels.length <= 1
                  }))}
                  grid={{ horizontal: true }}
                />
              )
            )}
          </div>

          <div
            className="chart-control-row chart-control-row-single"
            style={{ justifyContent: 'space-between', gap: '0.75rem' }}
          >
            <ToggleButtonGroup
              value={chartVariant}
              exclusive
              size="small"
              onChange={(_event, nextVariant) => {
                if (nextVariant) setChartVariant(nextVariant);
              }}
              aria-label="Raw Databricks chart type"
            >
              <ToggleButton value="line">Line</ToggleButton>
              <ToggleButton value="bar">Bar</ToggleButton>
            </ToggleButtonGroup>
          </div>

          <div className="chart-footer chart-footer-match-labor">
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              fullWidth
              onChange={(_event, nextMode) => {
                if (nextMode) setViewMode(nextMode);
              }}
              aria-label="Raw Databricks timeline"
            >
              {Object.entries(VIEW_CONFIG).map(([mode, config]) => (
                <ToggleButton key={mode} value={mode}>
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
