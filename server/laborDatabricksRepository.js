import {
  DATABRICKS_NEW_TABLE_NAME,
  readDbmDimensionLookups
} from './controllableCostsDatabricksRepository.js';
import { executeDatabricksQuery } from './databricksQuery.js';

const LABOR_HOURS_QUERY = `
WITH labor AS (
  SELECT
    TRY_CAST(GJAHR AS INT) AS year,
    TRY_CAST(POPER AS INT) AS month,
    UPPER(TRIM(RCNTR)) AS cost_center,
    TRY_CAST(NET_MSL AS DECIMAL(24, 4)) AS hours_quantity
  FROM ${DATABRICKS_NEW_TABLE_NAME}
  WHERE UPPER(TRIM(RUNIT)) = 'H'
    AND TRIM(RACCT) LIKE '00041%'
)
SELECT year, month, cost_center, SUM(hours_quantity) AS entered_hours
FROM labor
WHERE month BETWEEN 1 AND 12
  AND year >= 2025
  AND year * 100 + month < YEAR(CURRENT_DATE()) * 100 + MONTH(CURRENT_DATE())
  AND NULLIF(cost_center, '') IS NOT NULL
  AND hours_quantity <> 0
GROUP BY year, month, cost_center
ORDER BY year, month, cost_center
`;

export async function readLaborDatabricksData() {
  const [sourceRows, { hierarchyByCostCenter, facilityByCostCenter }] = await Promise.all([
    executeDatabricksQuery({
      scope: 'labor-databricks',
      tableName: DATABRICKS_NEW_TABLE_NAME,
      query: LABOR_HOURS_QUERY
    }),
    readDbmDimensionLookups()
  ]);

  const rows = [];
  for (const row of sourceRows) {
    const costCenter = row.cost_center;
    const hierarchy = hierarchyByCostCenter.get(costCenter);
    const enteredHours = Number(row.entered_hours);
    if (!hierarchy || row.entered_hours == null || !Number.isFinite(enteredHours)) continue;

    rows.push({
      year: Number(row.year),
      month: Number(row.month),
      cost_center: costCenter,
      division: hierarchy.division || 'Unmapped',
      business_unit: hierarchy.businessUnit || 'Unmapped',
      facility: facilityByCostCenter.get(costCenter)?.facility || 'Unmapped',
      entered_hours: enteredHours
    });
  }

  return {
    source: 'databricks',
    tableName: DATABRICKS_NEW_TABLE_NAME,
    sourceRowCount: sourceRows.length,
    rowCount: rows.length,
    rows
  };
}
