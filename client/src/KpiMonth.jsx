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
  if (!Number.isFinite(stamp)) return <>No data</>;
  const now = new Date();
  const expected = Date.UTC(now.getFullYear(), now.getMonth() - 1, 1);
  const label = monthFormatter.format(new Date(stamp));
  const warning = `Latest data: ${label}. Expected: ${monthFormatter.format(new Date(expected))}.`;
  return (
    <>
      {label}
      {stamp !== expected && (
        <span
          style={{ color: '#dc2626', fontSize: '12px', fontWeight: 700, marginLeft: '4px' }}
          title={warning}
          aria-label={warning}
        >!</span>
      )}
    </>
  );
}
