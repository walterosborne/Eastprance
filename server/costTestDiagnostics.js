// Aggregate the same classified rows that feed the two scorecard cards.
const keyFields = [
  'year', 'month', 'division', 'business_unit',
  'gl_account_cost_element', 'cost_category', 'controllable'
];

function accountRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const account = String(row.gl_account_cost_element ?? '').trim().replace(/^0+(?=\d)/, '');
    const year = Number(row.year);
    const month = Number(row.month);
    const cost = Number(row.cost);
    if (!account || !Number.isInteger(year) || !Number.isInteger(month)
      || month < 1 || month > 12 || !Number.isFinite(cost)) continue;
    const item = {
      year, month, division: String(row.division ?? ''),
      business_unit: String(row.business_unit ?? ''),
      gl_account_cost_element: account,
      cost_category: String(row.cost_category ?? ''),
      controllable: String(row.controllable ?? 'Unclassified'),
      cost
    };
    const key = keyFields.map((field) => item[field]).join('\u001f');
    const existing = groups.get(key);
    if (existing) existing.cost += cost;
    else groups.set(key, item);
  }
  return [...groups.values()].map((row) => ({ ...row, cost: Number(row.cost.toFixed(2)) }));
}

export function buildCostTestDiagnostics(sqlDataset, rawDataset) {
  const today = new Date();
  const cutoff = Date.UTC(today.getFullYear(), today.getMonth() - 1, 1);
  const inRange = (row) => {
    const stamp = Date.UTC(Number(row.year), Number(row.month) - 1, 1);
    return Number(row.year) >= 2025 && Number.isFinite(stamp) && stamp <= cutoff;
  };
  return {
    asOf: today.toISOString(),
    through: new Date(cutoff).toISOString().slice(0, 7),
    sql: {
      source: sqlDataset.source,
      tableName: sqlDataset.tableName,
      rowCount: sqlDataset.rowCount,
      accountRows: accountRows((sqlDataset.rows ?? []).filter(inRange))
    },
    raw: {
      source: rawDataset.source,
      tableName: rawDataset.tableName,
      sourceRowCount: rawDataset.sourceRowCount,
      hierarchyUnmatchedRowCount: rawDataset.hierarchyUnmatchedRowCount,
      excludedBySqlScopeRowCount: rawDataset.excludedBySqlScopeRowCount,
      rowCount: rawDataset.rowCount,
      sourceCoverage: (rawDataset.rawSourceCoverage ?? []).filter(inRange),
      mappedCoverage: (rawDataset.rawMappedCoverage ?? []).filter(inRange),
      accountRows: accountRows((rawDataset.accountRows ?? []).filter(inRange))
    }
  };
}
