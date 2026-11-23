import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import XLSX from 'xlsx';

// Skip Aug–Oct 2025. The two cost levels make the 12-observation window distinguishable
// from using all history or allowing the tested month into its own baseline.
const costs = [...Array(7).fill(10), ...Array(8).fill(100), 200];
const costRows = costs.map((cost, i) => ({
  date: new Date(Date.UTC(2025, i < 7 ? i : i + 3, 1)), division: 'DS Alpha', cost
}));
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
      const periods = [[2025, ['SEP', 'OCT', 'NOV', 'DEC']], [2026, ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL']]];
      return { rows: periods.flatMap(([year, months]) =>
        ['Actuals Delivered', 'Contract Commitment'].map(measure_type => ({
          year, measure_type,
          ...Object.fromEntries(months.map(key => [key, measure_type === 'Contract Commitment' ? 100 : 80]))
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

test('hidden report shows actual bounds and card decisions even when another source fails', async () => {
  const html = await renderOutlierReport(new Date('2026-11-22T12:00:00Z'));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.equal((html.match(/<th scope="row">/g) ?? []).length, 7);
  assert.match(text, /Controllable Costs Jul 2026 \$200\.00 \$75\.00 \$125\.00 12 Hidden \(above range\)/);
  assert.match(text, /On Time Delivery \(OTD\) Jul 2026 80% 60% 100% 10 Shown/);
  assert.match(text, /Labor Utilization Sep 2026 80% — — 0 Shown \(insufficient history\)/);
  assert.match(text, /SIF Incidents — — — — 0 No completed data/);
  assert.match(text, /Customer Escapes Data unavailable/);
  assert.deepEqual([...new Set(cacheReads)].sort(), ['controllable-costs-databricks-new', 'customer-escapes',
    'otd', 'safety-incidents', 'safety-nmfr']);
});

test('download contains the displayed latest values and ranges based only on earlier observed months', async () => {
  const html = await renderOutlierReport(new Date('2026-11-22T12:00:00Z'));
  const download = html.match(/download="outlier-report\.xlsx" href="data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,([^"]+)"/);
  assert.ok(download, 'report links to an Excel workbook');
  const book = XLSX.read(download[1], { type: 'base64', cellNF: true });
  assert.deepEqual(book.SheetNames, ['Most recent month', 'Historical ranges']);
  const [latest, history] = book.SheetNames.map(name => book.Sheets[name]);
  const records = sheet => XLSX.utils.sheet_to_json(sheet, { defval: null });
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

  assert.deepEqual(Object.keys(historyRows[0]), ['Card', 'Month and year', 'Actual value', 'Lower cutoff', 'Upper cutoff']);
  const costHistory = historyRows.filter(row => row.Card === 'Controllable Costs');
  assert.deepEqual(costHistory.map(monthLabel), ['Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026']);
  for (const row of costHistory.slice(0, 3)) assert.deepEqual(bounds(row), [100, 7.5, 12.5]);
  const transition = costHistory[3];
  assert.ok(Math.abs(transition['Lower cutoff'] - (-178.5095)) < 1e-8);
  assert.ok(Math.abs(transition['Upper cutoff'] - 288.5095) < 1e-8);
  assert.deepEqual(bounds(costHistory[4]), [100, 75, 125]);
  assert.deepEqual(bounds(costHistory[5]), bounds(cost));

  const otherHistory = historyRows.filter(row => row.Card !== cost.Card);
  assert.deepEqual(otherHistory.map(row => [row.Card, monthLabel(row)]), [['On Time Delivery (OTD)', 'Jul 2026']]);
  assert.deepEqual(bounds(otherHistory[0]), bounds(latestRows.find(row => row.Card === otherHistory[0].Card)));
});
