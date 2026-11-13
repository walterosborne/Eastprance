import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findLatestMonthOutlier, excludeProcessingMonth, getProcessedDateRange, getProcessingMonthNote
} from './latestMonthProcessing.mjs';

const october = Date.UTC(2026, 9, 1);
const september = Date.UTC(2026, 8, 1);
const options = { lastCompletedMonth: october };
const points = (values) => values.map((value, index) => ({ stamp: Date.UTC(2026, index, 1), value }));
const history = [100, 102, 98, 101, 99, 103, 100, 99, 101];

test('hide a newest-month spike or drop, then restore it after refresh', () => {
  assert.equal(findLatestMonthOutlier(points([...history, 500]), options), october);
  assert.equal(findLatestMonthOutlier(points([...history, 5]), options), october);
  assert.equal(findLatestMonthOutlier(points([...history, 100]), options), null);
});

test('normal variation, gradual trends and insufficient history remain visible', () => {
  assert.equal(findLatestMonthOutlier(points([...history, 110]), options), null);
  assert.equal(findLatestMonthOutlier(points([100, 110, 120, 130, 140, 150, 160]), options), null);
  assert.equal(findLatestMonthOutlier(points([100, 100, 100, 100, 100, 500]), options), null);
});

test('labor utilization hides a sharp drop that is below the general relative cutoff', () => {
  const values = [0.75, 0.746, 0.751, 0.749, 0.752, 0.748, 0.76, 0.76, 0.79, 0.567];
  assert.equal(findLatestMonthOutlier(points(values), { ...options, minAbsoluteChange: 0.05 }), null);
  assert.equal(findLatestMonthOutlier(points(values), {
    ...options, minAbsoluteChange: 0.05, minRelativeChange: 0.15
  }), october);
  assert.equal(findLatestMonthOutlier(points([...values.slice(0, -1), 0.70]), {
    ...options, minAbsoluteChange: 0.05, minRelativeChange: 0.15
  }), null);
});

test('a historical outlier stays visible and does not cause recursive trimming', () => {
  assert.equal(findLatestMonthOutlier(points([100, 100, 100, 100, 100, 100, 100, 100, 500, 100]), options), null);
  const data = points([100, 100, 100, 100, 100, 100, 100, 100, 500, 600]);
  const hidden = findLatestMonthOutlier(data, options);
  assert.equal(hidden, october);
  const kept = excludeProcessingMonth(data, hidden, (row) => row.stamp);
  assert.equal(kept.at(-1).value, 500);
});

test('flat and zero histories use a meaningful floor; rate metrics use their own units', () => {
  assert.equal(findLatestMonthOutlier(points([0, 0, 0, 0, 0, 0, 1]), { ...options, minAbsoluteChange: 3 }), null);
  assert.notEqual(findLatestMonthOutlier(points([0, 0, 0, 0, 0, 0, 20]), { ...options, minAbsoluteChange: 3 }), null);
  assert.equal(findLatestMonthOutlier(points([...Array(9).fill(0.95), 0.1]), { ...options, minAbsoluteChange: 0.05 }), october);
  assert.equal(findLatestMonthOutlier(points([...Array(9).fill(-100), -500]), options), october);
});

test('current/future data, missing values and invalid dates cannot manufacture observations', () => {
  const data = [...points([...history, 100, 900]), { stamp: NaN, value: 900 }];
  assert.equal(findLatestMonthOutlier(data, options), null);
  assert.equal(findLatestMonthOutlier(points([100, null, NaN, Infinity, 100, 100, 900]), options), null);
});

test('exclude narrow rows without mutating source data', () => {
  const rows = points([...history, 500]);
  const copy = structuredClone(rows);
  const clean = excludeProcessingMonth(rows, october, (row) => row.stamp);
  assert.equal(clean.length, 9);
  assert.equal(clean.at(-1).stamp, september);
  assert.deepEqual(rows, copy);
  assert.equal(excludeProcessingMonth(rows, null, (row) => row.stamp), rows);
});

test('wide annual rows lose only the flagged month in the correct year', () => {
  const columns = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].map((key) => ({ key }));
  const rows = [{ year: 2025, SEP: 100, OCT: 100 }, { year: 2026, SEP: 100, OCT: 5 }];
  const clean = excludeProcessingMonth(rows, october, null, columns, (row) => row.year);
  assert.equal(clean[0], rows[0]);
  assert.deepEqual(clean[1], { year: 2026, SEP: 100, OCT: null });
  assert.equal(rows[1].OCT, 5);
});

test('clamp all time groupings, handle year rollover and keep older date windows', () => {
  assert.deepEqual(getProcessedDateRange({ startStamp: Date.UTC(2026, 0, 1), endStamp: october }, october),
    { startStamp: Date.UTC(2026, 0, 1), endStamp: september });
  const older = { startStamp: Date.UTC(2026, 0, 1), endStamp: Date.UTC(2026, 5, 1) };
  assert.deepEqual(getProcessedDateRange(older, october), older);
  assert.equal(getProcessedDateRange(null, Date.UTC(2026, 0, 1)).endStamp, Date.UTC(2025, 11, 1));
  const onlyOctober = getProcessedDateRange({ startStamp: october, endStamp: october }, october);
  assert(onlyOctober.endStamp < onlyOctober.startStamp);
});

test('processing note appears only for a hidden month', () => {
  assert.equal(getProcessingMonthNote(october), 'October 2026 data is still processing.');
  assert.equal(getProcessingMonthNote(null), '');
});
