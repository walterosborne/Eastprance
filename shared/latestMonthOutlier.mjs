// Conservative display-only heuristic. Source data is never changed, and only
// the newest observed completed month is eligible (never recursively trim history).
const MIN_HISTORY = 6;
const LOOKBACK = 12;
const ROBUST_SIGMA_MULTIPLIER = 3.5;
const MIN_RELATIVE_CHANGE = 0.25;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function getLastCompletedMonthStamp(now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
}

export function assessLatestMonth(points, {
  lastCompletedMonth = getLastCompletedMonthStamp(),
  minAbsoluteChange = 1,
  minRelativeChange = MIN_RELATIVE_CHANGE
} = {}) {
  const valid = points.filter(({ stamp, value }) =>
    Number.isFinite(stamp) && stamp <= lastCompletedMonth && Number.isFinite(value)
  ).sort((a, b) => a.stamp - b.stamp);
  const latest = valid.at(-1);
  const history = valid.slice(0, -1).slice(-LOOKBACK).map(({ value }) => value);
  const result = {
    stamp: latest?.stamp ?? null, value: latest?.value ?? null, historyCount: history.length,
    lower: null, upper: null, processingMonth: null
  };
  if (history.length < MIN_HISTORY) return result;
  const center = median(history);
  const mad = median(history.map((value) => Math.abs(value - center)));
  // The relative/absolute floors keep flat histories and small counts from
  // treating ordinary changes as outliers when MAD is zero.
  const threshold = Math.max(
    ROBUST_SIGMA_MULTIPLIER * 1.4826 * mad,
    Math.abs(center) * minRelativeChange,
    minAbsoluteChange
  );
  const lower = center - threshold;
  const upper = center + threshold;
  return {
    ...result, lower, upper,
    processingMonth: latest.value < lower || latest.value > upper ? latest.stamp : null
  };
}
