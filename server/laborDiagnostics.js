const SCORECARD_START_STAMP = Date.UTC(2025, 0, 1);
const OLD_LABOR_DEFAULT_YEAR = 2026;
const OLD_MONTH_COLUMNS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC'
];
const MAX_DISCREPANCY_ROWS = 20;

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeDimensionKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
}

function getDimensionLabel(value) {
  return normalizeText(value) || '(Blank)';
}

function getMonthStamp(year, monthIndex) {
  return Date.UTC(year, monthIndex, 1);
}

function getScorecardEndStamp(now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

function isWithinScorecardWindow(stamp, now) {
  return stamp >= SCORECARD_START_STAMP && stamp <= getScorecardEndStamp(now);
}

function getMonthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function formatMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function classifyOldLaborCategory(value) {
  const normalizedValue = normalizeText(value).toLowerCase();

  if (normalizedValue.includes('labor direct')) {
    return 'direct';
  }

  if (normalizedValue.includes('labor indirect')) {
    return 'indirect';
  }

  return 'other';
}

function classifyNewLaborCategory(value) {
  const normalizedValue = normalizeText(value).toLowerCase();

  if (normalizedValue.includes('indirect')) {
    return 'indirect';
  }

  if (normalizedValue.includes('direct')) {
    return 'direct';
  }

  return 'other';
}

function normalizeOldLaborRecords(rows, now) {
  const records = [];

  rows.forEach((row) => {
    const yearValue = Number(row?.year);
    const year = Number.isInteger(yearValue) ? yearValue : OLD_LABOR_DEFAULT_YEAR;
    const category = classifyOldLaborCategory(row?.labor_category);

    OLD_MONTH_COLUMNS.forEach((columnName, monthIndex) => {
      const enteredHours = Number(row?.[columnName]);
      const stamp = getMonthStamp(year, monthIndex);

      if (!Number.isFinite(enteredHours) || !isWithinScorecardWindow(stamp, now)) {
        return;
      }

      records.push({
        monthKey: getMonthKey(year, monthIndex),
        category,
        enteredHours,
        facility: getDimensionLabel(row?.forecasted_cc),
        laborCategory: getDimensionLabel(row?.labor_category)
      });
    });
  });

  return records;
}

function normalizeNewLaborRecords(rows, now) {
  return rows.flatMap((row) => {
    const year = Number(row?.year);
    const month = Number(row?.month);
    const enteredHours = Number(row?.entered_hours);

    if (
      !Number.isInteger(year)
      || !Number.isInteger(month)
      || month < 1
      || month > 12
      || !Number.isFinite(enteredHours)
    ) {
      return [];
    }

    const stamp = getMonthStamp(year, month - 1);

    if (!isWithinScorecardWindow(stamp, now)) {
      return [];
    }

    return [{
      monthKey: getMonthKey(year, month - 1),
      category: classifyNewLaborCategory(row?.labor_category),
      enteredHours,
      facility: getDimensionLabel(row?.facility),
      laborCategory: getDimensionLabel(row?.labor_category)
    }];
  });
}

function createTotals() {
  return {
    directHours: 0,
    indirectHours: 0
  };
}

function addRecordToTotals(totals, record) {
  if (record.category === 'direct') {
    totals.directHours += record.enteredHours;
  } else if (record.category === 'indirect') {
    totals.indirectHours += record.enteredHours;
  }
}

function finalizeTotals(totals) {
  const directHours = Number(totals.directHours.toFixed(2));
  const indirectHours = Number(totals.indirectHours.toFixed(2));
  const totalHours = Number((directHours + indirectHours).toFixed(2));

  return {
    directHours,
    indirectHours,
    totalHours,
    directLaborPercent: totalHours === 0 ? null : directHours / totalHours
  };
}

function aggregateRecords(records, allowedMonthKeys, dimensionName = null) {
  const groups = new Map();

  records.forEach((record) => {
    if (!allowedMonthKeys.has(record.monthKey) || record.category === 'other') {
      return;
    }

    const dimensionValue = dimensionName ? record[dimensionName] : 'overall';
    const key = dimensionName ? normalizeDimensionKey(dimensionValue) : 'overall';
    const group = groups.get(key) ?? {
      key,
      label: getDimensionLabel(dimensionValue),
      totals: createTotals()
    };

    addRecordToTotals(group.totals, record);
    groups.set(key, group);
  });

  return new Map(
    [...groups.entries()].map(([key, group]) => [key, {
      key,
      label: group.label,
      ...finalizeTotals(group.totals)
    }])
  );
}

function getAbsoluteDifference(oldValue, newValue) {
  if (!Number.isFinite(oldValue) || !Number.isFinite(newValue)) {
    return null;
  }

  return Math.abs(newValue - oldValue);
}

function getPercentDifference(oldValue, newValue) {
  const absoluteDifference = getAbsoluteDifference(oldValue, newValue);

  if (absoluteDifference === null) {
    return null;
  }

  if (oldValue === 0) {
    return newValue === 0 ? 0 : null;
  }

  return absoluteDifference / Math.abs(oldValue);
}

function compareTotals(oldTotals = finalizeTotals(createTotals()), newTotals = finalizeTotals(createTotals())) {
  const metricNames = [
    'directHours',
    'indirectHours',
    'totalHours',
    'directLaborPercent'
  ];
  const differences = Object.fromEntries(
    metricNames.map((metricName) => [metricName, {
      absolute: getAbsoluteDifference(oldTotals[metricName], newTotals[metricName]),
      percent: getPercentDifference(oldTotals[metricName], newTotals[metricName])
    }])
  );

  return {
    old: oldTotals,
    new: newTotals,
    differences
  };
}

function compareDimension(oldRecords, newRecords, commonMonthKeys, dimensionName, limit = MAX_DISCREPANCY_ROWS) {
  const oldGroups = aggregateRecords(oldRecords, commonMonthKeys, dimensionName);
  const newGroups = aggregateRecords(newRecords, commonMonthKeys, dimensionName);
  const keys = new Set([...oldGroups.keys(), ...newGroups.keys()]);

  return [...keys]
    .map((key) => {
      const oldGroup = oldGroups.get(key);
      const newGroup = newGroups.get(key);
      const comparison = compareTotals(oldGroup, newGroup);
      const discrepancyScore =
        (comparison.differences.directHours.absolute ?? 0)
        + (comparison.differences.indirectHours.absolute ?? 0);

      return {
        key,
        label: newGroup?.label ?? oldGroup?.label ?? '(Blank)',
        discrepancyScore,
        ...comparison
      };
    })
    .sort((left, right) => {
      if (right.discrepancyScore !== left.discrepancyScore) {
        return right.discrepancyScore - left.discrepancyScore;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, limit);
}

function compareFacilityMonths(oldRecords, newRecords, commonMonthKeys) {
  const addMonthToFacility = (records) => records.map((record) => ({
    ...record,
    facilityMonth: `${record.facility}|||${record.monthKey}`
  }));

  return compareDimension(
    addMonthToFacility(oldRecords),
    addMonthToFacility(newRecords),
    commonMonthKeys,
    'facilityMonth'
  ).map((comparison) => {
    const separatorIndex = comparison.label.lastIndexOf('|||');
    const facility = comparison.label.slice(0, separatorIndex);
    const monthKey = comparison.label.slice(separatorIndex + 3);

    return {
      ...comparison,
      label: facility,
      monthKey,
      monthLabel: formatMonthKey(monthKey)
    };
  });
}

function getCoverage(records) {
  return new Set(records.map((record) => record.monthKey));
}

function getSortedMonthKeys(monthKeys) {
  return [...monthKeys].sort((left, right) => left.localeCompare(right));
}

function buildOldOtherHoursByCategory(records, oldCoverage) {
  const monthKeys = getSortedMonthKeys(oldCoverage);
  const groups = new Map();
  const monthlyTotals = Object.fromEntries(monthKeys.map((monthKey) => [monthKey, 0]));

  records.forEach((record) => {
    if (record.category !== 'other' || !oldCoverage.has(record.monthKey)) {
      return;
    }

    const rawCategory = record.laborCategory;
    const group = groups.get(rawCategory) ?? {
      laborCategory: rawCategory,
      totalHours: 0,
      monthlyHours: Object.fromEntries(monthKeys.map((monthKey) => [monthKey, 0]))
    };

    group.totalHours += record.enteredHours;
    group.monthlyHours[record.monthKey] += record.enteredHours;
    monthlyTotals[record.monthKey] += record.enteredHours;
    groups.set(rawCategory, group);
  });

  const rows = [...groups.values()]
    .map((group) => ({
      ...group,
      totalHours: Number(group.totalHours.toFixed(2)),
      monthlyHours: Object.fromEntries(
        Object.entries(group.monthlyHours).map(([monthKey, hours]) => [
          monthKey,
          Number(hours.toFixed(2))
        ])
      )
    }))
    .sort((left, right) => {
      if (right.totalHours !== left.totalHours) {
        return right.totalHours - left.totalHours;
      }

      return left.laborCategory.localeCompare(right.laborCategory);
    });

  return {
    monthKeys,
    monthLabels: monthKeys.map(formatMonthKey),
    totalHours: Number(
      Object.values(monthlyTotals).reduce((sum, hours) => sum + hours, 0).toFixed(2)
    ),
    monthlyTotals: Object.fromEntries(
      Object.entries(monthlyTotals).map(([monthKey, hours]) => [
        monthKey,
        Number(hours.toFixed(2))
      ])
    ),
    rows
  };
}

function summarizeSource(payload, records) {
  const recognizedRecordCount = records.filter((record) => record.category !== 'other').length;

  return {
    source: payload.source ?? 'unknown',
    rowCount: payload.rowCount ?? payload.rows?.length ?? 0,
    normalizedRecordCount: records.length,
    recognizedRecordCount,
    excludedRecordCount: records.length - recognizedRecordCount,
    fileName: payload.fileName ?? null,
    tableName: payload.tableName ?? null
  };
}

export function buildLaborDiagnosticsPayload(oldPayload, newPayload, now = new Date()) {
  const oldRecords = normalizeOldLaborRecords(oldPayload.rows ?? [], now);
  const newRecords = normalizeNewLaborRecords(newPayload.rows ?? [], now);
  const oldCoverage = getCoverage(oldRecords);
  const newCoverage = getCoverage(newRecords);
  const commonMonthKeys = new Set(
    [...oldCoverage].filter((monthKey) => newCoverage.has(monthKey))
  );
  const oldOnlyMonthKeys = new Set(
    [...oldCoverage].filter((monthKey) => !newCoverage.has(monthKey))
  );
  const newOnlyMonthKeys = new Set(
    [...newCoverage].filter((monthKey) => !oldCoverage.has(monthKey))
  );
  const oldOverall = aggregateRecords(oldRecords, commonMonthKeys).get('overall');
  const newOverall = aggregateRecords(newRecords, commonMonthKeys).get('overall');
  const monthly = getSortedMonthKeys(commonMonthKeys).map((monthKey) => {
    const monthSet = new Set([monthKey]);

    return {
      monthKey,
      monthLabel: formatMonthKey(monthKey),
      ...compareTotals(
        aggregateRecords(oldRecords, monthSet).get('overall'),
        aggregateRecords(newRecords, monthSet).get('overall')
      )
    };
  });

  return {
    generatedAt: now.toISOString(),
    comparisonWindow: {
      start: 'Jan 2025',
      end: formatMonthKey(getMonthKey(now.getUTCFullYear(), now.getUTCMonth())),
      commonMonths: getSortedMonthKeys(commonMonthKeys).map(formatMonthKey),
      oldOnlyMonths: getSortedMonthKeys(oldOnlyMonthKeys).map(formatMonthKey),
      newOnlyMonths: getSortedMonthKeys(newOnlyMonthKeys).map(formatMonthKey)
    },
    definitions: {
      totalHours: 'Direct Hours + Indirect Hours. Unrecognized labor categories are excluded.',
      directLaborPercent: 'Direct Hours / (Direct Hours + Indirect Hours).',
      difference: 'Absolute difference is |New - Old|. Percent difference uses Old as the baseline.'
    },
    sources: {
      old: summarizeSource(oldPayload, oldRecords),
      new: summarizeSource(newPayload, newRecords)
    },
    overall: compareTotals(oldOverall, newOverall),
    monthly,
    oldOtherHours: buildOldOtherHoursByCategory(oldRecords, oldCoverage),
    discrepancies: {
      facility: compareDimension(oldRecords, newRecords, commonMonthKeys, 'facility'),
      facilityMonth: compareFacilityMonths(oldRecords, newRecords, commonMonthKeys),
      laborCategory: compareDimension(
        oldRecords,
        newRecords,
        commonMonthKeys,
        'laborCategory'
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

const hoursFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1
});
const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function formatHours(value) {
  return Number.isFinite(value) ? hoursFormatter.format(value) : 'N/A';
}

function formatPercent(value) {
  return Number.isFinite(value) ? percentFormatter.format(value) : 'N/A';
}

function formatPercentagePoints(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)} pp` : 'N/A';
}

function renderOverallMetric(label, metricName, comparison, isPercent = false) {
  const valueFormatter = isPercent ? formatPercent : formatHours;
  const differenceFormatter = isPercent ? formatPercentagePoints : formatHours;
  const difference = comparison.differences[metricName];

  return `
    <article class="metric-card">
      <h3>${escapeHtml(label)}</h3>
      <div class="metric-values">
        <div><span>Old</span><strong>${valueFormatter(comparison.old[metricName])}</strong></div>
        <div><span>New</span><strong>${valueFormatter(comparison.new[metricName])}</strong></div>
      </div>
      <p>Abs Δ <b>${differenceFormatter(difference.absolute)}</b> · % Δ <b>${formatPercent(difference.percent)}</b></p>
    </article>
  `;
}

function renderComparisonHeader(firstColumnLabel) {
  return `
    <thead>
      <tr>
        <th rowspan="2">${escapeHtml(firstColumnLabel)}</th>
        <th colspan="4">Direct Hours</th>
        <th colspan="4">Indirect Hours</th>
        <th colspan="4">Total Hours</th>
        <th colspan="4">Direct Labor %</th>
      </tr>
      <tr>
        <th>Old</th><th>New</th><th>Abs Δ</th><th>% Δ</th>
        <th>Old</th><th>New</th><th>Abs Δ</th><th>% Δ</th>
        <th>Old</th><th>New</th><th>Abs Δ</th><th>% Δ</th>
        <th>Old</th><th>New</th><th>Abs Δ</th><th>% Δ</th>
      </tr>
    </thead>
  `;
}

function renderComparisonCells(comparison) {
  const renderHoursCells = (metricName) => `
    <td>${formatHours(comparison.old[metricName])}</td>
    <td>${formatHours(comparison.new[metricName])}</td>
    <td class="difference">${formatHours(comparison.differences[metricName].absolute)}</td>
    <td>${formatPercent(comparison.differences[metricName].percent)}</td>
  `;
  const directPercentDifference = comparison.differences.directLaborPercent;

  return `
    ${renderHoursCells('directHours')}
    ${renderHoursCells('indirectHours')}
    ${renderHoursCells('totalHours')}
    <td>${formatPercent(comparison.old.directLaborPercent)}</td>
    <td>${formatPercent(comparison.new.directLaborPercent)}</td>
    <td class="difference">${formatPercentagePoints(directPercentDifference.absolute)}</td>
    <td>${formatPercent(directPercentDifference.percent)}</td>
  `;
}

function renderMonthlyTable(rows) {
  if (rows.length === 0) {
    return '<p class="empty">No common months were found between the two sources.</p>';
  }

  return `
    <div class="table-scroll">
      <table>
        ${renderComparisonHeader('Month')}
        <tbody>
          ${rows.map((row) => `
            <tr>
              <th>${escapeHtml(row.monthLabel)}</th>
              ${renderComparisonCells(row)}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderDiscrepancyTable(rows, firstColumnLabel, includeMonth = false) {
  if (rows.length === 0) {
    return '<p class="empty">No comparable discrepancies were found.</p>';
  }

  return `
    <div class="table-scroll">
      <table class="discrepancy-table">
        <thead>
          <tr>
            <th>${escapeHtml(firstColumnLabel)}</th>
            ${includeMonth ? '<th>Month</th>' : ''}
            <th>Old Total</th>
            <th>New Total</th>
            <th>Abs Total Δ</th>
            <th>Total % Δ</th>
            <th>Old Direct %</th>
            <th>New Direct %</th>
            <th>Abs pp Δ</th>
            <th>Abs Direct Δ</th>
            <th>Abs Indirect Δ</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <th title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</th>
              ${includeMonth ? `<td>${escapeHtml(row.monthLabel)}</td>` : ''}
              <td>${formatHours(row.old.totalHours)}</td>
              <td>${formatHours(row.new.totalHours)}</td>
              <td class="difference">${formatHours(row.differences.totalHours.absolute)}</td>
              <td>${formatPercent(row.differences.totalHours.percent)}</td>
              <td>${formatPercent(row.old.directLaborPercent)}</td>
              <td>${formatPercent(row.new.directLaborPercent)}</td>
              <td class="difference">${formatPercentagePoints(row.differences.directLaborPercent.absolute)}</td>
              <td>${formatHours(row.differences.directHours.absolute)}</td>
              <td>${formatHours(row.differences.indirectHours.absolute)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderOldOtherHoursTable(otherHours) {
  if (otherHours.rows.length === 0) {
    return '<p class="empty">No old-source Other hours were found in the scorecard date window.</p>';
  }

  return `
    <div class="table-scroll">
      <table class="other-hours-table">
        <thead>
          <tr>
            <th>Raw labor_category</th>
            <th>Total</th>
            ${otherHours.monthLabels.map((monthLabel) => `
              <th>${escapeHtml(monthLabel)}</th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${otherHours.rows.map((row) => `
            <tr>
              <th title="${escapeHtml(row.laborCategory)}">${escapeHtml(row.laborCategory)}</th>
              <td class="difference">${formatHours(row.totalHours)}</td>
              ${otherHours.monthKeys.map((monthKey) => `
                <td>${formatHours(row.monthlyHours[monthKey])}</td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <th>All Other Categories</th>
            <td>${formatHours(otherHours.totalHours)}</td>
            ${otherHours.monthKeys.map((monthKey) => `
              <td>${formatHours(otherHours.monthlyTotals[monthKey])}</td>
            `).join('')}
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderMonthList(months) {
  return months.length > 0 ? months.map(escapeHtml).join(', ') : 'None';
}

export function renderLaborDiagnosticsPage(payload) {
  const oldSource = payload.sources.old;
  const newSource = payload.sources.new;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Labor Diagnostics</title>
    <style>
      :root { color-scheme: dark; font-family: Arial, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 16px; background: #111827; color: #f3f4f6; }
      .shell { width: min(1800px, 100%); margin: 0 auto; display: grid; gap: 12px; }
      .hero, .panel, .metric-card { border: 1px solid #374151; background: #1f2937; border-radius: 10px; }
      .hero { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 14px 16px; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { margin-bottom: 4px; font-size: 22px; }
      h2 { margin-bottom: 10px; font-size: 16px; }
      h3 { margin-bottom: 8px; font-size: 12px; color: #cbd5e1; text-transform: uppercase; letter-spacing: .08em; }
      .hero p, .note, .coverage { margin-bottom: 0; color: #cbd5e1; font-size: 12px; line-height: 1.45; }
      .button { flex: 0 0 auto; padding: 8px 12px; border: 1px solid #4b5563; border-radius: 999px; background: #28223c; color: white; text-decoration: none; font-size: 12px; font-weight: 700; }
      .panel { padding: 12px; overflow: hidden; }
      .source-grid, .overall-grid { display: grid; gap: 8px; }
      .source-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .overall-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .source { padding: 10px 12px; border: 1px solid #374151; border-radius: 8px; background: #111827; font-size: 12px; }
      .source b { color: white; }
      .metric-card { padding: 10px 12px; background: #111827; }
      .metric-values { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .metric-values div { display: grid; gap: 2px; }
      .metric-values span { color: #9ca3af; font-size: 10px; text-transform: uppercase; }
      .metric-values strong { font-size: 18px; }
      .metric-card p { margin: 8px 0 0; color: #cbd5e1; font-size: 11px; }
      .coverage { margin-top: 8px; }
      .table-scroll { max-width: 100%; overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
      th, td { padding: 5px 6px; border: 1px solid #374151; text-align: right; }
      thead th { position: sticky; top: 0; z-index: 1; background: #28223c; color: white; font-weight: 700; }
      tbody th, thead th:first-child { text-align: left; }
      tbody tr:nth-child(even) { background: #182231; }
      tbody tr:hover { background: #263548; }
      tfoot th, tfoot td { border-top: 2px solid #6b7280; background: #28223c; color: white; font-weight: 700; }
      .difference { color: #fbbf24; font-weight: 700; }
      .discrepancy-table tbody th { max-width: 230px; overflow: hidden; text-overflow: ellipsis; }
      .other-hours-table tbody th { max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
      .empty { margin: 0; padding: 8px; color: #fbbf24; font-size: 12px; }
      @media (max-width: 900px) {
        .overall-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 560px) {
        body { padding: 8px; }
        .hero { align-items: flex-start; }
        .source-grid, .overall-grid { grid-template-columns: 1fr; }
      }
      @media print {
        body { padding: 0; background: white; color: #111827; }
        .hero, .panel, .metric-card, .source { background: white; border-color: #9ca3af; color: #111827; }
        .button { display: none; }
        .hero p, .note, .coverage, .metric-card p, h3 { color: #374151; }
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
          <h1>Labor Utilization Diagnostics</h1>
          <p>Existing Labor Utilization vs Labor Utilization New Data. Generated ${escapeHtml(payload.generatedAt)}.</p>
        </div>
        <a class="button" href="/labor-diagnostics">Refresh</a>
      </section>

      <section class="panel">
        <h2>Comparison Scope</h2>
        <div class="source-grid">
          <div class="source"><b>Old:</b> ${escapeHtml(oldSource.source)} · ${formatHours(oldSource.rowCount)} rows · ${formatHours(oldSource.recognizedRecordCount)} recognized month records</div>
          <div class="source"><b>New:</b> ${escapeHtml(newSource.source)} · ${formatHours(newSource.rowCount)} rows · ${formatHours(newSource.recognizedRecordCount)} recognized records</div>
        </div>
        <p class="coverage"><b>Common months (${payload.comparisonWindow.commonMonths.length}):</b> ${renderMonthList(payload.comparisonWindow.commonMonths)}</p>
        <p class="coverage"><b>Old only:</b> ${renderMonthList(payload.comparisonWindow.oldOnlyMonths)} · <b>New only:</b> ${renderMonthList(payload.comparisonWindow.newOnlyMonths)}</p>
        <p class="note">${escapeHtml(payload.definitions.totalHours)} ${escapeHtml(payload.definitions.directLaborPercent)} ${escapeHtml(payload.definitions.difference)}</p>
      </section>

      <section class="panel">
        <h2>Overall — Common Months</h2>
        <div class="overall-grid">
          ${renderOverallMetric('Direct Hours', 'directHours', payload.overall)}
          ${renderOverallMetric('Indirect Hours', 'indirectHours', payload.overall)}
          ${renderOverallMetric('Total Hours', 'totalHours', payload.overall)}
          ${renderOverallMetric('Direct Labor %', 'directLaborPercent', payload.overall, true)}
        </div>
      </section>

      <section class="panel">
        <h2>Monthly Comparison</h2>
        ${renderMonthlyTable(payload.monthly)}
      </section>

      <section class="panel">
        <h2>Old Source Other Hours by Raw Labor Category</h2>
        <p class="note">Includes blank/null labor categories as <b>(Blank)</b>. Categories are sorted by total hours descending.</p>
        ${renderOldOtherHoursTable(payload.oldOtherHours)}
      </section>

      <section class="panel">
        <h2>Largest Facility Discrepancies — Top ${MAX_DISCREPANCY_ROWS}</h2>
        ${renderDiscrepancyTable(payload.discrepancies.facility, 'Facility')}
      </section>

      <section class="panel">
        <h2>Largest Facility / Month Discrepancies — Top ${MAX_DISCREPANCY_ROWS}</h2>
        ${renderDiscrepancyTable(payload.discrepancies.facilityMonth, 'Facility', true)}
      </section>

      <section class="panel">
        <h2>Largest Labor Category Discrepancies — Top ${MAX_DISCREPANCY_ROWS}</h2>
        ${renderDiscrepancyTable(payload.discrepancies.laborCategory, 'Labor Category')}
      </section>
    </main>
  </body>
</html>`;
}
