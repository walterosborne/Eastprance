import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const costRows = Array.from({ length: 7 }, (_, i) => ({
  date: new Date(Date.UTC(2026, i, 1)), division: 'DS Alpha', cost: i === 6 ? 200 : 100
}));
const cacheReads = [];
await mock.module('../sqlDatasetCache.js', { namedExports: {
  getCachedSqlDataset: async scope => {
    cacheReads.push(scope);
    if (scope === 'controllable-costs-databricks-new') {
      return { rows: [...costRows, { ...costRows[6], division: 'DS Future Concepts', cost: -100 }] };
    }
    if (scope === 'customer-escapes') throw new Error('Test source offline');
    if (scope === 'safety-incidents' || scope === 'safety-nmfr') {
      return { metrics: { sif: { rows: [] }, potentialSif: { rows: [] }, nmfr: { rows: [] } } };
    }
    if (scope === 'otd') {
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL'];
      return { rows: ['Actuals Delivered', 'Contract Commitment'].map(measure_type => ({
        measure_type, year: 2026,
        ...Object.fromEntries(months.map(key => [key, measure_type === 'Contract Commitment' ? 100 : 80]))
      })) };
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
  assert.match(text, /Controllable Costs Jul 2026 \$200\.00 \$75\.00 \$125\.00 6 Hidden \(above range\)/);
  assert.match(text, /On Time Delivery \(OTD\) Jul 2026 80% 60% 100% 6 Shown/);
  assert.match(text, /Labor Utilization Sep 2026 80% — — 0 Shown \(insufficient history\)/);
  assert.match(text, /SIF Incidents — — — — 0 No completed data/);
  assert.match(text, /Customer Escapes Data unavailable/);
  assert.deepEqual([...new Set(cacheReads)].sort(), ['controllable-costs-databricks-new', 'customer-escapes',
    'otd', 'safety-incidents', 'safety-nmfr']);
});
