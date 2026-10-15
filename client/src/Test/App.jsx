import { useEffect, useMemo, useState } from 'react';
import { accountComparison, CLASSES, descriptionIndex, MONTHS, monthsFor, rawYearChange, sum } from './analysis';
import { AccountInvestigation, AccountLabel, MappingOverview } from './Investigation';
import './styles.css';

const money = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0
}).format(Number(value) || 0);
const number = (value) => new Intl.NumberFormat('en-US').format(Number(value) || 0);
const signed = (value) => `${value > 0 ? '+' : ''}${money(value)}`;
const monthText = (months) => months.length ? months.map((month) => MONTHS[month - 1]).join(', ') : 'none';
const monthlySum = (rows, year, month, classification = '', division = '') => sum(rows.filter((row) =>
  row.year === year && row.month === month && (!classification || row.controllable === classification)
  && (!division || row.division === division)
));

function Panel({ title, children, note }) {
  return <section className="ct-panel"><h2>{title}</h2>{note && <p className="ct-note">{note}</p>}{children}</section>;
}

function Table({ headings, rows }) {
  return <div className="ct-scroll"><table><thead><tr>{headings.map((h) => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.length ? rows : <tr><td colSpan={headings.length}>No rows for this selection.</td></tr>}</tbody></table></div>;
}

export default function CostTest() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [division, setDivision] = useState('');
  const [classification, setClassification] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('4100000');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/cost-test', { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
        return payload;
      })
      .then(setData)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const sql = data?.sql.accountRows ?? [];
  const raw = data?.raw.accountRows ?? [];
  const sql2026 = monthsFor(sql, 2026);
  const raw2026 = monthsFor(raw, 2026);
  const common2026 = sql2026.filter((month) => raw2026.includes(month));
  const common2025 = monthsFor(sql, 2025).filter((month) => monthsFor(raw, 2025).includes(month));
  const divisions = useMemo(() => [...new Set([...sql, ...raw].map((row) => row.division))].filter(Boolean).sort(), [data]);
  const descriptions = useMemo(() => ({
    sql: descriptionIndex(sql),
    raw: descriptionIndex(raw, data?.raw.mappingDiagnostics ?? [])
  }), [data]);
  const focusAccount = (account) => {
    setSelectedAccount(account);
    document.getElementById('ct-investigation')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) return <main className="ct-page"><h1>Cost source test</h1><p>Loading SQL extract and Databricks Raw…</p></main>;
  if (error) return <main className="ct-page"><h1>Cost source test</h1><p className="ct-error">{error}</p></main>;

  const rawByClass = (row) => !classification || row.controllable === classification;
  const filteredSql = sql.filter(rawByClass);
  const filteredRaw = raw.filter(rawByClass);
  const comparison = accountComparison(filteredSql, filteredRaw, common2026, 2026, division)
    .filter((row) => accountFilter === 'all' || (accountFilter === 'sql' && !row.inRaw)
      || (accountFilter === 'raw' && !row.inSql) || (accountFilter === 'both' && row.inSql && row.inRaw));
  const yearMonths = raw2026.filter((month) => monthsFor(raw, 2025).includes(month));
  const jump = rawYearChange(filteredRaw, yearMonths, division);
  const rawCoverage = new Map((data.raw.sourceCoverage ?? []).map((row) => [`${row.year}-${row.month}`, row]));
  const mappedCoverage = new Map((data.raw.mappedCoverage ?? []).map((row) => [`${row.year}-${row.month}`, row]));
  const monthRows = [2025, 2026].flatMap((year) => Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const key = `${year}-${month}`;
    const source = rawCoverage.get(key);
    const mapped = mappedCoverage.get(key);
    const sqlTotal = monthlySum(sql, year, month, '', division);
    const rawTotal = monthlySum(raw, year, month, '', division);
    const sqlCount = sql.filter((row) => row.year === year && row.month === month && (!division || row.division === division)).length;
    const rawCount = raw.filter((row) => row.year === year && row.month === month && (!division || row.division === division)).length;
    if (!source && !sqlCount && !rawCount) return null;
    return <tr key={key}><td>{MONTHS[index]} {year}</td><td>{sqlCount ? money(sqlTotal) : '—'}</td>
      <td>{rawCount ? money(rawTotal) : '—'}</td><td>{source ? number(source.rowCount) : '—'}</td>
      <td>{source ? money(source.cost) : '—'}</td><td>{mapped ? number(mapped.rowCount) : '—'}</td></tr>;
  }).filter(Boolean));

  return <main className="ct-page">
    <header className="ct-header"><div><span className="ct-kicker">QMI · unlinked diagnostic</span><h1>Cost source test</h1>
      <p>SQL extract “Controllable Costs” vs our classified “Databricks Raw.” The separate Databricks Processed card is excluded.</p></div>
      <a href="/">Back to scorecard</a></header>
    {!Array.isArray(data.raw.mappingDiagnostics) && <p className="ct-error">Detailed Raw mapping evidence is unavailable. Copy the updated server files and restart the server to refresh its cache.</p>}
    <p className="ct-note">Descriptions come from each source and can have multiple variants. Raw's existing query returns one description per account/cost-center/month; variants shown here are those returned across rows, not a complete account master.</p>
    <div className="ct-controls"><label>Division <select value={division} onChange={(e) => { setDivision(e.target.value); }}>
      <option value="">All divisions</option>{divisions.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Classification <select value={classification} onChange={(e) => setClassification(e.target.value)}>
        <option value="">All classes</option>{CLASSES.map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <div className="ct-callouts"><div><b>2026 overlap</b><strong>{monthText(common2026)}</strong><small>Account comparisons use only these shared months.</small></div>
      <div><b>SQL 2026</b><strong>{monthText(sql2026)}</strong><small>{number(data.sql.rowCount)} source rows · {data.sql.source}</small></div>
      <div><b>Raw 2026</b><strong>{monthText(raw2026)}</strong><small>{number(data.raw.sourceRowCount)} pre-mapping rows · {data.raw.source}</small></div></div>

    <Panel title="1 · Comparable 2026 totals" note="Only shared months are included. Classification follows each source's own key mapping; signed difference is Raw minus SQL.">
      <Table headings={['Class', 'SQL extract', 'Databricks Raw', 'Raw − SQL', 'Raw / SQL']} rows={CLASSES.map((name) => {
        const sqlValue = sum(sql.filter((row) => row.year === 2026 && common2026.includes(row.month) && row.controllable === name && (!division || row.division === division)));
        const rawValue = sum(raw.filter((row) => row.year === 2026 && common2026.includes(row.month) && row.controllable === name && (!division || row.division === division)));
        return <tr key={name}><td>{name}</td><td>{money(sqlValue)}</td><td>{money(rawValue)}</td><td className={rawValue - sqlValue < 0 ? 'ct-negative' : ''}>{signed(rawValue - sqlValue)}</td>
          <td>{sqlValue ? `${(rawValue / sqlValue * 100).toFixed(1)}%` : '—'}</td></tr>;
      })} />
    </Panel>

    <Panel title="2 · Which G/L accounts differ in 2026?" note="Presence and amounts follow the selected division/classification. Click an account to trace mapping outcomes and cost-center differences below. Signed difference is Raw minus SQL.">
      <div className="ct-inline"><label>Presence <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
        <option value="all">All accounts</option><option value="sql">SQL only</option><option value="raw">Raw only</option><option value="both">Both</option></select></label>
        <label className="ct-checkbox"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Show all {comparison.length}</label></div>
      <Table headings={['G/L account', 'SQL extract', 'Databricks Raw', 'Raw − SQL', 'Presence', 'Classification / category clue']} rows={comparison.slice(0, showAll ? undefined : 40).map((row) =>
        <tr key={row.account} className={selectedAccount === row.account ? 'ct-selected' : ''}>
          <td><AccountLabel account={row.account} descriptions={descriptions} onClick={() => focusAccount(row.account)} /></td>
          <td>{row.inSql ? money(row.sql) : '—'}</td><td>{row.inRaw ? money(row.raw) : '—'}</td>
          <td className={row.delta < 0 ? 'ct-negative' : ''}>{signed(row.delta)}</td>
          <td>{row.inSql && row.inRaw ? 'Both' : row.inSql ? 'SQL only' : 'Raw only'}</td>
          <td className="ct-clue">SQL: {Object.keys(row.sqlClasses).join(', ') || '—'} · Raw: {Object.keys(row.rawClasses).join(', ') || '—'}<br />
            {row.sqlCategories && row.rawCategories && row.sqlCategories !== row.rawCategories ? `Category differs: ${row.sqlCategories} / ${row.rawCategories}` : ''}</td></tr>
      )} />

    </Panel>

    <Panel title="3 · Where does the 2026 jump come from?" note={`Databricks Raw Jan–${MONTHS[(yearMonths.at(-1) ?? 1) - 1]} 2026 compared with the same months of 2025 (${monthText(yearMonths)}). This uses Raw on both sides to isolate the year change.`}>
      <div className="ct-callouts ct-callouts-small"><div><b>Raw 2025, matched months</b><strong>{money(sum(filteredRaw.filter((r) => r.year === 2025 && yearMonths.includes(r.month) && (!division || r.division === division))))}</strong></div>
        <div><b>Raw 2026, matched months</b><strong>{money(sum(filteredRaw.filter((r) => r.year === 2026 && yearMonths.includes(r.month) && (!division || r.division === division))))}</strong></div></div>
      <Table headings={['G/L account', '2025', '2026', '2026 − 2025', 'Presence']} rows={jump.slice(0, showAll ? undefined : 30).map((r) =>
        <tr key={r.account}><td><AccountLabel account={r.account} descriptions={descriptions} onClick={() => focusAccount(r.account)} /></td><td>{r.oldPresent ? money(r.old) : '—'}</td><td>{r.recentPresent ? money(r.recent) : '—'}</td>
          <td className={r.delta < 0 ? 'ct-negative' : ''}>{signed(r.delta)}</td><td>{r.oldPresent && r.recentPresent ? 'Both' : r.oldPresent ? '2025 only' : '2026 only'}</td></tr>)} />
    </Panel>

    {Array.isArray(data.raw.mappingDiagnostics) && selectedAccount && <AccountInvestigation
      key={selectedAccount} data={data} account={selectedAccount} onAccountChange={setSelectedAccount}
      months={common2026} division={division} descriptions={descriptions}
    />}

    <Panel title="4 · Is 2025 missing or differently mapped?" note="Monthly card totals are shown beside Raw's pre-mapping row count and cost. The pre-mapping pool spans a broader account and organization scope, so its dollars are diagnostic coverage only, not a third comparable card total.">
      <p className="ct-note">Shared 2025 months for account comparisons: {monthText(common2025)}. If SQL has no 2025 months, its extract cannot explain that year's account differences here.</p>
      <Table headings={['Month', 'SQL card', 'Raw card after QMI mapping', 'Raw pre-mapping rows', 'Raw pre-mapping cost', 'Raw mapped rows']} rows={monthRows} />
      <p className="ct-note">Raw mapping totals across all loaded months: {number(data.raw.hierarchyUnmatchedRowCount)} hierarchy-unmatched rows; {number(data.raw.excludedBySqlScopeRowCount)} rows excluded by division G/L rules. Eligible rows without a facility are included as Unmapped. These counts are global, not 2025-specific.</p>
      {common2025.length > 0 && <><h3>2025 G/L differences in shared months</h3><Table headings={['Account', 'SQL', 'Raw', 'Raw − SQL', 'Presence']} rows={accountComparison(sql, raw, common2025, 2025, division).slice(0, showAll ? undefined : 25).map((r) =>
        <tr key={r.account}><td><AccountLabel account={r.account} descriptions={descriptions} onClick={() => focusAccount(r.account)} /></td><td>{r.inSql ? money(r.sql) : '—'}</td><td>{r.inRaw ? money(r.raw) : '—'}</td><td>{signed(r.delta)}</td><td>{r.inSql && r.inRaw ? 'Both' : r.inSql ? 'SQL only' : 'Raw only'}</td></tr>)} /></>}
    </Panel>
    {Array.isArray(data.raw.mappingDiagnostics) && <MappingOverview data={data} />}
    <footer>Diagnostic only · {data.sql.tableName} vs {data.raw.tableName} · loaded {new Date(data.asOf).toLocaleString()}</footer>
  </main>;
}

