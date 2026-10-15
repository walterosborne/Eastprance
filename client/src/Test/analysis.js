export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const CLASSES = ['Controllable', 'Uncontrollable', 'Unclassified'];
export const OUTCOMES = {
  invalid: 'Invalid source values',
  no_hierarchy: 'No eligible hierarchy match',
  outside_division: 'Outside CWI / SDS',
  account_rule: 'Division G/L rule',
  no_facility: 'No eligible facility (old mapping)',
  included: 'Included with mapped facility',
  included_unmapped_facility: 'Included as Unmapped facility'
};

export function descriptionIndex(rows, trace = []) {
  const index = new Map();
  const add = (account, descriptions) => {
    const values = index.get(String(account)) ?? new Set();
    for (const value of descriptions) if (String(value ?? '').trim()) values.add(String(value).trim());
    index.set(String(account), values);
  };
  for (const row of rows) add(row.gl_account_cost_element, [row.cost_element_description]);
  for (const row of trace) add(row.account, row.descriptions ?? []);
  return new Map([...index].map(([account, values]) => [account, [...values].sort().join(' / ')]));
}

export function mappingTotals(trace, year, months, account = '') {
  const totals = Object.fromEntries(Object.keys(OUTCOMES).map((key) => [key, { cost: 0, rowCount: 0, absoluteCost: 0 }]));
  for (const row of trace) {
    if (row.year !== year || !months.includes(row.month) || (account && row.account !== account)) continue;
    if (!totals[row.outcome]) continue;
    totals[row.outcome].cost += row.cost;
    totals[row.outcome].rowCount += row.rowCount;
    totals[row.outcome].absoluteCost += row.absoluteCost;
  }
  return totals;
}

export function costCenterComparison(sql, raw, months, sqlAccount, rawAccount, division = '') {
  const groups = new Map();
  for (const [source, rows, account] of [['sql', sql, sqlAccount], ['raw', raw, rawAccount]]) {
    for (const row of rows) {
      if (row.year !== 2026 || !months.includes(row.month) || row.gl_account_cost_element !== account
        || (division && row.division !== division)) continue;
      const key = JSON.stringify([row.month, row.cost_center]);
      const group = groups.get(key) ?? {
        month: row.month, cost_center: row.cost_center, sql: 0, raw: 0,
        sqlPresent: false, rawPresent: false, sqlLabels: new Set(), rawLabels: new Set()
      };
      group[source] += row.cost;
      group[`${source}Present`] = true;
      group[`${source}Labels`].add([row.division, row.business_unit, row.facility, row.cost_category, row.controllable].filter(Boolean).join(' · '));
      groups.set(key, group);
    }
  }
  return [...groups.values()].map((row) => ({ ...row, delta: row.raw - row.sql }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.month - b.month || a.cost_center.localeCompare(b.cost_center));
}

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

