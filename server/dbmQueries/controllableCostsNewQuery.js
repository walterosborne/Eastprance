// The only cost amount source is SAP. The SQL key restricts the posting cost centers.
export const CONTROLLABLE_COSTS_NEW_DBM_QUERY = `
WITH CostCenterHierarchy AS (
    SELECT UPPER(LTRIM(RTRIM(COST_CENTER))) AS Cost_Center,
           NULLIF(LTRIM(RTRIM(LEV03_DESC)), '') AS Division,
           NULLIF(LTRIM(RTRIM(LEV04_DESC)), '') AS Business_Unit,
           ROW_NUMBER() OVER (
               PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
               ORDER BY last_modified_date DESC, created_date DESC, id DESC
           ) AS rn
    FROM [DTO_Business_Management].[rpt].[rb_load_cost_center_hierarchy]
    WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
)
SELECT TRY_CONVERT(INT, t.GJAHR) AS [year],
       TRY_CONVERT(INT, t.POPER) AS [month],
       h.Division AS division, h.Business_Unit AS business_unit,
       CONCAT('Unmapped (CC ', UPPER(LTRIM(RTRIM(t.RCNTR))), ')') AS facility,
       UPPER(LTRIM(RTRIM(t.RCNTR))) AS cost_center,
       COALESCE(CONVERT(VARCHAR(50), TRY_CONVERT(BIGINT, LTRIM(RTRIM(t.RACCT)))),
                LTRIM(RTRIM(t.RACCT))) AS gl_account_cost_element,
       NULLIF(LTRIM(RTRIM(t.GL_TXT20)), '') AS cost_element_description,
       COALESCE(NULLIF(LTRIM(RTRIM(t.ACCT_LEVEL03_TEXT)), ''), 'Other') AS cost_category,
       SUM(TRY_CONVERT(DECIMAL(19,2), t.KSL)) AS cost
FROM [DTO_Business_Management].[src].[rb_CVG_Transaction_Details_03] AS t
LEFT JOIN CostCenterHierarchy AS h
    ON UPPER(LTRIM(RTRIM(t.RCNTR))) = h.Cost_Center AND h.rn = 1
WHERE TRY_CONVERT(INT, t.GJAHR) >= 2025
  AND TRY_CONVERT(INT, t.POPER) BETWEEN 1 AND 12
  AND TRY_CONVERT(DECIMAL(19,2), t.KSL) IS NOT NULL
  AND EXISTS (
      SELECT 1 FROM [ecosystem_source].[qmi].[costcenterkey] AS k
      WHERE UPPER(LTRIM(RTRIM(k.[Cost Center]))) =
            UPPER(LTRIM(RTRIM(t.RCNTR)))
  )
GROUP BY TRY_CONVERT(INT, t.GJAHR), TRY_CONVERT(INT, t.POPER),
         h.Division, h.Business_Unit, UPPER(LTRIM(RTRIM(t.RCNTR))),
         COALESCE(CONVERT(VARCHAR(50), TRY_CONVERT(BIGINT, LTRIM(RTRIM(t.RACCT)))),
                  LTRIM(RTRIM(t.RACCT))),
         NULLIF(LTRIM(RTRIM(t.GL_TXT20)), ''),
         COALESCE(NULLIF(LTRIM(RTRIM(t.ACCT_LEVEL03_TEXT)), ''), 'Other')
ORDER BY [year], [month], division, business_unit, cost_center,
         cost_category, gl_account_cost_element;
`;
