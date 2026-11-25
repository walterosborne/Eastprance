export { hasKpiValue } from '../../shared/scorecardMonths.mjs';

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short', year: 'numeric', timeZone: 'UTC'
});

export function getLatestDataMonth(rows, getStamps, endStamp) {
  const now = new Date();
  const latestAllowedMonth = endStamp ?? Date.UTC(now.getFullYear(), now.getMonth() - 1, 1);
  let latest = null;
  for (const row of rows) {
    const stamps = getStamps(row);
    for (const stamp of Array.isArray(stamps) ? stamps : [stamps]) {
      if (Number.isFinite(stamp) && stamp <= latestAllowedMonth
        && (latest == null || stamp > latest)) latest = stamp;
    }
  }
  return latest;
}

export function KpiMonthLabel({ stamp }) {
  const label = Number.isFinite(stamp)
    ? monthFormatter.format(new Date(stamp))
    : 'No data';

  return <>{label}</>;
}
