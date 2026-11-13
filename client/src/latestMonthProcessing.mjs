// Conservative display-only heuristic. Source data is never changed, and only
// the newest completed month is eligible (never recursively trim history).
const MIN_HISTORY = 6;
const LOOKBACK = 12;
const ROBUST_SIGMA_MULTIPLIER = 3.5;
const MIN_RELATIVE_CHANGE = 0.25;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function findLatestMonthOutlier(points, {
  lastCompletedMonth = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1),
  minAbsoluteChange = 1,
  minRelativeChange = MIN_RELATIVE_CHANGE
} = {}) {
  const valid = points.filter(({ stamp, value }) =>
    Number.isFinite(stamp) && stamp <= lastCompletedMonth && Number.isFinite(value)
  ).sort((a, b) => a.stamp - b.stamp);
  const latest = valid.at(-1);
  if (!latest) return null;
  const history = valid.slice(0, -1).slice(-LOOKBACK).map(({ value }) => value);
  if (history.length < MIN_HISTORY) return null;
  const center = median(history);
  const mad = median(history.map((value) => Math.abs(value - center)));
  // The relative/absolute floors keep flat histories and small counts from
  // treating ordinary changes as outliers when MAD is zero.
  const threshold = Math.max(
    ROBUST_SIGMA_MULTIPLIER * 1.4826 * mad,
    Math.abs(center) * minRelativeChange,
    minAbsoluteChange
  );
  return Math.abs(latest.value - center) > threshold ? latest.stamp : null;
}

export function excludeProcessingMonth(rows, processingMonth, getStamp, monthColumns = null, getYear = null) {
  if (!Number.isFinite(processingMonth)) return rows;
  if (!monthColumns) return rows.filter((row) => getStamp(row) !== processingMonth);
  const date = new Date(processingMonth);
  const key = monthColumns[date.getUTCMonth()].key;
  return rows.map((row) => getYear(row) === date.getUTCFullYear()
    ? { ...row, [key]: null } : row);
}

export function getProcessedDateRange(range, processingMonth) {
  if (!Number.isFinite(processingMonth)) return range;
  const date = new Date(processingMonth);
  const endStamp = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);
  return {
    startStamp: range?.startStamp ?? -Infinity,
    endStamp: Math.min(range?.endStamp ?? Infinity, endStamp)
  };
}

export function getProcessingMonthNote(stamp) {
  if (!Number.isFinite(stamp)) return '';
  const month = new Intl.DateTimeFormat('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(stamp);
  return `${month} data is still processing.`;
}
