const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short', year: 'numeric', timeZone: 'UTC'
});

export function hasKpiValue(value) {
  return value != null && value !== '' && Number.isFinite(Number(value));
}

export function getLatestDataMonth(rows, getStamps) {
  const now = new Date();
  const lastCompletedMonth = Date.UTC(now.getFullYear(), now.getMonth() - 1, 1);
  let latest = null;
  for (const row of rows) {
    const stamps = getStamps(row);
    for (const stamp of Array.isArray(stamps) ? stamps : [stamps]) {
      // KPIs never include the current month or future months.
      if (Number.isFinite(stamp) && stamp <= lastCompletedMonth
        && (latest == null || stamp > latest)) latest = stamp;
    }
  }
  return latest;
}

export function KpiMonthLabel({ stamp }) {
  const label = Number.isFinite(stamp)
    ? monthFormatter.format(new Date(stamp))
    : 'No data';

  return <>Latest complete month: {label}</>;
}
