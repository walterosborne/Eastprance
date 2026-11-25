import assert from 'node:assert/strict';
import test from 'node:test';
import { predictKpi, summarizeKpi } from './kpiComparison.mjs';

const stamp = index => Date.UTC(2025, index, 1);
const point = (index, value) => ({ stamp: stamp(index), value });

test('baseline uses calendar boundaries, includes zero and skips missing months', () => {
  const points = [point(14, 900), point(13, 15), point(12, 0), point(11, null), point(1, 10), point(0, 500)];
  const summary = summarizeKpi(points, stamp(13), stamp(14));
  assert.equal(summary.average, 5);
  assert.equal(summary.difference, 2);
  assert.equal(summary.count, 2);
  assert.equal(summary.start, stamp(1));
  assert.equal(summary.end, stamp(12));
  assert.deepEqual(summary.training, [0, 15]);
  assert.equal(summary.steps, 1);
});

test('forecast targets the following calendar month even when the KPI month is partial', () => {
  const summary = summarizeKpi([point(10, 8), point(11, 12), point(12, 999)], undefined, stamp(12));
  assert.equal(summary.month, stamp(12));
  assert.equal(summary.target, stamp(13));
  assert.deepEqual(summary.training, [8, 12]);
  assert.equal(summary.steps, 2);
});

test('zero, missing and negative baselines', () => {
  assert.equal(summarizeKpi([], null, stamp(1)), null);
  assert.equal(summarizeKpi([point(1, 5)], stamp(1), stamp(1)).average, null);
  assert.equal(summarizeKpi([point(0, 0), point(1, 5)], stamp(1), stamp(1)).difference, null);
  assert.equal(summarizeKpi([point(0, -10), point(1, -5)], stamp(1), stamp(1)).difference, 0.5);
});

test('uses forecast estimates, distinguishes methods and handles failures', async () => {
  const values = [2, 4];
  const fit = async (training, steps) => {
    assert.deepEqual(training, values);
    assert.equal(steps, 2);
    return { value: 10, expectedValue: 8, method: 'arima' };
  };
  assert.deepEqual(await predictKpi(values, 2, fit), { value: 8, method: 'ARIMA' });
  for (const [result, method] of [[{ method: 'average' }, 'Average fallback'],
    [{ usedRecentBaseline: true }, 'Recent median']]) {
    assert.deepEqual(await predictKpi(values, 2, async () => ({ ...result, expectedValue: 4 })), { value: 4, method });
  }
  assert.deepEqual(await predictKpi(values, 1, async () => { throw Error(); }), { value: 3, method: 'Average fallback' });
  assert.equal(await predictKpi([], 0, fit), null);
});
