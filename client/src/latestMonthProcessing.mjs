import { assessLatestMonth } from '../../shared/latestMonthOutlier.mjs';

export function findLatestMonthOutlier(points, options) {
  return assessLatestMonth(points, options).processingMonth;
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
