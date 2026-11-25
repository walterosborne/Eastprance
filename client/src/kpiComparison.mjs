function shiftMonth(stamp, offset) {
  const date = new Date(stamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1);
}

function monthNumber(stamp) {
  const date = new Date(stamp);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

export function relativeChange(value, baseline) {
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline === 0) return null;
  return (value - baseline) / Math.abs(baseline);
}

export function summarizeKpi(points, selectedMonth, currentMonth) {
  const observed = points.filter(p => Number.isFinite(p.value) && p.stamp <= currentMonth)
    .sort((a, b) => a.stamp - b.stamp);
  const month = selectedMonth === undefined ? observed.at(-1)?.stamp : selectedMonth;
  if (!Number.isFinite(month)) return null;
  const start = shiftMonth(month, -12);
  const history = observed.filter(p => p.stamp >= start && p.stamp < month);
  const average = history.length ? history.reduce((sum, p) => sum + p.value, 0) / history.length : null;
  const value = observed.find(p => p.stamp === month)?.value ?? null;
  const previousMonth = shiftMonth(month, -1);
  const previous = history.find(p => p.stamp === previousMonth)?.value;
  const previousDifference = relativeChange(value, previous);
  const difference = relativeChange(value, average);
  const target = shiftMonth(month, 1);
  const completed = observed.filter(p => p.stamp <= month && p.stamp < currentMonth);
  // Monthly ARIMA needs evenly spaced observations. Train on the latest continuous run.
  let first = completed.length - 1;
  while (first > 0 && shiftMonth(completed[first - 1].stamp, 1) === completed[first].stamp) first--;
  const training = completed.slice(Math.max(first, 0)).map(p => p.value);
  const steps = completed.length ? monthNumber(target) - monthNumber(completed.at(-1).stamp) : 0;
  return { month, value, average, difference, previousDifference, count: history.length, start, end: previousMonth,
    target, training, steps };
}

export async function predictKpi(training, steps, forecast) {
  if (!training.length) return null;
  try {
    const result = await forecast(training, steps);
    if (Number.isFinite(result?.expectedValue)) {
      const method = result.usedRecentBaseline ? 'Recent median' :
        result.method === 'average' ? 'Average fallback' : 'ARIMA';
      return { value: result.expectedValue, method };
    }
  } catch {
    // An unavailable or failed model can still use the completed training observations.
  }
  return { value: training.reduce((sum, n) => sum + n, 0) / training.length, method: 'Average fallback' };
}
