import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
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
    }
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

  logDebug('dbm-diagnostics', 'DBM diagnostics completed.', {
    server: config.server,
    database: config.database,
    accessibleTableCount: tables.filter((table) => table.accessible).length,
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
    }
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
      .shell { width: min(920px, 100%); margin: 0 auto; display: grid; gap: 12px; }
      .hero, .panel, .summary-card { border: 1px solid #374151; border-radius: 10px; background: #1f2937; }
      .hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; }
      h1, h2, p { margin-top: 0; }
      h1 { margin-bottom: 0; font-size: 22px; }
      h2 { margin-bottom: 10px; font-size: 15px; }
      .button { padding: 8px 12px; border: 1px solid #4b5563; border-radius: 999px; background: #28223c; color: white; text-decoration: none; font-size: 12px; font-weight: 700; }
      .panel { padding: 12px; }
      .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
      .summary-card { padding: 10px 12px; background: #111827; }
      .summary-card span { display: block; margin-bottom: 5px; color: #9ca3af; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .summary-card strong { display: block; overflow-wrap: anywhere; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { padding: 8px 10px; border: 1px solid #374151; text-align: left; }
      thead th { background: #28223c; color: white; }
      tbody tr:nth-child(even) { background: #182231; }
      .accessible { color: #86efac; font-weight: 700; }
      .unavailable { color: #fca5a5; font-weight: 700; }
      .not-tested { color: #fcd34d; font-weight: 700; }
      @media (max-width: 700px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 420px) {
        body { padding: 8px; }
        .summary-grid { grid-template-columns: 1fr; }
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
    </main>
  </body>
</html>`;
}
