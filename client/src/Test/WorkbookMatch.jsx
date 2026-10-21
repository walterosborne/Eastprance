import { useMemo, useState } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TARGETS = [
  { center: 'TDB84UKD', hint: '425 North 530 West · KDC warehouse' },
  { center: 'TDB84SUR', hint: '182 South 1070 West · Surge warehouse' },
  { center: 'TDB84HUN', hint: 'Huntsville addresses · inspect separately' }
];
const money = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0
}).format(value || 0);
const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const accountCode = (value) => String(value ?? '').trim().replace(/\.0$/, '').replace(/^0+(?=\d)/, '');
const amount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const string = String(value ?? '').trim();
  if (!string || string === '—') return null;
  const parsed = Number(string.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(parsed) ? parsed : null;
};
const monthOf = (value) => {
  if (value instanceof Date) return value.getFullYear() === 2025 ? value.getMonth() + 1 : null;
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 1 && value <= 12) return value;
    if (Number.isInteger(value) && value >= 202501 && value <= 202512) return value % 100;
    if (value > 40000 && value < 50000) {
      const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      return date.getUTCFullYear() === 2025 ? date.getUTCMonth() + 1 : null;
    }
  }
  const text = norm(value);
  if (!text || /\b20(?!25)\d\d\b/.test(text)) return null;
  if (/^2025(?:0[1-9]|1[0-2])$/.test(text)) return +text.slice(-2);
  const name = MONTHS.findIndex((month) => new RegExp(`\\b${month.toLowerCase()}[a-z]*\\b`).test(text));
  if (name >= 0) return name + 1;
  const iso = text.match(/^2025[-/]([01]?\d)(?:[-/]\d+)?$/);
  if (iso) return +iso[1] >= 1 && +iso[1] <= 12 ? +iso[1] : null;
  const us = text.match(/^([01]?\d)[-/]\d{1,2}[-/]2025$/);
  if (us) return +us[1] >= 1 && +us[1] <= 12 ? +us[1] : null;
  return /^\d{1,2}$/.test(text) && +text >= 1 && +text <= 12 ? +text : null;
};
const headerMonth = (heading) => {
  const text = norm(heading);
  if (/\b20(?!25)\d\d\b/.test(text)) return null;
  const index = MONTHS.findIndex((month) => new RegExp(`\\b${month.toLowerCase()}[a-z]*\\b`).test(text));
  return index < 0 ? null : index + 1;
};
const keyFor = (month, account) => `${month}|${account}`;

function extractSheets(book, XLSX) {
  const sheets = [];
  for (const name of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: '', raw: true });
    const headerIndex = rows.findIndex((row) => {
      const fields = row.map(norm);
      return fields.includes('address') && fields.some((field) => field === 'cost element' || field === 'g/l account');
    });
    if (headerIndex < 0) continue;
    sheets.push({ name, headers: rows[headerIndex].map((field) => String(field ?? '').trim()), rows: rows.slice(headerIndex + 1) });
  }
  return sheets;
}

function fieldIndex(headers, field) { return headers.findIndex((heading) => norm(heading) === norm(field)); }

function aggregateWorkbook(sheets, config, eligibleAccounts) {
  const addresses = new Map();
  let accepted = 0;
  let skipped = 0;
  let outOfScope = 0;
  const usedSheets = [];
  const missingSheets = [];
  for (const sheet of sheets) {
    const addressIndex = fieldIndex(sheet.headers, config.address);
    const accountIndex = fieldIndex(sheet.headers, config.account);
    const monthIndex = fieldIndex(sheet.headers, config.month);
    const amountIndex = fieldIndex(sheet.headers, config.cost);
    const monthColumns = sheet.headers.map((heading, index) => ({ index, month: headerMonth(heading) }))
      .filter(({ month }) => month !== null);
    if (addressIndex < 0 || accountIndex < 0 || (config.layout === 'wide' ? !monthColumns.length : monthIndex < 0 || amountIndex < 0)) {
      skipped += sheet.rows.length;
      missingSheets.push(sheet.name);
      continue;
    }
    usedSheets.push(sheet.name);
    for (const row of sheet.rows) {
      const address = String(row[addressIndex] ?? '').trim();
      const account = accountCode(row[accountIndex]);
      if (!address || !account) { skipped += 1; continue; }
      if (!eligibleAccounts.has(account)) { outOfScope += 1; continue; }
      const values = config.layout === 'wide'
        ? monthColumns.map(({ index, month }) => [month, amount(row[index])])
        : [[monthOf(row[monthIndex]), amount(row[amountIndex])]];
      for (const [month, cost] of values) {
        if (!month || cost === null) { skipped += 1; continue; }
        const id = norm(address);
        const entry = addresses.get(id) ?? { address, cells: new Map(), total: 0, count: 0 };
        const key = keyFor(month, account);
        entry.cells.set(key, (entry.cells.get(key) ?? 0) + cost);
        entry.total += cost;
        entry.count += 1;
        addresses.set(id, entry);
        accepted += 1;
      }
    }
  }
  return { addresses: [...addresses.values()].sort((a, b) => a.address.localeCompare(b.address)), accepted, skipped, outOfScope, usedSheets, missingSheets };
}

function compare(rawRows, address) {
  const rawCells = new Map();
  for (const row of rawRows) {
    const key = keyFor(row.month, row.account);
    rawCells.set(key, (rawCells.get(key) ?? 0) + row.cost);
  }
  const keys = new Set([...rawCells.keys(), ...address.cells.keys()]);
  let difference = 0;
  let scale = 0;
  let overlap = 0;
  for (const key of keys) {
    const raw = rawCells.get(key) ?? 0;
    const workbook = address.cells.get(key) ?? 0;
    difference += Math.abs(workbook - raw);
    scale += Math.abs(workbook) + Math.abs(raw);
    if (rawCells.has(key) && address.cells.has(key)) overlap += 1;
  }
  return { score: scale ? Math.max(0, 1 - difference / scale) : 0, overlap, rawCells };
}

export default function WorkbookMatch({ sdsMonthlyGlRows, sdsCenters2025 }) {
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [fileError, setFileError] = useState('');
  const [config, setConfig] = useState(null);
  const [selectedCenter, setSelectedCenter] = useState('TDB84UKD');
  const [selectedAddress, setSelectedAddress] = useState('');
  const [working, setWorking] = useState(false);

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setWorking(true);
    setFileError('');
    setSheets([]);
    setFileName('');
    try {
      const XLSX = await import('xlsx');
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const found = extractSheets(book, XLSX);
      if (!found.length) throw new Error('No sheet has Address and Cost Element/G/L account headers. Check that this is the original 2025 workbook.');
      const headings = found[0].headers;
      const pick = (...names) => headings.find((heading) => names.includes(norm(heading))) ?? '';
      const wide = headings.filter((heading) => headerMonth(heading) !== null).length >= 2;
      setConfig({
        address: pick('address'), account: pick('cost element', 'g/l account'),
        layout: wide ? 'wide' : 'rows',
        month: pick('month', 'period', 'date', 'accounting month', 'fiscal month'),
        cost: pick('cost', 'amount', 'actual', 'signed cost', '2025 cost')
      });
      setSheets(found);
      setFileName(file.name);
      setSelectedAddress('');
    } catch (error) { setFileError(error.message || 'Unable to open the workbook.'); }
    finally { setWorking(false); }
  };

  const eligibleAccounts = useMemo(() => new Set(sdsMonthlyGlRows.map((row) => row.account)), [sdsMonthlyGlRows]);
  const aggregated = useMemo(() => config && sheets.length ? aggregateWorkbook(sheets, config, eligibleAccounts) : null, [sheets, config, eligibleAccounts]);
  const rawRows = useMemo(() => sdsMonthlyGlRows.filter((row) => row.costCenter === selectedCenter), [sdsMonthlyGlRows, selectedCenter]);
  const ranked = useMemo(() => (aggregated?.addresses ?? []).map((address) => ({
    ...address, match: compare(rawRows, address)
  })).sort((a, b) => b.match.score - a.match.score || b.match.overlap - a.match.overlap), [aggregated, rawRows]);
  const targetHint = TARGETS.find((target) => target.center === selectedCenter)?.hint ?? '';
  const hinted = ranked.filter((entry) => {
    if (selectedCenter === 'TDB84UKD') return /425\s+north\s+530\s+west|kdc/i.test(entry.address);
    if (selectedCenter === 'TDB84SUR') return /182\s+south\s+1070\s+west|surge/i.test(entry.address);
    return /7057\s+old\s+madison|110\s+wynn|213\s+wynn/i.test(entry.address);
  });
  const candidates = [...new Map([...hinted, ...ranked.slice(0, 8)].map((entry) => [norm(entry.address), entry])).values()];
  const chosen = ranked.find((entry) => entry.address === selectedAddress) ?? hinted[0] ?? ranked[0];
  const chosenMatch = chosen?.match;
  const rawTotal = rawRows.reduce((total, row) => total + row.cost, 0);
  const accounts = useMemo(() => {
    if (!chosen) return [];
    const grouped = new Map();
    for (const row of rawRows) {
      const entry = grouped.get(row.account) ?? { account: row.account, description: [...row.descriptions].sort().join(' / '), raw: 0, workbook: 0 };
      entry.raw += row.cost;
      grouped.set(row.account, entry);
    }
    for (const [key, cost] of chosen.cells) {
      const account = key.split('|')[1];
      const entry = grouped.get(account) ?? { account, description: '', raw: 0, workbook: 0 };
      entry.workbook += cost;
      grouped.set(account, entry);
    }
    return [...grouped.values()].sort((a, b) => Math.abs(b.workbook - b.raw) - Math.abs(a.workbook - a.raw));
  }, [chosen, rawRows]);
  const cellDifferences = useMemo(() => {
    if (!chosen) return [];
    const rawCells = chosen.match.rawCells;
    const descriptions = new Map(rawRows.map((row) => [row.account, [...row.descriptions].sort().join(' / ')]));
    return [...new Set([...rawCells.keys(), ...chosen.cells.keys()])].map((key) => {
      const [month, account] = key.split('|');
      const raw = rawCells.get(key) ?? 0;
      const workbook = chosen.cells.get(key) ?? 0;
      return { key, month: +month, account, description: descriptions.get(account) ?? '', raw, workbook };
    }).sort((a, b) => Math.abs(b.workbook - b.raw) - Math.abs(a.workbook - a.raw));
  }, [chosen, rawRows]);

  return <section className="ct-panel" id="ct-workbook-match">
    <h2>2025 workbook address match</h2>
    <p className="ct-note">Load the original 2025 cost workbook here. It stays in this browser tab; the page sums address × month × G/L and compares those totals with eligible SDS Raw centers. Suggested matches are leads, not facility-key assignments.</p>
    <div className="ct-controls"><label>2025 workbook (.xlsx or .xls)
      <input type="file" accept=".xlsx,.xls" onChange={onFile} /></label>
      {fileName && <span>{fileName} · {sheets.length} sheets with address and G/L fields</span>}
      {working && <span>Reading workbook…</span>}</div>
    {fileError && <p className="ct-error">{fileError}</p>}
    {config && <>
      <div className="ct-controls">
        <label>Address column <select value={config.address} onChange={(event) => setConfig({ ...config, address: event.target.value })}>
          {sheets[0].headers.map((header, index) => <option key={index} value={header}>{header || `(blank ${index + 1})`}</option>)}
        </select></label>
        <label>G/L account column <select value={config.account} onChange={(event) => setConfig({ ...config, account: event.target.value })}>
          {sheets[0].headers.map((header, index) => <option key={index} value={header}>{header || `(blank ${index + 1})`}</option>)}
        </select></label>
        <label>Month layout <select value={config.layout} onChange={(event) => setConfig({ ...config, layout: event.target.value })}>
          <option value="wide">Jan–Dec columns</option><option value="rows">Month/date and amount columns</option></select></label>
        {config.layout === 'rows' && <>
          <label>Month or date column <select value={config.month} onChange={(event) => setConfig({ ...config, month: event.target.value })}>
            <option value="">Choose column</option>{sheets[0].headers.filter(Boolean).map((header, index) => <option key={index}>{header}</option>)}
          </select></label>
          <label>Signed cost column <select value={config.cost} onChange={(event) => setConfig({ ...config, cost: event.target.value })}>
            <option value="">Choose column</option>{sheets[0].headers.filter(Boolean).map((header, index) => <option key={index}>{header}</option>)}
          </select></label>
        </>}
      </div>
      <p className="ct-note">{config.layout === 'wide' ? `Detected month columns: ${sheets[0].headers.filter((heading) => headerMonth(heading) !== null).join(', ') || 'none'}.` : 'Choose the month/date and signed cost columns.'} Parsed {aggregated?.accepted.toLocaleString() ?? 0} amounts across {aggregated?.addresses.length ?? 0} addresses on sheets {aggregated?.usedSheets.join(', ') || 'none'}. Skipped {aggregated?.skipped.toLocaleString() ?? 0} blank or unusable values and {aggregated?.outOfScope.toLocaleString() ?? 0} rows outside the eligible Raw G/L list.{aggregated?.missingSheets.length ? ` Sheets without the selected fields: ${aggregated.missingSheets.join(', ')}.` : ''}</p>
      {aggregated?.accepted > 0 && <>
        <div className="ct-controls"><label>Raw cost center <select value={selectedCenter} onChange={(event) => { setSelectedCenter(event.target.value); setSelectedAddress(''); }}>
          {[...TARGETS.map((target) => target.center), ...sdsCenters2025.map((center) => center.costCenter).filter((center) => !TARGETS.some((target) => target.center === center))]
            .map((center) => <option key={center}>{center}</option>)}
        </select></label>
          <label>Workbook address <select value={chosen?.address ?? ''} onChange={(event) => setSelectedAddress(event.target.value)}>
            {ranked.map((entry) => <option key={entry.address} value={entry.address}>{entry.address}</option>)}
          </select></label></div>
        <p className="ct-note">Lead to check: {targetHint}. Rank uses signed G/L × month amounts; a high score alone does not prove a facility mapping.</p>
        <div className="ct-sds-lists">
          <div><h3>Suggested addresses for {selectedCenter}</h3>
            <div className="ct-scroll"><table><thead><tr><th>Address</th><th>Agreement</th><th>Shared G/L-month cells</th><th>Workbook total</th></tr></thead><tbody>
              {candidates.map((entry) => <tr key={entry.address} className={entry.address === chosen?.address ? 'ct-selected' : ''}>
                <td><button className="ct-link" type="button" onClick={() => setSelectedAddress(entry.address)}>{entry.address}</button></td>
                <td>{(entry.match.score * 100).toFixed(1)}%</td><td>{entry.match.overlap}</td><td>{money(entry.total)}</td>
              </tr>)}
            </tbody></table></div></div>
          <div><h3>{selectedCenter} compared with {chosen?.address}</h3>
            <p className="ct-note">Raw {money(rawTotal)} · workbook {money(chosen?.total)} · difference {money((chosen?.total ?? 0) - rawTotal)} · {chosenMatch?.overlap ?? 0} shared G/L-month cells.</p>
            <div className="ct-scroll"><table><thead><tr><th>Month</th><th>Raw center</th><th>Workbook address</th><th>Workbook − Raw</th></tr></thead><tbody>
              {MONTHS.map((month, index) => {
                const rawCost = rawRows.filter((row) => row.month === index + 1).reduce((total, row) => total + row.cost, 0);
                const bookCost = [...(chosen?.cells ?? new Map())].filter(([key]) => key.startsWith(`${index + 1}|`)).reduce((total, [, cost]) => total + cost, 0);
                return <tr key={month}><td>{month}</td><td>{money(rawCost)}</td><td>{money(bookCost)}</td><td>{money(bookCost - rawCost)}</td></tr>;
              })}
            </tbody></table></div></div>
        </div>
        <h3>G/L differences for the selected address and center</h3>
        <div className="ct-scroll"><table><thead><tr><th>G/L account</th><th>Description from Raw</th><th>Raw center</th><th>Workbook address</th><th>Workbook − Raw</th></tr></thead><tbody>
          {accounts.map((entry) => <tr key={entry.account}><td>{entry.account}</td><td className="ct-wrap">{entry.description || '—'}</td><td>{money(entry.raw)}</td><td>{money(entry.workbook)}</td><td>{money(entry.workbook - entry.raw)}</td></tr>)}
        </tbody></table></div>
        <h3>Largest month × G/L differences</h3>
        <p className="ct-note">These are the signed cells used to rank the address. A matching annual total can still hide offsetting months or accounts.</p>
        <div className="ct-scroll"><table><thead><tr><th>Month</th><th>G/L account</th><th>Description from Raw</th><th>Raw center</th><th>Workbook address</th><th>Workbook − Raw</th></tr></thead><tbody>
          {cellDifferences.slice(0, 50).map((entry) => <tr key={entry.key}><td>{MONTHS[entry.month - 1]}</td><td>{entry.account}</td>
            <td className="ct-wrap">{entry.description || '—'}</td><td>{money(entry.raw)}</td><td>{money(entry.workbook)}</td><td>{money(entry.workbook - entry.raw)}</td></tr>)}
        </tbody></table></div>
      </>}
    </>}
  </section>;
}
