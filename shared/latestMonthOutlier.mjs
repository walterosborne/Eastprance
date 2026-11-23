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

function observedMonths(points, lastCompletedMonth = getLastCompletedMonthStamp()) {
  return points.filter(({ stamp, value }) =>
    Number.isFinite(stamp) && stamp <= lastCompletedMonth && Number.isFinite(value)
  ).sort((a, b) => a.stamp - b.stamp);
}

function assessMonthAt(months, index, {
  minAbsoluteChange = 1,
  minRelativeChange = MIN_RELATIVE_CHANGE
}) {
  const current = months[index];
  const history = months.slice(Math.max(0, index - LOOKBACK), index).map(({ value }) => value);
  const result = {
    stamp: current?.stamp ?? null, value: current?.value ?? null, historyCount: history.length,
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
    processingMonth: current.value < lower || current.value > upper ? current.stamp : null
  };
}

export function assessLatestMonth(points, options = {}) {
  const months = observedMonths(points, options.lastCompletedMonth);
  return assessMonthAt(months, months.length - 1, options);
}

export function assessMonthHistory(points, options = {}) {
  const months = observedMonths(points, options.lastCompletedMonth);
  return months.map((_, index) => assessMonthAt(months, index, options));
}
