import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import { COST_CLASSIFICATION_DBM_QUERY } from './dbmQueries/costClassificationQuery.js';
import { getConnectionConfig, getPool } from './sqlConnection.js';

const COVERAGE_TARGET = 0.95;
const MIN_VISIBLE_ROWS = 40;
const MAX_VISIBLE_ROWS = 150;

function normalizeText(value, fallback = '(Blank)') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundCurrency(value) {
  return Number(normalizeNumber(value).toFixed(2));
}

function formatPeriod(period) {
  const numeric = Number(period);

  if (!Number.isInteger(numeric)) {
    return 'None';
  }

  const year = Math.floor(numeric / 100);
  const month = numeric % 100;

  if (year < 2000 || month < 1 || month > 12) {
    return 'None';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function addCoverage(rows) {
  const totalMagnitude = rows.reduce((sum, row) => sum + Math.abs(row.netCost), 0);
  let runningMagnitude = 0;

  return rows.map((row, index) => {
    const magnitude = Math.abs(row.netCost);
    runningMagnitude += magnitude;

    return {
      ...row,
      rank: index + 1,
      absoluteNetCost: roundCurrency(magnitude),
      absoluteShare: totalMagnitude > 0 ? magnitude / totalMagnitude : 0,
      cumulativeShare: totalMagnitude > 0 ? runningMagnitude / totalMagnitude : 0
    };
  });
}

function buildCategorySummary(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = `${row.level3Category}|||${row.level4Category}`;
    const group = groups.get(key) ?? {
      level3Category: row.level3Category,
      level4Category: row.level4Category,
      netCost: 0,
      transactionRowCount: 0,
      costElementCount: 0
    };

    group.netCost += row.netCost;
    group.transactionRowCount += row.transactionRowCount;
    group.costElementCount += 1;
    groups.set(key, group);
  });

  return addCoverage(
    [...groups.values()]
      .map((group) => ({
        ...group,
        netCost: roundCurrency(group.netCost)
      }))
      .sort((left, right) => Math.abs(right.netCost) - Math.abs(left.netCost))
  );
}

function getRowsNeededForCoverage(rows, target) {
  const match = rows.find((row) => row.cumulativeShare >= target);
  return match?.rank ?? rows.length;
}

function buildPayload(sourceRows, config) {
  const normalizedRows = sourceRows
    .map((row) => ({
      costElement: normalizeText(row.cost_element),
      costElementDescription: normalizeText(row.cost_element_description),
      level3Category: normalizeText(row.level_3_category, 'Other'),
      level4Category: normalizeText(row.level_4_category, 'Other'),
      transactionRowCount: normalizeNumber(row.transaction_row_count),
      netCost: roundCurrency(row.net_cost),
      firstPeriod: Number(row.first_period),
      latestPeriod: Number(row.latest_period)
    }))
    .filter((row) => Number.isFinite(row.netCost));

  const costElementRows = addCoverage(
    normalizedRows.sort((left, right) => Math.abs(right.netCost) - Math.abs(left.netCost))
  );
  const categoryRows = buildCategorySummary(normalizedRows);
  const rowsTo95 = getRowsNeededForCoverage(costElementRows, 0.95);
  const rowsTo99 = getRowsNeededForCoverage(costElementRows, 0.99);
  const visibleRowCount = Math.min(
    MAX_VISIBLE_ROWS,
    Math.max(MIN_VISIBLE_ROWS, rowsTo95)
  );
  const firstPeriods = normalizedRows.map((row) => row.firstPeriod).filter(Number.isInteger);
  const latestPeriods = normalizedRows.map((row) => row.latestPeriod).filter(Number.isInteger);

  return {
    generatedAt: new Date().toISOString(),
    source: 'dbm-sql',
    server: config.server,
    database: config.database,
    firstPeriod: formatPeriod(firstPeriods.length > 0 ? Math.min(...firstPeriods) : null),
    latestPeriod: formatPeriod(latestPeriods.length > 0 ? Math.max(...latestPeriods) : null),
    totalNetCost: roundCurrency(normalizedRows.reduce((sum, row) => sum + row.netCost, 0)),
    totalAbsoluteNetCost: roundCurrency(
      normalizedRows.reduce((sum, row) => sum + Math.abs(row.netCost), 0)
    ),
    transactionRowCount: normalizedRows.reduce(
      (sum, row) => sum + row.transactionRowCount,
      0
    ),
    costElementCombinationCount: costElementRows.length,
    rowsTo95,
    rowsTo99,
    coverageTarget: COVERAGE_TARGET,
    visibleRowCount,
    categoryRows,
    costElementRows: costElementRows.slice(0, visibleRowCount)
  };
}

export async function readCostClassificationDiagnostics() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig('dbm');

  if (missing.length > 0) {
    throw new Error(`DBM configuration is incomplete: ${missing.join(', ')}`);
  }

  try {
    const pool = await getPool(config, 'dbm');
    const result = await pool.request().query(COST_CLASSIFICATION_DBM_QUERY);
    const payload = buildPayload(result.recordset, config);

    logDebug('cost-classification', 'Cost classification diagnostics completed.', {
      rowCount: payload.costElementCombinationCount,
      rowsTo95: payload.rowsTo95,
      rowsTo99: payload.rowsTo99,
      totalNetCost: payload.totalNetCost,
      duration: formatDuration(stopTimer())
    });

    return payload;
  } catch (error) {
    logError('cost-classification', 'Cost classification diagnostics failed.', error, {
      server: config.server,
      database: config.database,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});
const countFormatter = new Intl.NumberFormat('en-US');
const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function formatCurrency(value) {
  return currencyFormatter.format(normalizeNumber(value));
}

function formatCount(value) {
  return countFormatter.format(normalizeNumber(value));
}

function formatPercent(value) {
  return percentFormatter.format(normalizeNumber(value));
}

function renderCategoryRows(rows) {
  return rows.map((row) => `
    <tr>
      <td>${row.rank}</td>
      <td>${escapeHtml(row.level3Category)}</td>
      <td>${escapeHtml(row.level4Category)}</td>
      <td>${formatCount(row.costElementCount)}</td>
      <td>${formatCurrency(row.netCost)}</td>
      <td>${formatPercent(row.absoluteShare)}</td>
      <td>${formatPercent(row.cumulativeShare)}</td>
    </tr>
  `).join('');
}

function renderCostElementRows(rows) {
  return rows.map((row) => `
    <tr class="${row.cumulativeShare <= COVERAGE_TARGET ? 'coverage' : ''}">
      <td>${row.rank}</td>
      <td class="mono">${escapeHtml(row.costElement)}</td>
      <td>${escapeHtml(row.costElementDescription)}</td>
      <td>${escapeHtml(row.level3Category)}</td>
      <td>${escapeHtml(row.level4Category)}</td>
      <td>${formatCurrency(row.netCost)}</td>
      <td>${formatPercent(row.absoluteShare)}</td>
      <td>${formatPercent(row.cumulativeShare)}</td>
      <td>${formatCount(row.transactionRowCount)}</td>
    </tr>
  `).join('');
}

export function renderCostClassificationDiagnosticsPage(payload) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cost Classification</title>
  <style>
    :root { color-scheme: dark; font-family: Arial, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; background: #111827; color: #f3f4f6; }
    main { width: min(1500px, 100%); margin: 0 auto; display: grid; gap: 12px; }
    .hero, .panel, .card { border: 1px solid #374151; border-radius: 10px; background: #1f2937; }
    .hero { padding: 14px 16px; display: flex; justify-content: space-between; gap: 16px; align-items: center; }
    h1, h2, p { margin-top: 0; }
    h1 { margin-bottom: 4px; font-size: 22px; }
    h2 { margin-bottom: 10px; font-size: 16px; }
    .muted { color: #9ca3af; font-size: 12px; margin-bottom: 0; }
    .button { color: white; text-decoration: none; border: 1px solid #4b5563; border-radius: 999px; padding: 8px 12px; font-size: 12px; font-weight: 700; }
    .summary { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
    .card { padding: 10px 12px; background: #111827; }
    .card span { display: block; color: #9ca3af; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; }
    .card strong { font-size: 15px; overflow-wrap: anywhere; }
    .panel { padding: 12px; }
    .table-scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 7px 8px; border: 1px solid #374151; text-align: left; white-space: nowrap; }
    thead th { position: sticky; top: 0; background: #28223c; color: white; z-index: 1; }
    tbody tr:nth-child(even) { background: #182231; }
    tbody tr.coverage { background: rgba(34, 197, 94, .07); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .note { padding: 10px 12px; border-radius: 8px; background: #111827; color: #d1d5db; font-size: 12px; margin-bottom: 10px; }
    @media (max-width: 1000px) { .summary { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 600px) { body { padding: 8px; } .summary { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>
<main>
  <section class="hero">
    <div>
      <h1>Facility Cost Classification Explorer</h1>
      <p class="muted">Fresh DS DBM non-labor population. No old Cost Element Key filtering or controllability assumptions are applied here.</p>
    </div>
    <a class="button" href="/cost-classification">Refresh</a>
  </section>

  <section class="summary">
    <article class="card"><span>Period</span><strong>${escapeHtml(payload.firstPeriod)} – ${escapeHtml(payload.latestPeriod)}</strong></article>
    <article class="card"><span>Net Cost</span><strong>${formatCurrency(payload.totalNetCost)}</strong></article>
    <article class="card"><span>Absolute Net</span><strong>${formatCurrency(payload.totalAbsoluteNetCost)}</strong></article>
    <article class="card"><span>GL / Category Combos</span><strong>${formatCount(payload.costElementCombinationCount)}</strong></article>
    <article class="card"><span>Rows to 95%</span><strong>${formatCount(payload.rowsTo95)}</strong></article>
    <article class="card"><span>Rows to 99%</span><strong>${formatCount(payload.rowsTo99)}</strong></article>
  </section>

  <section class="panel">
    <h2>Category Summary</h2>
    <div class="note">Start here. Categories with obvious facility/non-facility meaning can be classified in bulk; mixed categories can then be reviewed at the GL level below.</div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>#</th><th>Level 3</th><th>Level 4</th><th>GL Combos</th><th>Net Cost</th><th>Abs Share</th><th>Cumulative</th></tr></thead>
        <tbody>${renderCategoryRows(payload.categoryRows)}</tbody>
      </table>
    </div>
  </section>

  <section class="panel">
    <h2>Cost Elements Ranked by Dollar Impact</h2>
    <div class="note">Showing the first ${formatCount(payload.visibleRowCount)} rows, enough to cover at least 95% of absolute net dollars when possible. Green-tinted rows are inside the 95% coverage set.</div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>#</th><th>Cost Element</th><th>Description</th><th>Level 3</th><th>Level 4</th><th>Net Cost</th><th>Abs Share</th><th>Cumulative</th><th>Txn Rows</th></tr></thead>
        <tbody>${renderCostElementRows(payload.costElementRows)}</tbody>
      </table>
    </div>
  </section>
</main>
</body>
</html>`;
}
