// Aggregate the same classified rows that feed the two scorecard cards.
const keyFields = [
  'year', 'month', 'division', 'business_unit',
  'gl_account_cost_element', 'cost_category', 'controllable',
  'cost_center', 'facility', 'cost_element_description'
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
      cost_center: String(row.cost_center ?? '').trim().toUpperCase(),
      facility: String(row.facility ?? ''),
      cost_element_description: String(row.cost_element_description ?? '').trim(),
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
      mappingDiagnostics: rawDataset.mappingDiagnostics ?? null,
      accountRows: accountRows((rawDataset.accountRows ?? []).filter(inRange))
    }
  };
}

// Instrument the existing mapping decisions; do not reimplement their rules.
export function createRawCostTrace() {
  const groups = new Map();
  return {
    record(row, outcome, hierarchy = null, facility = '') {
      const key = JSON.stringify([row.year, row.month, row.gl_account_cost_element, outcome]);
      const cost = Number(row.cost) || 0;
      const description = String(row.cost_element_description ?? '').trim();
      const group = groups.get(key) ?? {
        year: row.year, month: row.month,
        account: row.gl_account_cost_element, outcome,
        rowCount: 0, cost: 0, absoluteCost: 0,
        descriptions: new Set(), samples: []
      };
      group.rowCount += 1;
      group.cost += cost;
      group.absoluteCost += Math.abs(cost);
      if (description) group.descriptions.add(description);
      // Keep bounded evidence, not hundreds of thousands of source rows.
      if (group.samples.length < 5 || Math.abs(cost) > Math.abs(group.samples.at(-1).cost)) {
        group.samples.push({
          cost_center: row.cost_center, description, cost,
          division: hierarchy?.division ?? '',
          business_unit: hierarchy?.businessUnit ?? '', facility
        });
        group.samples.sort((a, b) => Math.abs(b.cost) - Math.abs(a.cost));
        group.samples.length = Math.min(group.samples.length, 5);
      }
      groups.set(key, group);
    },
    finish() {
      return [...groups.values()].map((group) => ({
        ...group,
        cost: Number(group.cost.toFixed(2)),
        absoluteCost: Number(group.absoluteCost.toFixed(2)),
        descriptions: [...group.descriptions].sort()
      }));
    }
  };
}

