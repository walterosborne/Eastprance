function getMonthKey(row) {
  const year = Number(row?.year);
  const month = Number(row?.month);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatMonthKey(monthKey) {
  if (!monthKey) {
    return 'None';
  }

  const [year, month] = monthKey.split('-').map(Number);

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function summarizeRows(rows) {
  const monthKeys = rows.map(getMonthKey).filter(Boolean).sort();

  return {
    rowCount: rows.length,
    totalCost: roundCurrency(
      rows.reduce((sum, row) => {
        const cost = Number(row?.cost);
        return Number.isFinite(cost) ? sum + cost : sum;
      }, 0)
    ),
    latestMonthKey: monthKeys.at(-1) ?? null,
    latestMonth: formatMonthKey(monthKeys.at(-1) ?? null)
  };
}

function createMonthlyStage() {
  return {
    rowCount: 0,
    totalCost: 0
  };
}

function addRowsToMonthlyStages(months, rows, stageName) {
  rows.forEach((row) => {
    const monthKey = getMonthKey(row);
    const cost = Number(row?.cost);

    if (!monthKey || !Number.isFinite(cost)) {
      return;
    }

    const month = months.get(monthKey) ?? {
      monthKey,
      monthLabel: formatMonthKey(monthKey),
      raw: createMonthlyStage(),
      included: createMonthlyStage(),
      controllable: createMonthlyStage(),
      uncontrollable: createMonthlyStage(),
      excluded: createMonthlyStage()
    };

    month[stageName].rowCount += 1;
    month[stageName].totalCost += cost;
    months.set(monthKey, month);
  });
}

function buildMonthlyComparison(normalizedRows, includedRows, excludedRows) {
  const months = new Map();
  const controllableRows = includedRows.filter(
    (row) => row.controllable === 'Controllable'
  );
  const uncontrollableRows = includedRows.filter(
    (row) => row.controllable !== 'Controllable'
  );

  addRowsToMonthlyStages(months, normalizedRows, 'raw');
  addRowsToMonthlyStages(months, includedRows, 'included');
  addRowsToMonthlyStages(months, controllableRows, 'controllable');
  addRowsToMonthlyStages(months, uncontrollableRows, 'uncontrollable');
  addRowsToMonthlyStages(months, excludedRows, 'excluded');

  return [...months.values()]
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
    .map((month) => ({
      ...month,
      raw: { ...month.raw, totalCost: roundCurrency(month.raw.totalCost) },
      included: { ...month.included, totalCost: roundCurrency(month.included.totalCost) },
      controllable: {
        ...month.controllable,
        totalCost: roundCurrency(month.controllable.totalCost)
      },
      uncontrollable: {
        ...month.uncontrollable,
        totalCost: roundCurrency(month.uncontrollable.totalCost)
      },
      excluded: { ...month.excluded, totalCost: roundCurrency(month.excluded.totalCost) }
    }));
}

function buildUnmatchedCostElements(excludedRows) {
  const groups = new Map();

  excludedRows.forEach((row) => {
    const rawIdentifier = String(row?.gl_account_cost_element ?? '').trim();
    const identifier = rawIdentifier || '(Blank)';
    const key = identifier.toUpperCase();
    const cost = Number(row?.cost);
    const monthKey = getMonthKey(row);
    const group = groups.get(key) ?? {
      glAccountCostElement: identifier,
      rowCount: 0,
      totalCost: 0,
      latestMonthKey: null
    };

    group.rowCount += 1;
    group.totalCost += Number.isFinite(cost) ? cost : 0;

    if (monthKey && (!group.latestMonthKey || monthKey > group.latestMonthKey)) {
      group.latestMonthKey = monthKey;
    }

    groups.set(key, group);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      totalCost: roundCurrency(group.totalCost),
      latestMonth: formatMonthKey(group.latestMonthKey)
    }))
    .sort((left, right) => {
      const absoluteDifference = Math.abs(right.totalCost) - Math.abs(left.totalCost);

      if (absoluteDifference !== 0) {
        return absoluteDifference;
      }

      return left.glAccountCostElement.localeCompare(right.glAccountCostElement);
    });
}

export function buildCostDiagnosticsPayload(pipeline, now = new Date()) {
  const {
    fileName,
    sheetName,
    sourceRows = [],
    normalizedRows = [],
    rows = [],
    excludedRows = [],
    costElementKeys = {}
  } = pipeline;
  const controllableRows = rows.filter((row) => row.controllable === 'Controllable');
  const uncontrollableRows = rows.filter((row) => row.controllable !== 'Controllable');

  return {
    generatedAt: now.toISOString(),
    source: {
      fileName,
      sheetName,
      sourceRowCount: sourceRows.length,
      validRawRowCount: normalizedRows.length,
      invalidRowCount: sourceRows.length - normalizedRows.length,
      costElementKeyTableName: costElementKeys.tableName ?? null,
      costElementKeyRowCount: costElementKeys.rowCount ?? 0,
      validCostElementCount: costElementKeys.valuesByIdentifier?.size ?? 0
    },
    stages: {
      raw: summarizeRows(normalizedRows),
      included: summarizeRows(rows),
      controllable: summarizeRows(controllableRows),
      uncontrollable: summarizeRows(uncontrollableRows),
      excluded: summarizeRows(excludedRows)
    },
    monthly: buildMonthlyComparison(normalizedRows, rows, excludedRows),
    unmatchedCostElements: buildUnmatchedCostElements(excludedRows)
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
  return Number.isFinite(value) ? currencyFormatter.format(value) : 'N/A';
}

function formatCount(value) {
  return Number.isFinite(value) ? countFormatter.format(value) : 'N/A';
}

function formatPercent(value) {
  return Number.isFinite(value) ? percentFormatter.format(value) : 'N/A';
}

function renderStageCard(label, stage) {
  return `
    <article class="stage-card">
      <h3>${escapeHtml(label)}</h3>
      <strong>${formatCurrency(stage.totalCost)}</strong>
      <p>${formatCount(stage.rowCount)} rows</p>
      <span>Latest: ${escapeHtml(stage.latestMonth)}</span>
    </article>
  `;
}

function renderMonthlyTable(monthly) {
  if (monthly.length === 0) {
    return '<p class="empty">No valid monthly cost rows were found.</p>';
  }

  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Raw Rows</th>
            <th>Raw Total</th>
            <th>Included Rows</th>
            <th>Included Total</th>
            <th>Controllable</th>
            <th>Uncontrollable</th>
            <th>Excluded Rows</th>
            <th>Excluded Total</th>
            <th>Retained</th>
          </tr>
        </thead>
        <tbody>
          ${monthly.map((month) => `
            <tr>
              <th>${escapeHtml(month.monthLabel)}</th>
              <td>${formatCount(month.raw.rowCount)}</td>
              <td>${formatCurrency(month.raw.totalCost)}</td>
              <td>${formatCount(month.included.rowCount)}</td>
              <td>${formatCurrency(month.included.totalCost)}</td>
              <td>${formatCurrency(month.controllable.totalCost)}</td>
              <td>${formatCurrency(month.uncontrollable.totalCost)}</td>
              <td>${formatCount(month.excluded.rowCount)}</td>
              <td class="excluded">${formatCurrency(month.excluded.totalCost)}</td>
              <td>${formatPercent(
                month.raw.totalCost === 0
                  ? null
                  : month.included.totalCost / month.raw.totalCost
              )}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderUnmatchedTable(rows) {
  if (rows.length === 0) {
    return '<p class="empty">Every valid GL/cost element matched the Cost Element Key.</p>';
  }

  return `
    <div class="table-scroll">
      <table class="unmatched-table">
        <thead>
          <tr>
            <th>Unmatched GL / Cost Element</th>
            <th>Row Count</th>
            <th>Excluded Total</th>
            <th>Latest Month</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <th title="${escapeHtml(row.glAccountCostElement)}">${escapeHtml(row.glAccountCostElement)}</th>
              <td>${formatCount(row.rowCount)}</td>
              <td class="excluded">${formatCurrency(row.totalCost)}</td>
              <td>${escapeHtml(row.latestMonth)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderCostDiagnosticsPage(payload) {
  const { source, stages } = payload;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Cost Diagnostics</title>
    <style>
      :root { color-scheme: dark; font-family: Arial, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 16px; background: #111827; color: #f3f4f6; }
      .shell { width: min(1600px, 100%); margin: 0 auto; display: grid; gap: 12px; }
      .hero, .panel, .stage-card { border: 1px solid #374151; background: #1f2937; border-radius: 10px; }
      .hero { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 14px 16px; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { margin-bottom: 4px; font-size: 22px; }
      h2 { margin-bottom: 10px; font-size: 16px; }
      h3 { margin-bottom: 8px; color: #cbd5e1; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
      .hero p, .note { margin-bottom: 0; color: #cbd5e1; font-size: 12px; line-height: 1.45; }
      .button { padding: 8px 12px; border: 1px solid #4b5563; border-radius: 999px; background: #28223c; color: white; text-decoration: none; font-size: 12px; font-weight: 700; }
      .panel { padding: 12px; overflow: hidden; }
      .stage-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
      .stage-card { padding: 10px 12px; background: #111827; }
      .stage-card strong { display: block; font-size: 18px; }
      .stage-card p { margin: 5px 0 2px; color: #d1d5db; font-size: 11px; }
      .stage-card span { color: #9ca3af; font-size: 10px; }
      .meta { margin: 8px 0 0; color: #cbd5e1; font-size: 11px; }
      .table-scroll { max-width: 100%; overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
      th, td { padding: 5px 7px; border: 1px solid #374151; text-align: right; }
      thead th { position: sticky; top: 0; z-index: 1; background: #28223c; color: white; }
      tbody th, thead th:first-child { text-align: left; }
      tbody tr:nth-child(even) { background: #182231; }
      tbody tr:hover { background: #263548; }
      .excluded { color: #fbbf24; font-weight: 700; }
      .unmatched-table { width: auto; min-width: 620px; }
      .unmatched-table tbody th { max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
      .empty { margin: 0; padding: 8px; color: #fbbf24; font-size: 12px; }
      @media (max-width: 900px) { .stage-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 500px) {
        body { padding: 8px; }
        .hero { align-items: flex-start; }
        .stage-grid { grid-template-columns: 1fr; }
      }
      @media print {
        body { padding: 0; background: white; color: #111827; }
        .hero, .panel, .stage-card { background: white; border-color: #9ca3af; color: #111827; }
        .button { display: none; }
        .hero p, .note, .meta, h3, .stage-card p, .stage-card span { color: #374151; }
        thead th { position: static; background: #e5e7eb; color: #111827; }
        tbody tr:nth-child(even) { background: #f3f4f6; }
        th, td { border-color: #9ca3af; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div>
          <h1>Costs New Data Diagnostics</h1>
          <p>Raw cost.xlsx rows through Cost Element Key filtering and controllability classification.</p>
        </div>
        <a class="button" href="/cost-diagnostics">Refresh</a>
      </section>

      <section class="panel">
        <h2>Pipeline Summary</h2>
        <div class="stage-grid">
          ${renderStageCard('Raw Valid Rows', stages.raw)}
          ${renderStageCard('Key-Matched Rows', stages.included)}
          ${renderStageCard('Controllable', stages.controllable)}
          ${renderStageCard('Uncontrollable', stages.uncontrollable)}
          ${renderStageCard('Excluded', stages.excluded)}
        </div>
        <p class="meta">
          Workbook: <b>${escapeHtml(source.fileName)}</b> · Sheet: <b>${escapeHtml(source.sheetName)}</b> ·
          Source rows: <b>${formatCount(source.sourceRowCount)}</b> · Valid raw rows: <b>${formatCount(source.validRawRowCount)}</b> ·
          Invalid rows: <b>${formatCount(source.invalidRowCount)}</b> · Key rows: <b>${formatCount(source.costElementKeyRowCount)}</b> ·
          Unique keyed elements: <b>${formatCount(source.validCostElementCount)}</b>
        </p>
      </section>

      <section class="panel">
        <h2>Monthly Pipeline</h2>
        <p class="note">Raw totals include valid workbook rows before the Cost Element Key filter. Included totals equal controllable plus uncontrollable.</p>
        ${renderMonthlyTable(payload.monthly)}
      </section>

      <section class="panel">
        <h2>Unmatched GL / Cost Elements</h2>
        <p class="note">Sorted by absolute excluded dollar impact, largest first.</p>
        ${renderUnmatchedTable(payload.unmatchedCostElements)}
      </section>
    </main>
  </body>
</html>`;
}
