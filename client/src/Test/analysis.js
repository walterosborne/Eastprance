export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const CLASSES = ['Controllable', 'Uncontrollable', 'Unclassified'];

export function sum(rows) {
  return rows.reduce((total, row) => total + Number(row.cost || 0), 0);
}

export function monthsFor(rows, year) {
  return [...new Set(rows.filter((row) => row.year === year).map((row) => row.month))]
    .sort((a, b) => a - b);
}

export function accountTotals(rows, months, year, division = '') {
  const totals = new Map();
  for (const row of rows) {
    if (row.year !== year || !months.includes(row.month)
      || (division && row.division !== division)) continue;
    const account = String(row.gl_account_cost_element);
    const current = totals.get(account) ?? { account, cost: 0, classes: {}, categories: new Set() };
    current.cost += Number(row.cost || 0);
    current.classes[row.controllable] = (current.classes[row.controllable] ?? 0) + Number(row.cost || 0);
    current.categories.add(row.cost_category);
    totals.set(account, current);
  }
  return totals;
}

export function accountComparison(sqlRows, rawRows, months, year, division = '') {
  const sql = accountTotals(sqlRows, months, year, division);
  const raw = accountTotals(rawRows, months, year, division);
  return [...new Set([...sql.keys(), ...raw.keys()])].map((account) => ({
    account,
    sql: sql.get(account)?.cost ?? 0,
    raw: raw.get(account)?.cost ?? 0,
    inSql: sql.has(account),
    inRaw: raw.has(account),
    sqlClasses: sql.get(account)?.classes ?? {},
    rawClasses: raw.get(account)?.classes ?? {},
    sqlCategories: [...(sql.get(account)?.categories ?? [])].join(', '),
    rawCategories: [...(raw.get(account)?.categories ?? [])].join(', '),
    delta: (raw.get(account)?.cost ?? 0) - (sql.get(account)?.cost ?? 0)
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function rawYearChange(rawRows, months, division = '') {
  const oldTotals = accountTotals(rawRows, months, 2025, division);
  const newTotals = accountTotals(rawRows, months, 2026, division);
  return [...new Set([...oldTotals.keys(), ...newTotals.keys()])].map((account) => ({
    account,
    old: oldTotals.get(account)?.cost ?? 0,
    recent: newTotals.get(account)?.cost ?? 0,
    oldPresent: oldTotals.has(account),
    recentPresent: newTotals.has(account),
    delta: (newTotals.get(account)?.cost ?? 0) - (oldTotals.get(account)?.cost ?? 0)
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
