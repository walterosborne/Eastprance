import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import { readCostClassificationDiagnostics } from './costClassificationDiagnostics.js';
import { readCostDimensionCoverageDiagnostics } from './costDimensionCoverageDiagnostics.js';
import { classifyFacilityCost } from './costFacilityClassification.js';
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
      ORDER BY TRY_CONVERT(int, source.[GJAHR]) DESC, TRY_CONVERT(int, source.[POPER]) DESC;
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
  return DBM_TABLE_CHECKS.map(({ name }) => ({ name, accessible: null, status }));
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
    latestTransactionPeriod: { year: null, month: null, label: 'None' },
    costClassification: null,
    costClassificationError: null,
    costDimensionCoverage: null,
    costDimensionCoverageError: null
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

  const tables = await Promise.all(DBM_TABLE_CHECKS.map((check) => runTableCheck(pool, check)));
  const transactionTable = tables.find((table) => table.name === 'src.rb_CVG_Transaction_Details_03');

  let costClassification = null;
  let costClassificationError = null;
  let costDimensionCoverage = null;
  let costDimensionCoverageError = null;

  try {
    costClassification = await readCostClassificationDiagnostics();
  } catch (error) {
    costClassificationError = error.message;
    logError('dbm-diagnostics', 'Cost classification explorer failed to load.', error);
  }

  try {
    costDimensionCoverage = await readCostDimensionCoverageDiagnostics();
  } catch (error) {
    costDimensionCoverageError = error.message;
    logError('dbm-diagnostics', 'Cost dimension coverage diagnostics failed to load.', error);
  }

  logDebug('dbm-diagnostics', 'DBM diagnostics completed.', {
    server: config.server,
    database: config.database,
    accessibleTableCount: tables.filter((table) => table.accessible).length,
    costClassificationLoaded: Boolean(costClassification),
    costDimensionCoverageLoaded: Boolean(costDimensionCoverage),
    duration: formatDuration(stopTimer())
  });

  return {
    connection: {
      status: 'Connected',
      connected: true,
      server: config.server,
      database: config.database
    },
    tables: tables.map(({ name, accessible, status }) => ({ name, accessible, status })),
    latestTransactionPeriod: {
      year: transactionTable?.latestYear ?? null,
      month: transactionTable?.latestMonth ?? null,
      label: formatLatestMonth(transactionTable?.latestYear, transactionTable?.latestMonth)
    },
    costClassification,
    costClassificationError,
    costDimensionCoverage,
    costDimensionCoverageError
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

function summarizeFacilityStatuses(rows) {
  const summary = {
    Facility: { rowCount: 0, netCost: 0 },
    'Not Facility': { rowCount: 0, netCost: 0 },
    'Needs Review': { rowCount: 0, netCost: 0 }
  };

  rows.forEach((row) => {
    const bucket = summary[row.facilityStatus];
    bucket.rowCount += 1;
    bucket.netCost += Number(row.netCost) || 0;
  });

  return summary;
}

function renderLegacyComparison(legacy) {
  if (!legacy) return '';

  return `
    <h3>Legacy Cost Source Benchmark</h3>
    <p class="note">Benchmark only. This is the old controllable-cost source, not a definition of truth. Use it to compare expected facility/address mix and quarter totals while we build the new independent logic.</p>

    <div class="classification-summary coverage-summary">
      <article class="summary-card"><span>Legacy Source</span><strong>${escapeHtml(`${legacy.source}: ${legacy.sourceName}`)}</strong></article>
      <article class="summary-card"><span>Legacy Rows</span><strong>${formatCount(legacy.rowCount)}</strong></article>
      <article class="summary-card"><span>Addresses</span><strong>${formatCount(legacy.addressCount)}</strong></article>
      <article class="summary-card"><span>Cost Elements</span><strong>${formatCount(legacy.costElementCount)}</strong></article>
      <article class="summary-card"><span>Quarters</span><strong>${formatCount(legacy.quarterCount)}</strong></article>
      <article class="summary-card"><span>Legacy Net Cost</span><strong>${formatCurrency(legacy.totalNetCost)}</strong></article>
    </div>

    <p class="note">Common quarters: ${escapeHtml(legacy.commonQuarterKeys.join(', ') || 'None')} · legacy total in common quarters: ${formatCurrency(legacy.commonOldNetCost)} · fresh raw DS indirect non-labor in those quarters: ${formatCurrency(legacy.commonFreshRawNetCost)}. The fresh value is intentionally much broader until facility filtering is finished.</p>

    <h3>Legacy vs Fresh by Quarter</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Quarter</th><th>Legacy Facility Report</th><th>Fresh Raw DS Non-Labor</th><th>Overlap?</th></tr></thead>
        <tbody>${legacy.quarterRows.map((row) => `
          <tr class="${row.overlap ? 'coverage' : ''}">
            <td>${escapeHtml(row.quarter)}</td>
            <td>${formatCurrency(row.oldCost)}</td>
            <td>${formatCurrency(row.freshRawCost)}</td>
            <td>${row.overlap ? 'Yes' : 'No'}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>

    <h3>Top Legacy Addresses</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Legacy Address</th><th>Legacy Net Cost</th><th>Abs Share</th><th>Quarters</th><th>Fresh Mapped Facility Match</th><th>Fresh Mapped Net Cost</th></tr></thead>
        <tbody>${legacy.topAddresses.map((row) => `
          <tr>
            <td>${escapeHtml(row.key)}</td>
            <td>${formatCurrency(row.netCost)}</td>
            <td>${formatPercent(row.absoluteShare)}</td>
            <td>${escapeHtml(row.quarters.join(', '))}</td>
            <td>${escapeHtml(row.freshFacilityMatch || 'No current match')}</td>
            <td>${row.freshMappedNetCost == null ? '—' : formatCurrency(row.freshMappedNetCost)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>

    <h3>Top Legacy Cost Categories</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Cost Category</th><th>Legacy Net Cost</th><th>Abs Share</th><th>Rows</th></tr></thead>
        <tbody>${legacy.topCategories.map((row) => `
          <tr>
            <td>${escapeHtml(row.key)}</td>
            <td>${formatCurrency(row.netCost)}</td>
            <td>${formatPercent(row.absoluteShare)}</td>
            <td>${formatCount(row.rowCount)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderLegacyGlOverlap(overlap) {
  if (!overlap) return '';

  return `
    <h3>Legacy GL Overlap — Exact Cost Elements in Fresh Source</h3>
    <p class="note">This ignores the old Cost Element Key for filtering. It takes the cost elements that actually appeared in the legacy report and finds those exact RACCTs in the fresh DS transaction source across every account hierarchy, including labor.</p>

    <div class="classification-summary coverage-summary">
      <article class="summary-card"><span>Common Quarters</span><strong>${escapeHtml(overlap.commonQuarterKeys.join(', ') || 'None')}</strong></article>
      <article class="summary-card"><span>Legacy Elements</span><strong>${formatCount(overlap.legacyElementCount)}</strong></article>
      <article class="summary-card"><span>Fresh Matched Elements</span><strong>${formatCount(overlap.freshMatchedElementCount)}</strong></article>
      <article class="summary-card"><span>Legacy Cost</span><strong>${formatCurrency(overlap.oldNetCost)}</strong></article>
      <article class="summary-card"><span>Fresh Exact-GL Cost</span><strong>${formatCurrency(overlap.freshExactGlNetCost)}</strong></article>
      <article class="summary-card"><span>Difference</span><strong>${formatCurrency(overlap.difference)}</strong></article>
    </div>

    <h3>Legacy Category vs Fresh Exact-GL</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Legacy Category</th><th>Legacy Cost</th><th>Fresh Exact-GL Cost</th><th>Difference</th><th>Elements Old / Fresh</th><th>Fresh Account Hierarchy</th></tr></thead>
        <tbody>${overlap.categoryRows.map((row) => `
          <tr>
            <td>${escapeHtml(row.category)}</td>
            <td>${formatCurrency(row.oldCost)}</td>
            <td>${formatCurrency(row.freshExactGlCost)}</td>
            <td>${formatCurrency(row.difference)}</td>
            <td>${formatCount(row.legacyElementCount)} / ${formatCount(row.freshMatchedElementCount)}</td>
            <td>${escapeHtml(row.freshHierarchy)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>

    <h3>Largest Legacy-vs-Fresh GL Differences</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Cost Element</th><th>Legacy Category</th><th>Description</th><th>Legacy</th><th>Fresh</th><th>Difference</th><th>Fresh Level 1</th><th>Fresh Level 2</th><th>Fresh Level 3</th></tr></thead>
        <tbody>${overlap.elementRows.map((row) => `
          <tr>
            <td class="mono">${escapeHtml(row.costElement)}</td>
            <td>${escapeHtml(row.legacyCategory)}</td>
            <td>${escapeHtml(row.description)}</td>
            <td>${formatCurrency(row.oldCost)}</td>
            <td>${formatCurrency(row.freshExactGlCost)}</td>
            <td>${formatCurrency(row.difference)}</td>
            <td>${escapeHtml(row.level1)}</td>
            <td>${escapeHtml(row.level2)}</td>
            <td>${escapeHtml(row.level3)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderFacilityMappingCandidates(candidates = []) {
  return `
    <h3>DBM Facility-Mapping Candidate Objects</h3>
    <p class="note">Metadata-only discovery: DBM tables/views containing at least one cost-center-like column and at least one facility/location/address-like column. These are candidates for a real KOSTL → physical facility join; nothing here changes the card.</p>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Object</th><th>Type</th><th>Cost Center Columns</th><th>Facility / Location Columns</th></tr></thead>
        <tbody>${candidates.map((row) => `
          <tr>
            <td class="mono">${escapeHtml(row.objectName)}</td>
            <td>${escapeHtml(row.tableType)}</td>
            <td>${escapeHtml(row.costCenterColumns.join(', '))}</td>
            <td>${escapeHtml(row.locationColumns.join(', '))}</td>
          </tr>`).join('') || '<tr><td colspan="4">No metadata candidates found.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function renderCostDimensionCoverage(payload, errorMessage, classificationTotal) {
  if (!payload) {
    return `
      <section class="panel">
        <h2>Cost Dimension Coverage</h2>
        <p class="error">${escapeHtml(errorMessage || 'Dimension coverage data did not load.')}</p>
      </section>
    `;
  }

  const reconciliationDifference = Number(payload.totalNetCost) - Number(classificationTotal || 0);

  return `
    <section class="panel">
      <h2>Cost Dimension Coverage</h2>
      <p class="note">Fresh DS indirect non-labor population. Division/BU should already be trustworthy; facility mapping is still diagnostic until coverage is good enough.</p>

      <div class="classification-summary coverage-summary">
        <article class="summary-card"><span>Divisions</span><strong>${formatCount(payload.divisionCount)}</strong></article>
        <article class="summary-card"><span>Business Units</span><strong>${formatCount(payload.businessUnitCount)}</strong></article>
        <article class="summary-card"><span>Mapped Facilities</span><strong>${formatCount(payload.facilityCount)}</strong></article>
        <article class="summary-card"><span>Cost Centers</span><strong>${formatCount(payload.costCenterCount)}</strong></article>
        <article class="summary-card"><span>Months Present</span><strong>${formatCount(payload.monthCount)}</strong></article>
        <article class="summary-card"><span>Unmapped Facility</span><strong>${formatCount(payload.unmapped.costCenterCount)} CCs · ${formatPercent(payload.unmapped.absoluteShare)}</strong></article>
      </div>

      <p class="note">Dimension total: ${formatCurrency(payload.totalNetCost)} · GL explorer total: ${formatCurrency(classificationTotal)} · Difference: ${formatCurrency(reconciliationDifference)}. These should reconcile essentially to zero.</p>

      <h3>Division Coverage</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Division</th><th>BUs</th><th>Facilities</th><th>Cost Centers</th><th>Months</th><th>Net Cost</th><th>Abs Share</th></tr></thead>
          <tbody>${payload.divisions.map((row) => `
            <tr>
              <td>${escapeHtml(row.key)}</td>
              <td>${formatCount(row.businessUnitCount)}</td>
              <td>${formatCount(row.facilityCount)}</td>
              <td>${formatCount(row.costCenterCount)}</td>
              <td class="${row.monthCount < payload.monthCount ? 'status-needs-review' : ''}">${formatCount(row.monthCount)} / ${formatCount(payload.monthCount)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>

      <h3>Business Unit Coverage</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Division | Business Unit</th><th>Facilities</th><th>Cost Centers</th><th>Months</th><th>Net Cost</th><th>Abs Share</th></tr></thead>
          <tbody>${payload.businessUnits.map((row) => `
            <tr>
              <td>${escapeHtml(row.key)}</td>
              <td>${formatCount(row.facilityCount)}</td>
              <td>${formatCount(row.costCenterCount)}</td>
              <td class="${row.monthCount < payload.monthCount ? 'status-needs-review' : ''}">${formatCount(row.monthCount)} / ${formatCount(payload.monthCount)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>

      <h3>Facility Coverage + Mapping Tests</h3>
      <p class="note">The MAPPING COVERAGE rows are diagnostics. The SAP overlap rows test whether transaction RCNTR corresponds to KOSTL, PRCTR, or ZZORGCODE in the SAP cost-center master before we guess another join.</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Facility / Test</th><th>Divisions</th><th>BUs</th><th>Cost Centers</th><th>Months</th><th>Net Cost</th><th>Abs Share</th></tr></thead>
          <tbody>${payload.facilities.map((row) => `
            <tr class="${row.key === 'Unmapped' ? 'review-row' : ''}">
              <td>${escapeHtml(row.key)}</td>
              <td>${formatCount(row.divisionCount)}</td>
              <td>${formatCount(row.businessUnitCount)}</td>
              <td>${formatCount(row.costCenterCount)}</td>
              <td class="${row.monthCount < payload.monthCount ? 'status-needs-review' : ''}">${formatCount(row.monthCount)} / ${formatCount(payload.monthCount)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>

      <h3>Top Unmapped Facility Cost Centers</h3>
      <p class="note">Each row also shows whether that RCNTR exists as KOSTL, PRCTR, or ZZORGCODE in the SAP cost-center master.</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Cost Center + SAP Hint</th><th>Months</th><th>Net Cost</th><th>Share of Unmapped Activity</th></tr></thead>
          <tbody>${payload.unmappedCostCenters.map((row) => `
            <tr class="review-row">
              <td class="mono">${escapeHtml(row.key)}</td>
              <td>${formatCount(row.monthCount)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
            </tr>`).join('') || '<tr><td colspan="4">No unmapped facility cost centers.</td></tr>'}</tbody>
        </table>
      </div>

      ${renderLegacyComparison(payload.legacyComparison)}
      ${renderLegacyGlOverlap(payload.legacyGlOverlap)}
      ${renderFacilityMappingCandidates(payload.facilityMappingCandidates)}
    </section>
  `;
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

  const classifiedRows = payload.costElementRows.map((row) => ({
    ...row,
    ...classifyFacilityCost(row)
  }));
  const statusSummary = summarizeFacilityStatuses(classifiedRows);
  const needsReviewRows = classifiedRows.filter((row) => row.facilityStatus === 'Needs Review');

  return `
    <section class="panel classification-panel">
      <h2>Facility Cost Classification Explorer</h2>
      <p class="note">Fresh DS DBM non-labor population only. This section intentionally ignores the old Cost Element Key and existing controllable/uncontrollable assumptions.</p>

      <div class="classification-summary">
        <article class="summary-card"><span>Period</span><strong>${escapeHtml(payload.firstPeriod)} – ${escapeHtml(payload.latestPeriod)}</strong></article>
        <article class="summary-card"><span>Net Cost</span><strong>${formatCurrency(payload.totalNetCost)}</strong></article>
        <article class="summary-card"><span>GL / Category Combos</span><strong>${formatCount(payload.costElementCombinationCount)}</strong></article>
        <article class="summary-card"><span>Rows to 95%</span><strong>${formatCount(payload.rowsTo95)}</strong></article>
        <article class="summary-card"><span>Rows to 99%</span><strong>${formatCount(payload.rowsTo99)}</strong></article>
      </div>

      <h3>First-Pass Facility Classification — 95% Coverage Set</h3>
      <p class="note">Conservative rules only. Nothing here changes the scorecard yet.</p>
      <div class="classification-summary status-summary">
        <article class="summary-card"><span>Facility</span><strong>${formatCount(statusSummary.Facility.rowCount)} rows · ${formatCurrency(statusSummary.Facility.netCost)}</strong></article>
        <article class="summary-card"><span>Not Facility</span><strong>${formatCount(statusSummary['Not Facility'].rowCount)} rows · ${formatCurrency(statusSummary['Not Facility'].netCost)}</strong></article>
        <article class="summary-card"><span>Needs Review</span><strong>${formatCount(statusSummary['Needs Review'].rowCount)} rows · ${formatCurrency(statusSummary['Needs Review'].netCost)}</strong></article>
      </div>

      <h3>Needs Review</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>#</th><th>Cost Element</th><th>Description</th><th>Level 3</th><th>Net Cost</th><th>Abs Share</th><th>Reason</th></tr></thead>
          <tbody>${needsReviewRows.map((row) => `
            <tr class="review-row">
              <td>${row.rank}</td>
              <td class="mono">${escapeHtml(row.costElement)}</td>
              <td>${escapeHtml(row.costElementDescription)}</td>
              <td>${escapeHtml(row.level3Category)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
              <td>${escapeHtml(row.facilityReason)}</td>
            </tr>`).join('') || '<tr><td colspan="7">No rows need review in the visible coverage set.</td></tr>'}</tbody>
        </table>
      </div>

      <h3>Category Summary</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>#</th><th>Level 3</th><th>Level 4</th><th>GL Combos</th><th>Net Cost</th><th>Abs Share</th><th>Cumulative</th></tr></thead>
          <tbody>${payload.categoryRows.map((row) => `
            <tr>
              <td>${row.rank}</td>
              <td>${escapeHtml(row.level3Category)}</td>
              <td>${escapeHtml(row.level4Category)}</td>
              <td>${formatCount(row.costElementCount)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
              <td>${formatPercent(row.cumulativeShare)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>

      <h3>Cost Elements Ranked by Dollar Impact</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>#</th><th>Cost Element</th><th>Description</th><th>Level 3</th><th>Status</th><th>Net Cost</th><th>Abs Share</th><th>Cumulative</th><th>Txn Rows</th></tr></thead>
          <tbody>${classifiedRows.map((row) => `
            <tr class="${row.cumulativeShare <= 0.95 ? 'coverage' : ''}">
              <td>${row.rank}</td>
              <td class="mono">${escapeHtml(row.costElement)}</td>
              <td>${escapeHtml(row.costElementDescription)}</td>
              <td>${escapeHtml(row.level3Category)}</td>
              <td class="status-${row.facilityStatus.toLowerCase().replaceAll(' ', '-')}">${escapeHtml(row.facilityStatus)}</td>
              <td>${formatCurrency(row.netCost)}</td>
              <td>${formatPercent(row.absoluteShare)}</td>
              <td>${formatPercent(row.cumulativeShare)}</td>
              <td>${formatCount(row.transactionRowCount)}</td>
            </tr>`).join('')}</tbody>
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
      .classification-summary.status-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .classification-summary.coverage-summary { grid-template-columns: repeat(6, minmax(0, 1fr)); }
      .summary-card { padding: 10px 12px; background: #111827; }
      .summary-card span { display: block; margin-bottom: 5px; color: #9ca3af; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .summary-card strong { display: block; overflow-wrap: anywhere; font-size: 14px; }
      .table-scroll { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { padding: 7px 8px; border: 1px solid #374151; text-align: left; white-space: nowrap; }
      thead th { position: sticky; top: 0; background: #28223c; color: white; z-index: 1; }
      tbody tr:nth-child(even) { background: #182231; }
      tbody tr.coverage { background: rgba(34, 197, 94, .07); }
      tbody tr.review-row { background: rgba(245, 158, 11, .08); }
      .accessible, .status-facility { color: #86efac; font-weight: 700; }
      .unavailable, .error, .status-not-facility { color: #fca5a5; font-weight: 700; }
      .not-tested, .status-needs-review { color: #fcd34d; font-weight: 700; }
      .note { padding: 9px 10px; border-radius: 8px; background: #111827; color: #d1d5db; font-size: 12px; margin-bottom: 10px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      @media (max-width: 1000px) {
        .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .classification-summary, .classification-summary.status-summary, .classification-summary.coverage-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 420px) {
        body { padding: 8px; }
        .summary-grid, .classification-summary, .classification-summary.status-summary, .classification-summary.coverage-summary { grid-template-columns: 1fr; }
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
          <tbody>${payload.tables.map((table) => {
            const statusClass = table.accessible === true ? 'accessible' : table.accessible === false ? 'unavailable' : 'not-tested';
            return `<tr><th>${escapeHtml(table.name)}</th><td class="${statusClass}">${escapeHtml(table.status)}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </section>

      ${renderCostDimensionCoverage(
        payload.costDimensionCoverage,
        payload.costDimensionCoverageError,
        payload.costClassification?.totalNetCost
      )}

      ${renderCostClassification(payload.costClassification, payload.costClassificationError)}
    </main>
  </body>
</html>`;
}
