import { executeDatabricksQuery } from './databricksQuery.js';

export const COST_CENTER_KEY_TABLE = 'integrated_operations_dev.analytics.costcenterkey';
export const COST_ELEMENT_KEY_TABLE = 'integrated_operations_dev.analytics.cost_element_key';
export const COST_CATEGORY_KEY_TABLE = 'integrated_operations_dev.analytics.cost_category_key';

export function readCostCenterFacilityRows() {
  return executeDatabricksQuery({
    scope: 'cost-center-key',
    tableName: COST_CENTER_KEY_TABLE,
    query: `
      SELECT
        UPPER(TRIM(CAST(\`Cost Center\` AS STRING))) AS cost_center,
        MAX(NULLIF(TRIM(CAST(\`Address\` AS STRING)), '')) AS facility,
        MAX(NULLIF(TRIM(CAST(\`City\` AS STRING)), '')) AS facility_city,
        MAX(NULLIF(TRIM(CAST(\`State\` AS STRING)), '')) AS facility_state
      FROM \`integrated_operations_dev\`.\`analytics\`.\`costcenterkey\`
      WHERE NULLIF(TRIM(CAST(\`Cost Center\` AS STRING)), '') IS NOT NULL
      GROUP BY UPPER(TRIM(CAST(\`Cost Center\` AS STRING)))
    `
  });
}

function normalizedColumn(row, column, tableName) {
  const matching = Object.keys(row).filter((key) => key.trim().toLowerCase() === column.toLowerCase());
  if (matching.length !== 1) {
    throw new Error(`${tableName} requires exactly one ${column} column; found ${matching.length}.`);
  }
  return String(row[matching[0]] ?? '').trim();
}

export async function readCostClassificationRows() {
  // These small lookup tables may already have been uploaded with a trailing
  // space in a column header. Resolve the headers from the result rather than
  // referencing a misspelled physical column in Databricks SQL.
  const [rawElements, rawCategories] = await Promise.all([
    executeDatabricksQuery({
      scope: 'cost-element-key',
      tableName: COST_ELEMENT_KEY_TABLE,
      query: 'SELECT * FROM \`integrated_operations_dev\`.\`analytics\`.\`cost_element_key\`'
    }),
    executeDatabricksQuery({
      scope: 'cost-category-key',
      tableName: COST_CATEGORY_KEY_TABLE,
      query: 'SELECT * FROM \`integrated_operations_dev\`.\`analytics\`.\`cost_category_key\`'
    })
  ]);
  const elementRows = rawElements.map((row) => ({
    cost_category: normalizedColumn(row, 'Cost Category', COST_ELEMENT_KEY_TABLE),
    cost_element: normalizedColumn(row, 'Cost Element', COST_ELEMENT_KEY_TABLE),
    cost_element_description: normalizedColumn(row, 'Cost Element Description', COST_ELEMENT_KEY_TABLE),
    controllable: normalizedColumn(row, 'Controllable', COST_ELEMENT_KEY_TABLE)
  })).filter((row) => row.cost_element);
  const categoryRows = rawCategories.map((row) => ({
    cost_category: normalizedColumn(row, 'Cost Category', COST_CATEGORY_KEY_TABLE),
    controllable: normalizedColumn(row, 'Controllable', COST_CATEGORY_KEY_TABLE)
  }));
  return { elementRows, categoryRows };
}

