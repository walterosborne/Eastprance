import { useMemo, useState } from 'react';
import { costCenterComparison, mappingTotals, MONTHS, OUTCOMES } from './analysis';

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0);
const count = (value) => new Intl.NumberFormat('en-US').format(value);
const monthText = (months) => months.map((month) => MONTHS[month - 1]).join(', ') || 'none';
const signed = (value) => `${value > 0 ? '+' : ''}${money(value)}`;

export function AccountLabel({ account, descriptions, onClick }) {
  const sql = descriptions.sql.get(account);
  const raw = descriptions.raw.get(account);
  return <div className="ct-account-label">
    {onClick ? <button className="ct-link" onClick={onClick}>{account}</button> : <b>{account}</b>}
    <small>SQL: {sql || 'description unavailable'}</small>
    <small>Raw: {raw || 'description unavailable'}</small>
  </div>;
}

function AmountCell({ item }) {
  return <td><b>{count(item.rowCount)} rows</b><small>{money(item.cost)}</small></td>;
}

export function MappingOverview({ data }) {
  const trace = data.raw.mappingDiagnostics ?? [];
  const months = [...new Set(trace.filter((row) => row.year >= 2025 && row.month >= 1 && row.month <= 12)
    .map((row) => `${row.year}-${String(row.month).padStart(2, '0')}`))].sort();
  return <section className="ct-panel"><h2>5 · Exactly where do the Raw rows drop out?</h2>
    <p className="ct-note">All divisions and accounts in the Raw query, independent of the page filters. Each grouped source row is counted once at its first failed check, or as included. These are aggregated query rows, not individual transactions. Dollars are signed; the pre-mapping pool is broader than the card.</p>
    <p className="ct-note">Both years use the latest cost-center hierarchy and the current facility key. Eligible rows without a facility are included as Unmapped. A missing hierarchy match can mean an out-of-scope organization or an unmapped historical cost center; it does not prove missing source data.</p>
    <div className="ct-scroll"><table><thead><tr><th>Month</th><th>Before mapping</th>{Object.values(OUTCOMES).map((name) => <th key={name}>{name}</th>)}</tr></thead>
      <tbody>{months.map((key) => {
        const [year, month] = key.split('-').map(Number);
        const totals = mappingTotals(trace, year, [month]);
        const before = Object.values(totals).reduce((result, value) => ({ rowCount: result.rowCount + value.rowCount, cost: result.cost + value.cost }), { rowCount: 0, cost: 0 });
        return <tr key={key}><td>{MONTHS[month - 1]} {year}</td><AmountCell item={before} />{Object.keys(OUTCOMES).map((outcome) => <AmountCell key={outcome} item={totals[outcome]} />)}</tr>;
      })}</tbody></table></div>
  </section>;
}

export function AccountInvestigation({ data, account, onAccountChange, months, division, descriptions }) {
  const trace = data.raw.mappingDiagnostics ?? [];
  const sql = data.sql.accountRows;
  const raw = data.raw.accountRows;
  const [sampleYear, setSampleYear] = useState(2025);
  const [reason, setReason] = useState('rejected');
  const [sqlAccount, setSqlAccount] = useState(account);
  const [rawAccount, setRawAccount] = useState(account);
  const [showAllCenters, setShowAllCenters] = useState(false);
  const choices = useMemo(() => [...new Set([
    ...[...sql, ...raw].map((row) => row.gl_account_cost_element),
    ...trace.map((row) => row.account)
  ])].filter(Boolean).sort(), [data]);
  const selectAccount = (value) => { onAccountChange(value); setSqlAccount(value); setRawAccount(value); };
  const stages2025 = mappingTotals(trace, 2025, months, account);
  const stages2026 = mappingTotals(trace, 2026, months, account);
  const before2025 = Object.values(stages2025).reduce((sum, row) => sum + row.rowCount, 0);
  const before2026 = Object.values(stages2026).reduce((sum, row) => sum + row.rowCount, 0);
  const samples = trace.filter((row) => row.year === sampleYear && months.includes(row.month) && row.account === account
    && (reason === 'all' || (reason === 'rejected' ? !['included', 'included_unmapped_facility'].includes(row.outcome) : row.outcome === reason)))
    .flatMap((row) => (row.samples ?? []).map((sample) => ({ ...sample, month: row.month, outcome: row.outcome })))
    .sort((a, b) => Math.abs(b.cost) - Math.abs(a.cost));
  const centerRows = costCenterComparison(sql, raw, months, sqlAccount, rawAccount, division);
  const sqlTotal = centerRows.reduce((sum, row) => sum + row.sql, 0);
  const rawTotal = centerRows.reduce((sum, row) => sum + row.raw, 0);
  const aligned = centerRows.filter((row) => row.sqlPresent && row.rawPresent && Math.abs(row.delta) < 0.01).length;
  const sourceDescriptions = (year) => [...new Set(trace.filter((row) => row.year === year && months.includes(row.month) && row.account === account)
    .flatMap((row) => row.descriptions ?? []))].sort().join(' / ') || 'No returned description';

  return <section className="ct-panel" id="ct-investigation">
    <h2>Account investigation · {account}</h2>
    <div className="ct-inline"><label>Focus account<select value={account} onChange={(e) => selectAccount(e.target.value)}>{choices.map((value) =>
      <option key={value} value={value}>{value} · {(descriptions.sql.get(value) || descriptions.raw.get(value) || 'no description').slice(0, 65)}</option>)}</select></label></div>
    <AccountLabel account={account} descriptions={descriptions} />
    <h3>A · Is this account absent upstream, or removed by our mapping?</h3>
    <p className="ct-note">Same month numbers in each year: {monthText(months)}. This tracing section uses all Raw divisions and classifications, including rows that cannot be assigned to a division. Raw descriptions shown below are the descriptions returned by the query for each year.</p>
    <div className="ct-callouts ct-callouts-small"><div><b>Raw 2025 · {count(before2025)} source rows</b><span>{sourceDescriptions(2025)}</span></div>
      <div><b>Raw 2026 · {count(before2026)} source rows</b><span>{sourceDescriptions(2026)}</span></div></div>
    {(!before2025 || !before2026) && <p className="ct-notice">{!before2025 ? '2025' : ''}{!before2025 && !before2026 ? ' and ' : ''}{!before2026 ? '2026' : ''}: no records for this account were returned by the date/G/L-filtered Raw query in these months. That absence occurs before QMI hierarchy/facility mapping; it does not establish that the account is absent from the entire Databricks table.</p>}
    <div className="ct-scroll"><table><thead><tr><th>Outcome</th><th>2025 rows / amount</th><th>2026 rows / amount</th><th>2026 − 2025</th></tr></thead><tbody>
      {Object.entries(OUTCOMES).map(([key, label]) => <tr key={key}><td>{label}</td><AmountCell item={stages2025[key]} /><AmountCell item={stages2026[key]} /><td>{signed(stages2026[key].cost - stages2025[key].cost)}</td></tr>)}
    </tbody></table></div>
    <h3>B · Cost centers behind those outcomes</h3>
    <div className="ct-inline"><label>Year<select value={sampleYear} onChange={(e) => setSampleYear(Number(e.target.value))}><option>2025</option><option>2026</option></select></label>
      <label>Outcome<select value={reason} onChange={(e) => setReason(e.target.value)}><option value="rejected">All rejected</option><option value="all">All outcomes</option>
        {Object.entries(OUTCOMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
    <p className="ct-note">Evidence samples: up to five largest absolute-dollar source rows per account/month/outcome. Showing the largest 30 retained examples, not the complete population. The totals above include every row. Description: {sourceDescriptions(sampleYear)}.</p>
    <div className="ct-scroll"><table><thead><tr><th>Month</th><th>Cost center</th><th>Outcome</th><th>Amount</th><th>Hierarchy / facility found</th><th>G/L description</th></tr></thead><tbody>
      {samples.slice(0, 30).map((row, index) => <tr key={index}><td>{MONTHS[row.month - 1]}</td><td>{row.cost_center || '(blank)'}</td><td>{OUTCOMES[row.outcome]}</td><td>{money(row.cost)}</td>
        <td className="ct-wrap">{[row.division, row.business_unit, row.facility].filter(Boolean).join(' · ') || 'No hierarchy/facility recorded'}</td><td className="ct-wrap">{row.description || 'Unavailable'}</td></tr>)}
      {!samples.length && <tr><td colSpan={6}>No examples for this selection. Check the outcome totals above.</td></tr>}
    </tbody></table></div>
    <h3>C · Reconcile SQL and Raw by cost center and month</h3>
    <p className="ct-note">2026 shared months; division filter applies, all classifications included. Pick the same account to locate a gap, or different accounts to investigate a possible reclassification. Matching totals are a lead, not proof that the underlying transactions are identical.</p>
    <div className="ct-inline">{[['SQL account', sqlAccount, setSqlAccount, descriptions.sql], ['Raw account', rawAccount, setRawAccount, descriptions.raw]].map(([label, value, setter, index]) =>
      <label key={label}>{label}<select value={value} onChange={(e) => setter(e.target.value)}>{choices.map((choice) => <option key={choice} value={choice}>{choice} · {(index.get(choice) || 'not returned / no description').slice(0, 65)}</option>)}</select><span className="ct-description">{index.get(value) || 'No description returned by this source'}</span></label>)}
    </div>
    <div className="ct-callouts"><div><b>SQL {sqlAccount}</b><strong>{money(sqlTotal)}</strong></div><div><b>Raw {rawAccount}</b><strong>{money(rawTotal)}</strong></div><div><b>Raw − SQL</b><strong>{signed(rawTotal - sqlTotal)}</strong><small>{aligned} cost-center/month totals match within one cent.</small></div></div>
    <label className="ct-checkbox"><input type="checkbox" checked={showAllCenters} onChange={(e) => setShowAllCenters(e.target.checked)} />Show all {centerRows.length} cost-center/month rows</label>
    <div className="ct-scroll"><table><thead><tr><th>Month</th><th>Cost center</th><th>SQL</th><th>Raw</th><th>Raw − SQL</th><th>SQL organization / classification</th><th>Raw organization / classification</th></tr></thead><tbody>
      {centerRows.slice(0, showAllCenters ? undefined : 60).map((row, index) => <tr key={index}><td>{MONTHS[row.month - 1]}</td><td>{row.cost_center || '(blank)'}</td><td>{row.sqlPresent ? money(row.sql) : '—'}</td><td>{row.rawPresent ? money(row.raw) : '—'}</td><td>{signed(row.delta)}</td><td className="ct-wrap">{[...row.sqlLabels].join(' / ') || '—'}</td><td className="ct-wrap">{[...row.rawLabels].join(' / ') || '—'}</td></tr>)}
      {!centerRows.length && <tr><td colSpan={7}>Neither selected account has mapped rows in this scope.</td></tr>}
    </tbody></table></div>
  </section>;
}
