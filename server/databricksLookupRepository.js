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

export async function readCostClassificationRows() {
  const [elementRows, categoryRows] = await Promise.all([
    executeDatabricksQuery({
      scope: 'cost-element-key',
      tableName: COST_ELEMENT_KEY_TABLE,
      query: `
        SELECT
          TRIM(COALESCE(CAST(\`Cost Category\` AS STRING), '')) AS cost_category,
          TRIM(COALESCE(CAST(\`Cost Element\` AS STRING), '')) AS cost_element,
          TRIM(COALESCE(CAST(\`Cost Element Description\` AS STRING), '')) AS cost_element_description,
          TRIM(COALESCE(CAST(\`Controllable\` AS STRING), '')) AS controllable
        FROM \`integrated_operations_dev\`.\`analytics\`.\`cost_element_key\`
        WHERE NULLIF(TRIM(CAST(\`Cost Element\` AS STRING)), '') IS NOT NULL
      `
    }),
    executeDatabricksQuery({
      scope: 'cost-category-key',
      tableName: COST_CATEGORY_KEY_TABLE,
      query: `
        SELECT
          TRIM(COALESCE(CAST(\`Cost Category\` AS STRING), '')) AS cost_category,
          TRIM(COALESCE(CAST(\`Controllable\` AS STRING), '')) AS controllable
        FROM \`integrated_operations_dev\`.\`analytics\`.\`cost_category_key\`
      `
    })
  ]);
  return { elementRows, categoryRows };
}
