import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import { readCostClassificationDiagnostics } from './costClassificationDiagnostics.js';
import { getConnectionConfig, getPool } from './sqlConnection.js';

const DBM_TABLE_CHECKS = [
  {
    name: 'src.rb_CVG_Transaction_Details_03',
    query: `
      SELECT TOP (1)
        TRY_CONVERT(int, source.[GJAHR]) AS [year],
        TRY_CONVERT(int, source.[POPER]) AS [month]
      FROM [src].[rb_CVG_Transaction_Details_03] AS source
      WHERE TRY_CONVERT(int, source.[GJAHR]) IS NOT NULL
        AND TRY_CONVERT(int, source.[POPER]) BETWEEN 1 AND 12
      ORDER BY
        TRY_CONVERT(int, source.[GJAHR]) DESC,
        TRY_CONVERT(int, source.[POPER]) DESC;
    `,
    transactionTable: true
  },
  {
    name: 'rpt.rb_load_cost_center_hierarchy',
    query: 'SELECT TOP (0) 1 AS [accessible] FROM [rpt].[rb_load_cost_center_hierarchy];'
  },
  {
    name: 'rpt.rb_archibus',
    query: 'SELECT TOP (0) 1 AS [accessible] FROM [rpt].[rb_archibus];'
  }
];

function getEmptyTableResults(status = 'Not tested') {
  return DBM_TABLE_CHECKS.map(({ name }) => ({
    name,
    accessible: null,
    status
  }));
}

function formatLatestMonth(year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return 'None';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

async function runTableCheck(pool, tableCheck) {
  const stopTimer = createTimer();

  try {
    const result = await pool.request().query(tableCheck.query);
    const latestRow = tableCheck.transactionTable ? result.recordset[0] : null;
    const latestYear = Number(latestRow?.year);
    const latestMonth = Number(latestRow?.month);

    logDebug('dbm-diagnostics', 'DBM table access confirmed.', {
      tableName: tableCheck.name,
      duration: formatDuration(stopTimer())
    });

    return {
      name: tableCheck.name,
      accessible: true,
      status: 'Accessible',
      latestYear: Number.isInteger(latestYear) ? latestYear : null,
      latestMonth: Number.isInteger(latestMonth) ? latestMonth : null
    };
  } catch (error) {
    logError('dbm-diagnostics', 'DBM table access check failed.', error, {
      tableName: tableCheck.name,
      duration: formatDuration(stopTimer())
    });

    return {
      name: tableCheck.name,
      accessible: false,
      status: 'Unavailable',
      latestYear: null,
      latestMonth: null
    };
  }
}

export async function readDbmDiagnostics() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig('dbm');
  const basePayload = {
    connection: {
      status: 'Not configured',
      connected: false,
      server: config.server ?? 'Not configured',
      database: config.database ?? 'Not configured'
    },
    tables: getEmptyTableResults(),
    latestTransactionPeriod: {
      year: null,
      month: null,
      label: 'None'
    },
    costClassification: null,
    costClassificationError: null
  };

  if (missing.length > 0) {
    logDebug('dbm-diagnostics', 'DBM connection is not configured.', {
      missing,
      duration: formatDuration(stopTimer())
    });
    return basePayload;
  }

  let pool;

  try {
    pool = await getPool(config, 'dbm');
  } catch (error) {
    logError('dbm-diagnostics', 'DBM connection test failed.', error, {
      server: config.server,
      database: config.database,
      duration: formatDuration(stopTimer())
    });

    return {
      ...basePayload,
      connection: {
        status: 'Failed',
        connected: false,
        server: config.server,
        database: config.database
      },
      tables: getEmptyTableResults('Not tested — connection failed')
    };
  }

  const tables = await Promise.all(
    DBM_TABLE_CHECKS.map((tableCheck) => runTableCheck(pool, tableCheck))
  );
  const transactionTable = tables.find(
    (table) => table.name === 'src.rb_CVG_Transaction_Details_03'
  );

  let costClassification = null;
  let costClassificationError = null;

  try {
    costClassification = await readCostClassificationDiagnostics();
  } catch (error) {
    costClassificationError = error.message;
    logError('dbm-diagnostics', 'Cost classification explorer failed to load.', error);
  }

  logDebug('dbm-diagnostics', 'DBM diagnostics completed.', {
    server: config.server,
    database: config.database,
    accessibleTableCount: tables.filter((table) => table.accessible).length,
    costClassificationLoaded: Boolean(costClassification),
    duration: formatDuration(stopTimer())
  });

  return {
    connection: {
      status: 'Connected',
      connected: true,
      server: config.server,
      database: config.database
    },
    tables: tables.map(({ name, accessible, status }) => ({
      name,
      accessible,
      status
    })),
    latestTransactionPeriod: {
      year: transactionTable?.latestYear ?? null,
      month: transactionTable?.latestMonth ?? null,
      label: formatLatestMonth(
        transactionTable?.latestYear,
        transactionTable?.latestMonth
      )
    },
    costClassification,
    costClassificationError
  };
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
  const numeric = Number(value);
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : 'N/A';
}

function formatCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? countFormatter.format(numeric) : 'N/A';
}

function formatPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? percentFormatter.format(numeric) : 'N/A';
}

function renderCostClassification(payload, errorMessage) {
  if (!payload) {
    return `
      <section class="panel">
        <h2>Facility Cost Classification Explorer</h2>
        <p class="error">${escapeHtml(errorMessage || 'Classification data did not load.')}</p>
      </section>
    `;
  }

  return `
    <section class="panel classification-panel">
      <h2>Facility Cost Classification Explorer</h2>
      <p class="note">Fresh DS DBM non-labor population only. This section intentionally ignores the old Cost Element Key and all existing controllable/uncontrollable assumptions.</p>

      <div class="classification-summary">
        <article class="summary-card"><span>Period</span><strong>${escapeHtml(payload.firstPeriod)} – ${escapeHtml(payload.latestPeriod)}</strong></article>
        <article class="summary-card"><span>Net Cost</span><strong>${formatCurrency(payload.totalNetCost)}</strong></article>
        <article class="summary-card"><span>GL / Category Combos</span><strong>${formatCount(payload.costElementCombinationCount)}</strong></article>
        <article class="summary-card"><span>Rows to 95%</span><strong>${formatCount(payload.rowsTo95)}</strong></article>
        <article class="summary-card"><span>Rows to 99%</span><strong>${formatCount(payload.rowsTo99)}</strong></article>
      </div>

      <h3>Category Summary</h3>
      <p class="note">Start here. Obvious facility/non-facility categories can be classified in bulk; mixed categories can be reviewed at GL level.</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>#</th><th>Level 3</th><th>Level 4</th><th>GL Combos</th><th>Net Cost</th><th>Abs Share</th><th>Cumulative</th></tr></thead>
          <tbody>
            ${payload.categoryRows.map((row) => `
              <tr>
                <td>${row.rank}</td>
                <td>${escapeHtml(row.level3Category)}</td>
                <td>${escapeHtml(row.level4Category)}</td>
                <td>${formatCount(row.costElementCount)}</td>
                <td>${formatCurrency(row.netCost)}</td>
                <td>${formatPercent(row.absoluteShare)}</td>
                <td>${formatPercent(row.cumulativeShare)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <h3>Cost Elements Ranked by Dollar Impact</h3>
      <p class="note">Showing ${formatCount(payload.visibleRowCount)} rows. Green-tinted rows are inside the set that gets us to roughly 95% of absolute net dollars.</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>#</th><th>Cost Element</th><th>Description</th><th>Level 3</th><th>Level 4</th><th>Net Cost</th><th>Abs Share</th><th>Cumulative</th><th>Txn Rows</th></tr></thead>
          <tbody>
            ${payload.costElementRows.map((row) => `
              <tr class="${row.cumulativeShare <= 0.95 ? 'coverage' : ''}">
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
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function renderDbmDiagnosticsPage(payload) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DBM Diagnostics</title>
    <style>
      :root { color-scheme: dark; font-family: Arial, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 18px; background: #111827; color: #f3f4f6; }
      .shell { width: min(1500px, 100%); margin: 0 auto; display: grid; gap: 12px; }
      .hero, .panel, .summary-card { border: 1px solid #374151; border-radius: 10px; background: #1f2937; }
      .hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { margin-bottom: 0; font-size: 22px; }
      h2 { margin-bottom: 10px; font-size: 16px; }
      h3 { margin: 18px 0 8px; font-size: 14px; }
      .button { padding: 8px 12px; border: 1px solid #4b5563; border-radius: 999px; background: #28223c; color: white; text-decoration: none; font-size: 12px; font-weight: 700; }
      .panel { padding: 12px; }
      .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
      .classification-summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
      .summary-card { padding: 10px 12px; background: #111827; }
      .summary-card span { display: block; margin-bottom: 5px; color: #9ca3af; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .summary-card strong { display: block; overflow-wrap: anywhere; font-size: 14px; }
      .table-scroll { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { padding: 7px 8px; border: 1px solid #374151; text-align: left; white-space: nowrap; }
      thead th { position: sticky; top: 0; background: #28223c; color: white; z-index: 1; }
      tbody tr:nth-child(even) { background: #182231; }
      tbody tr.coverage { background: rgba(34, 197, 94, .07); }
      .accessible { color: #86efac; font-weight: 700; }
      .unavailable, .error { color: #fca5a5; font-weight: 700; }
      .not-tested { color: #fcd34d; font-weight: 700; }
      .note { padding: 9px 10px; border-radius: 8px; background: #111827; color: #d1d5db; font-size: 12px; margin-bottom: 10px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      @media (max-width: 1000px) {
        .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .classification-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 420px) {
        body { padding: 8px; }
        .summary-grid, .classification-summary { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <h1>DBM Diagnostics</h1>
        <a class="button" href="/dbm-diagnostics">Refresh</a>
      </section>

      <section class="summary-grid">
        <article class="summary-card"><span>Connection</span><strong>${escapeHtml(payload.connection.status)}</strong></article>
        <article class="summary-card"><span>Server</span><strong>${escapeHtml(payload.connection.server)}</strong></article>
        <article class="summary-card"><span>Database</span><strong>${escapeHtml(payload.connection.database)}</strong></article>
        <article class="summary-card"><span>Latest Transaction Period</span><strong>${escapeHtml(payload.latestTransactionPeriod.label)}</strong></article>
      </section>

      <section class="panel">
        <h2>Table Accessibility</h2>
        <table>
          <thead><tr><th>Table</th><th>Status</th></tr></thead>
          <tbody>
            ${payload.tables.map((table) => {
              const statusClass = table.accessible === true
                ? 'accessible'
                : table.accessible === false
                  ? 'unavailable'
                  : 'not-tested';

              return `<tr><th>${escapeHtml(table.name)}</th><td class="${statusClass}">${escapeHtml(table.status)}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </section>

      ${renderCostClassification(payload.costClassification, payload.costClassificationError)}
    </main>
  </body>
</html>`;
}
