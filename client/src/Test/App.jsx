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
  const [sdsCenterSearch, setSdsCenterSearch] = useState('');
  const [onlyUnmappedSds, setOnlyUnmappedSds] = useState(false);
  const [selectedSdsCenter, setSelectedSdsCenter] = useState('');

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
  const sdsMatchRows2025 = useMemo(() => [
    ...(data?.raw.accountRows ?? []).map((row) => ({ ...row, keyStatus: 'Mapped' })),
    ...(data?.raw.sdsNoFacilityCandidates ?? []).map((row) => ({ ...row, keyStatus: 'Needs key' }))
  ].filter((row) => row.year === 2025 && row.division === 'DS Strategic Deterrent Systems'), [data]);
  const sdsCenters2025 = useMemo(() => {
    const centers = new Map();
    for (const row of sdsMatchRows2025) {
      if (row.year !== 2025 || row.division !== 'DS Strategic Deterrent Systems') continue;
      const costCenter = row.cost_center || '(blank)';
      const center = centers.get(costCenter) ?? {
        costCenter, cost: 0, statuses: new Set(), accounts: new Map(), months: new Set()
      };
      center.cost += row.cost;
      center.statuses.add(row.keyStatus);
      center.months.add(row.month);
      const account = row.gl_account_cost_element;
      const accountDescriptions = center.accounts.get(account) ?? new Set();
      if (row.cost_element_description) accountDescriptions.add(row.cost_element_description);
      center.accounts.set(account, accountDescriptions);
      centers.set(costCenter, center);
    }
    return [...centers.values()].sort((left, right) =>
      Math.abs(right.cost) - Math.abs(left.cost) || left.costCenter.localeCompare(right.costCenter));
  }, [sdsMatchRows2025]);
  const sdsAccounts2025 = useMemo(() => {
    const accounts = new Map();
    for (const center of sdsCenters2025) {
      for (const [account, names] of center.accounts) {
        const descriptions = accounts.get(account) ?? new Set();
        for (const name of names) descriptions.add(name);
        accounts.set(account, descriptions);
      }
    }
    return [...accounts].sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }));
  }, [sdsCenters2025]);
  const visibleSdsCenters = sdsCenters2025.filter((center) => {
    if (onlyUnmappedSds && !center.statuses.has('Needs key')) return false;
    return center.costCenter.toLowerCase().includes(sdsCenterSearch.trim().toLowerCase());
  });
  const sdsMonthlyGlRows = useMemo(() => {
    const entries = new Map();
    for (const row of sdsMatchRows2025) {
      const account = row.gl_account_cost_element || '(blank)';
      const key = [row.cost_center, row.month, account, row.keyStatus].join('|');
      const entry = entries.get(key) ?? {
        costCenter: row.cost_center, month: row.month, account,
        keyStatus: row.keyStatus, cost: 0, descriptions: new Set()
      };
      entry.cost += Number(row.cost) || 0;
      if (row.cost_element_description) entry.descriptions.add(row.cost_element_description);
      entries.set(key, entry);
    }
    const centerOrder = new Map(sdsCenters2025.map((center, index) => [center.costCenter, index]));
    return [...entries.values()].sort((left, right) =>
      (centerOrder.get(left.costCenter) ?? Infinity) - (centerOrder.get(right.costCenter) ?? Infinity)
      || left.month - right.month || left.account.localeCompare(right.account, undefined, { numeric: true }));
  }, [sdsMatchRows2025, sdsCenters2025]);
  const focusedSdsCenter = sdsCenters2025.find((center) => center.costCenter === selectedSdsCenter)
    ?? sdsCenters2025.find((center) => center.statuses.has('Needs key'))
    ?? sdsCenters2025[0];
  const focusedMonthlyGlRows = sdsMonthlyGlRows.filter((row) => row.costCenter === focusedSdsCenter?.costCenter);
  const pendingSdsCenters = sdsCenters2025.filter((center) => center.statuses.has('Needs key'));
  const downloadSds2025 = () => {
    const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const headings = ['Raw cost center (independent list)', '2025 cost', 'Facility key status', '', 'G/L account (independent list)', 'G/L description'];
    const lines = [headings.map(csvCell).join(',')];
    const rowCount = Math.max(sdsCenters2025.length, sdsAccounts2025.length);
    for (let index = 0; index < rowCount; index += 1) {
      const center = sdsCenters2025[index];
      const account = sdsAccounts2025[index];
      lines.push([
        csvCell(center?.costCenter ?? ''),
        center ? center.cost.toFixed(2) : '',
        center ? (center.statuses.has('Needs key') ? 'Needs key' : 'Mapped') : '',
        '',
        csvCell(account?.[0] ?? ''),
        csvCell(account ? [...account[1]].sort().join(' / ') || 'Description unavailable' : '')
      ].join(','));
    }
    const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '2025_SDS_independent_cost_centers_and_GL_accounts.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const downloadSdsGrouped = () => {
    const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const headings = ['Raw cost center', 'Facility key status', '2025 signed cost', 'Distinct G/L accounts',
      ...MONTHS.map((month) => `${month} 2025`),
      ...Array.from({ length: 5 }, (_, index) => `G/L #${index + 1} by absolute cost (account · description · signed total)`)];
    const lines = [headings.map(csvCell).join(',')];
    for (const center of sdsCenters2025) {
      const rows = sdsMonthlyGlRows.filter((row) => row.costCenter === center.costCenter);
      const accounts = new Map();
      for (const row of rows) {
        const entry = accounts.get(row.account) ?? { account: row.account, cost: 0, descriptions: new Set() };
        entry.cost += row.cost;
        for (const description of row.descriptions) entry.descriptions.add(description);
        accounts.set(row.account, entry);
      }
      const largest = [...accounts.values()].sort((left, right) =>
        Math.abs(right.cost) - Math.abs(left.cost) || left.account.localeCompare(right.account));
      lines.push([
        csvCell(center.costCenter),
        csvCell([...center.statuses].sort().join(' / ')),
        center.cost.toFixed(2),
        accounts.size,
        ...MONTHS.map((_, index) => rows.filter((row) => row.month === index + 1)
          .reduce((total, row) => total + row.cost, 0).toFixed(2)),
        ...Array.from({ length: 5 }, (_, index) => {
          const entry = largest[index];
          return csvCell(entry
            ? `${entry.account} · ${[...entry.descriptions].sort().join(' / ') || 'Description unavailable'} · ${entry.cost.toFixed(2)}`
            : '');
        })
      ].join(','));
    }
    const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '2025_SDS_grouped_by_cost_center.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const downloadSdsMonthlyGl = () => {
    const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const headings = ['Raw cost center', 'Facility key status', 'Month', 'G/L account', 'G/L description', 'Signed cost'];
    const lines = [headings.map(csvCell).join(',')];
    for (const row of sdsMonthlyGlRows) {
      lines.push([
        csvCell(row.costCenter),
        csvCell(row.keyStatus),
        csvCell(`${MONTHS[row.month - 1]} 2025`),
        csvCell(row.account),
        csvCell([...row.descriptions].sort().join(' / ') || 'Description unavailable'),
        row.cost.toFixed(2)
      ].join(','));
    }
    const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '2025_SDS_cost_center_month_GL.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
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

    <Panel title="2025 SDS cost centers" note="2025 SDS rows with an eligible hierarchy and G/L account, including centers awaiting a facility key. Rows awaiting a key are excluded from the Raw card until mapped. The cost-center and G/L lists are independent; items on the same row do not correspond.">
      <div className="ct-controls"><button className="ct-export" type="button" onClick={downloadSds2025}>Download all as CSV for Excel</button>
        <label>Search cost centers
          <input type="search" value={sdsCenterSearch} onChange={(event) => setSdsCenterSearch(event.target.value)} placeholder="Cost center ID" />
        </label><label className="ct-checkbox"><input type="checkbox" checked={onlyUnmappedSds} onChange={(event) => setOnlyUnmappedSds(event.target.checked)} />Only Unmapped centers</label></div>
      <div className="ct-sds-lists">
        <div><h3>Raw cost centers · {number(visibleSdsCenters.length)} of {number(sdsCenters2025.length)}</h3>
          <p className="ct-note">All available 2025 months; signed costs.</p>
          <Table headings={['Cost center', '2025 cost', 'Facility key']} rows={visibleSdsCenters.map((center) =>
            <tr key={center.costCenter} className={focusedSdsCenter?.costCenter === center.costCenter ? 'ct-selected' : ''}>
              <td><button type="button" className="ct-link" onClick={() => setSelectedSdsCenter(center.costCenter)}>{center.costCenter}</button></td>
              <td>{money(center.cost)}</td><td>{center.statuses.has('Needs key') ? 'Needs key' : 'Mapped'}</td></tr>)} />
        </div>
        <div><h3>G/L accounts · {number(sdsAccounts2025.length)} unique</h3>
          <p className="ct-note">All 2025 SDS cost centers, independent of the left table's filters.</p>
          <Table headings={['G/L account', 'Description']} rows={sdsAccounts2025.map(([account, names]) =>
            <tr key={account}><td><b>{account}</b></td>
              <td className="ct-wrap">{[...names].sort().join(' / ') || 'Description unavailable'}</td></tr>)} />
        </div>
      </div>
    </Panel>

    <Panel title="2025 SDS address matching" note="The grouped CSV has one row per cost center: 2025 total, monthly totals, and its five largest G/L accounts. Compare monthly and G/L patterns with workbook totals grouped by Contract Name or Address. Needs key rows remain excluded from the Raw card until their facility key is added.">
      <div className="ct-controls">
        <button className="ct-export" type="button" onClick={downloadSdsGrouped}>Download grouped cost centers ({number(sdsCenters2025.length)} rows)</button>
        <button className="ct-export" type="button" onClick={downloadSdsMonthlyGl}>Download detailed center × month × G/L</button>
        <label>Cost center
          <select value={focusedSdsCenter?.costCenter ?? ''} onChange={(event) => setSelectedSdsCenter(event.target.value)}>
            {sdsCenters2025.map((center) => <option key={center.costCenter} value={center.costCenter}>{center.costCenter} · {center.statuses.has('Needs key') ? 'Needs key' : 'Mapped'}</option>)}
          </select>
        </label>
      </div>
      <div className="ct-callouts ct-callouts-small">
        <div><b>Centers awaiting a key</b><strong>{number(pendingSdsCenters.length)}</strong><small>{money(pendingSdsCenters.reduce((total, center) => total + center.cost, 0))} in 2025 signed costs</small></div>
        <div><b>{focusedSdsCenter?.costCenter ?? 'No center selected'} · 2025</b><strong>{focusedSdsCenter ? money(focusedSdsCenter.cost) : '—'}</strong>
          <small>{focusedSdsCenter?.statuses.has('Needs key') ? 'Excluded until facility key is added' : 'Already mapped'}</small></div>
      </div>
      <h3>Monthly totals · {focusedSdsCenter?.costCenter ?? '—'}</h3>
      <Table headings={['Month', 'Signed cost']} rows={MONTHS.map((month, index) => {
        const rows = focusedMonthlyGlRows.filter((row) => row.month === index + 1);
        return <tr key={month}><td>{month} 2025</td><td>{rows.length ? money(rows.reduce((total, row) => total + row.cost, 0)) : '—'}</td></tr>;
      })} />
      <h3>Monthly G/L details · {focusedSdsCenter?.costCenter ?? '—'}</h3>
      <Table headings={['Month', 'G/L account', 'Description', 'Signed cost', 'Facility key']} rows={focusedMonthlyGlRows.map((row) =>
        <tr key={`${row.month}-${row.account}-${row.keyStatus}`}>
          <td>{MONTHS[row.month - 1]} 2025</td><td>{row.account}</td>
          <td className="ct-wrap">{[...row.descriptions].sort().join(' / ') || 'Description unavailable'}</td>
          <td>{money(row.cost)}</td><td>{row.keyStatus}</td></tr>)} />
    </Panel>

    <Panel title="4 · Is 2025 missing or differently mapped?" note="Monthly card totals are shown beside Raw's pre-mapping row count and cost. The pre-mapping pool spans a broader account and organization scope, so its dollars are diagnostic coverage only, not a third comparable card total.">
      <p className="ct-note">Shared 2025 months for account comparisons: {monthText(common2025)}. If SQL has no 2025 months, its extract cannot explain that year's account differences here.</p>
      <Table headings={['Month', 'SQL card', 'Raw card after QMI mapping', 'Raw pre-mapping rows', 'Raw pre-mapping cost', 'Raw mapped rows']} rows={monthRows} />
      <p className="ct-note">Raw mapping totals across all loaded months: {number(data.raw.hierarchyUnmatchedRowCount)} hierarchy-unmatched rows; {number(data.raw.excludedBySqlScopeRowCount)} rows excluded by division G/L or facility rules. These counts are global, not 2025-specific.</p>
      {common2025.length > 0 && <><h3>2025 G/L differences in shared months</h3><Table headings={['Account', 'SQL', 'Raw', 'Raw − SQL', 'Presence']} rows={accountComparison(sql, raw, common2025, 2025, division).slice(0, showAll ? undefined : 25).map((r) =>
        <tr key={r.account}><td><AccountLabel account={r.account} descriptions={descriptions} onClick={() => focusAccount(r.account)} /></td><td>{r.inSql ? money(r.sql) : '—'}</td><td>{r.inRaw ? money(r.raw) : '—'}</td><td>{signed(r.delta)}</td><td>{r.inSql && r.inRaw ? 'Both' : r.inSql ? 'SQL only' : 'Raw only'}</td></tr>)} /></>}
    </Panel>
    {Array.isArray(data.raw.mappingDiagnostics) && <MappingOverview data={data} />}
    <footer>Diagnostic only · {data.sql.tableName} vs {data.raw.tableName} · loaded {new Date(data.asOf).toLocaleString()}</footer>
  </main>;
}

