import { LineChart } from '@mui/x-charts/LineChart';

const formatCount = (value) => new Intl.NumberFormat('en-US').format(value);

export default function CustomerEscapesCard({ state, rows, selectedDateRange }) {
  const months = new Map();
  for (const row of rows) {
    const stamp = Date.parse(`${String(row.data_month).slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(stamp) || (selectedDateRange &&
      (stamp < selectedDateRange.startStamp || stamp > selectedDateRange.endStamp))) continue;
    const month = String(row.data_month).slice(0, 10);
    const bucket = months.get(month) ?? {
      month, software: 0, hardware: 0, documentation: 0, programs: new Set()
    };
    bucket.software += Number(row.software_escapes) || 0;
    bucket.hardware += Number(row.hardware_escapes) || 0;
    bucket.documentation += Number(row.documentation_escapes) || 0;
    bucket.programs.add(row.program_id);
    months.set(month, bucket);
  }
  const series = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  const latest = series.at(-1);
  const latestTotal = latest ? latest.software + latest.hardware + latest.documentation : null;
  const labels = series.map(row => new Date(`${row.month}T00:00:00Z`)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }));

  return (
    <article className="analytics-card" style={{ order: 7 }}>
      <div className="card-header">
        <div className="card-header-main"><h2 className="card-title">Customer Escapes</h2></div>
        <div className="card-info">
          <span title="Defense Systems; FINAL monthly V02 reported delivered units with software, hardware, or documentation defects. Counts are not distinct incidents. Reporting coverage changed substantially in 2025–26.">ⓘ</span>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="visual-column">
          <section className="metric-overview-band" aria-label="Customer escapes overview">
            <div className="metric-overview-summary metric-overview-summary-kpi-only">
              <div className="metric-overview-primary">
                <div className="metric-overview-value">{latestTotal == null || state.error ? '--' : formatCount(latestTotal)}</div>
                <p className="metric-overview-label">Reported defective units</p>
                <p className="metric-overview-sublabel">{latest?.month ?? 'No month'}</p>
              </div>
            </div>
          </section>
          {state.loading ? <p className="chart-message">Loading customer escapes...</p>
            : state.error ? <p className="chart-message chart-message-error">{state.error}</p>
            : !series.length ? <p className="chart-message">No customer escapes data for the selected filters and date range.</p>
            : <LineChart height={340} xAxis={[{ scaleType: 'point', data: labels }]}
                series={[
                  { label: 'Software', data: series.map(row => row.software), color: '#0057b8' },
                  { label: 'Hardware', data: series.map(row => row.hardware), color: '#ef8b23' },
                  { label: 'Documentation', data: series.map(row => row.documentation), color: '#8056ad' }
                ]} />}
          {latest && <p className="chart-message">
            {formatCount(latest.programs.size)} programs reported in {latest.month}.
            Coverage changes affect month-to-month comparisons.
          </p>}
        </div>
      </div>
    </article>
  );
}
