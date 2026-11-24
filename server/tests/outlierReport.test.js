import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import XLSX from 'xlsx';

// Skip Aug–Oct 2025. The two cost levels make the 12-observation window distinguishable
// from using all history or allowing the tested month into its own baseline.
const costs = [...Array(7).fill(10), ...Array(8).fill(100), 200];
const costRows = costs.map((cost, i) => ({
  date: new Date(Date.UTC(2025, i < 7 ? i : i + 3, 1)), division: 'DS Alpha', cost
}));
await mock.module('../facilityGroupingsRepository.js', { namedExports: {
  applyFacilityGroupingsToPayload: async payload => payload
} });
const cacheReads = [];
await mock.module('../sqlDatasetCache.js', { namedExports: {
  getCachedSqlDataset: async scope => {
    cacheReads.push(scope);
    if (scope === 'controllable-costs-databricks-new') {
      return { rows: [
        ...costRows, { ...costRows.at(-1), division: 'DS Future Concepts', cost: -100 },
        { date: '2025-08-01', cost: null }, { date: '2026-11-01', cost: 900 }
      ].reverse() };
    }
    if (scope === 'customer-escapes') throw new Error('Test source offline');
    if (scope === 'safety-incidents' || scope === 'safety-nmfr') {
      return { metrics: { sif: { rows: [] }, potentialSif: { rows: [] }, nmfr: { rows: [] } } };
    }
    if (scope === 'otd') {
      const periods = [[2025, ['JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']], [2026, ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL']]];
      return { rows: periods.flatMap(([year, months]) =>
        ['Actuals Delivered', 'Contract Commitment'].map(measure_type => ({
          year, measure_type,
          ...Object.fromEntries(months.map(key => [key, measure_type === 'Contract Commitment' ? 160 : 120])),
          // Against a 75% baseline, these fall below, on the lower, and on the upper cutoff.
          ...(year === 2026 && measure_type === 'Actuals Delivered' ? { MAY: 89, JUN: 90, JUL: 150 } : {})
        }))) };
    }
    return { rows: [] };
  }
} });
await mock.module('../laborUtilizationNewRepository.js', { namedExports: {
  readLaborUtilizationNewData: async () => ({ rows: [
    { year: 2026, month: 9, entered_hours: 80, labor_category: 'Direct' },
    { year: 2026, month: 9, entered_hours: 20, labor_category: 'Indirect' }
  ] })
} });
const { renderOutlierReport } = await import('../diagnostics/outlierReport.js');
const records = sheet => XLSX.utils.sheet_to_json(sheet, { defval: null });

async function downloadWorkbook(now = new Date('2026-11-22T12:00:00Z')) {
  const html = await renderOutlierReport(now);
  const download = html.match(/download="outlier-report\.xlsx" href="data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,([^"]+)"/);
  assert.ok(download, 'report links to an Excel workbook');
  return XLSX.read(download[1], { type: 'base64', cellNF: true, cellStyles: true });
}

test('hidden report shows actual bounds and card decisions even when another source fails', async () => {
  const html = await renderOutlierReport(new Date('2026-11-22T12:00:00Z'));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.equal((html.match(/<th scope="row">/g) ?? []).length, 7);
  assert.match(text, /Controllable Costs Jul 2026 \$200\.00 \$75\.00 \$125\.00 12 15 Hidden \(above range\)/);
  assert.match(text, /On Time Delivery \(OTD\) Jul 2026 93.75% 56.25% 93.75% 12 12 Shown/);
  assert.match(text, /Labor Utilization Sep 2026 80% — — 0 0 Shown \(insufficient history\)/);
  assert.match(text, /SIF Incidents — — — — 0 — No completed data/);
  assert.match(text, /Customer Escapes Data unavailable/);
  assert.deepEqual([...new Set(cacheReads)].sort(), ['controllable-costs-databricks-new', 'customer-escapes',
    'otd', 'safety-incidents', 'safety-nmfr']);
});

test('download contains the displayed latest values and ranges based only on earlier observed months', async () => {
  const book = await downloadWorkbook();
  assert.deepEqual(book.SheetNames, ['Most recent month', 'Historical ranges', 'Historical range summary']);
  const [latest, history] = book.SheetNames.map(name => book.Sheets[name]);
  const latestRows = records(latest);
  const historyRows = records(history);
  const monthLabel = row => XLSX.SSF.format('mmm yyyy', row['Month and year']);
  const bounds = row => [row['Actual value'], row['Lower cutoff'], row['Upper cutoff']];
  assert.equal(latestRows.length, 7);
  assert.ok([...latestRows, ...historyRows].every(row => row.Card !== 'Labor Hours (Databricks)'));

  const cost = latestRows.find(row => row.Card === 'Controllable Costs');
  assert.equal(monthLabel(cost), 'Jul 2026');
  assert.deepEqual(bounds(cost), [200, 75, 125]);
  assert.equal(cost.Decision, 'Hidden (above range)');
  const labor = latestRows.find(row => row.Card === 'Labor Utilization');
  assert.equal(monthLabel(labor), 'Sep 2026');
  assert.deepEqual(bounds(labor), [0.8, null, null]);
  const offline = latestRows.find(row => row.Card === 'Customer Escapes');
  assert.deepEqual(bounds(offline), [null, null, null]);
  assert.equal(offline.Decision, 'Data unavailable');
  assert.equal(latest.B2.z, 'mmm yyyy');
  assert.equal(latest.C2.z, '$#,##0.00');
  assert.equal(latest.C3.w, '80.00%');

  assert.deepEqual(Object.keys(historyRows[0]), ['Card', 'Month and year', 'Actual value', 'Lower cutoff', 'Upper cutoff', 'Prior months in window', 'Prior months available', 'Decision']);
  const costHistory = historyRows.filter(row => row.Card === 'Controllable Costs');
  assert.deepEqual(costHistory.map(monthLabel), ['Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026']);
  assert.deepEqual(costHistory.map(row => row['Prior months available']), [10, 11, 12, 13, 14, 15]);
  assert.deepEqual(costHistory.map(row => row['Prior months in window']), [10, 11, 12, 12, 12, 12]);
  for (const row of costHistory.slice(0, 3)) assert.deepEqual(bounds(row), [100, 7.5, 12.5]);
  const transition = costHistory[3];
  assert.ok(Math.abs(transition['Lower cutoff'] - (-178.5095)) < 1e-8);
  assert.ok(Math.abs(transition['Upper cutoff'] - 288.5095) < 1e-8);
  assert.deepEqual(bounds(costHistory[4]), [100, 75, 125]);
  assert.deepEqual(bounds(costHistory[5]), bounds(cost));

  const otherHistory = historyRows.filter(row => row.Card !== cost.Card);
  assert.ok(otherHistory.every(row => row.Card === 'On Time Delivery (OTD)'));
  assert.deepEqual(otherHistory.map(monthLabel), ['May 2026', 'Jun 2026', 'Jul 2026']);
  assert.deepEqual(bounds(otherHistory.at(-1)), bounds(latestRows.find(row => row.Card === 'On Time Delivery (OTD)')));
});

test('historical decisions, row fills and summary rates agree for spikes, drops and cutoff endpoints', async () => {
  const { Sheets } = await downloadWorkbook();
  const history = Sheets['Historical ranges'];
  const rows = records(history);
  assert.deepEqual(rows.map(row => row.Decision), [
    'Hidden', 'Hidden', 'Hidden', 'Shown', 'Shown', 'Hidden', // Costs
    'Hidden', 'Shown', 'Shown' // OTD includes both cutoff endpoints
  ]);
  rows.forEach((row, i) => {
    for (let c = 0; c < Object.keys(row).length; c++) {
      const style = history[XLSX.utils.encode_cell({ r: i + 1, c })].s;
      if (row.Decision === 'Hidden') {
        assert.equal(style.patternType, 'solid');
        assert.equal(style.fgColor.rgb.slice(-6), 'FFC7CE');
      } else {
        assert.equal(style?.patternType ?? 'none', 'none');
      }
    }
  });
  assert.equal(history.B2.w, 'Feb 2026');
  assert.equal(history.C2.w, '$100.00');
  assert.equal(history.C8.w, '55.625%');

  const summary = Sheets['Historical range summary'];
  const stats = records(summary);
  assert.deepEqual(stats.map(row => row.Card), [...records(Sheets['Most recent month']).map(row => row.Card), 'Total']);
  const counts = row => [row['Months evaluated'], row.Shown, row.Hidden, row['Below cutoff'], row['Above cutoff'], row['Outlier rate']];
  assert.deepEqual(counts(stats.find(row => row.Card === 'Controllable Costs')), [6, 2, 4, 0, 4, 4 / 6]);
  assert.deepEqual(counts(stats.find(row => row.Card === 'On Time Delivery (OTD)')), [3, 2, 1, 1, 0, 1 / 3]);
  assert.deepEqual(counts(stats.at(-1)), [9, 4, 5, 1, 4, 5 / 9]);
  assert.equal(summary.G2.w, '66.67%');
  const unavailable = stats.find(row => row.Card === 'Customer Escapes');
  assert.equal(unavailable.Coverage, 'Data unavailable');
  assert.deepEqual(counts(unavailable), Array(6).fill(null));
  const noHistory = stats.find(row => row.Card === 'Labor Utilization');
  assert.equal(noHistory.Coverage, 'No eligible months');
  assert.deepEqual(counts(noHistory), [0, 0, 0, 0, 0, null]);
});

test('empty history has no decisions and an undefined overall outlier rate', async () => {
  const { Sheets } = await downloadWorkbook(new Date('2025-06-01T12:00:00Z'));
  assert.equal(records(Sheets['Historical ranges']).length, 0);
  const total = records(Sheets['Historical range summary']).at(-1);
  assert.equal(total['Months evaluated'], 0);
  assert.equal(total.Hidden, 0);
  assert.equal(total['Outlier rate'], null);
});
