export const COST_CLASSIFICATION_DBM_QUERY = `
WITH CostCenterHierarchy AS (
    SELECT
        LTRIM(RTRIM(COST_CENTER)) AS Cost_Center,
        ROW_NUMBER() OVER (
            PARTITION BY LTRIM(RTRIM(COST_CENTER))
            ORDER BY
                last_modified_date DESC,
                created_date DESC,
                id DESC
        ) AS rn
    FROM rpt.rb_load_cost_center_hierarchy
    WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
)

SELECT
    COALESCE(
        CONVERT(VARCHAR(50), TRY_CONVERT(BIGINT, LTRIM(RTRIM(t.RACCT)))),
        LTRIM(RTRIM(t.RACCT))
    ) AS cost_element,
    COALESCE(NULLIF(LTRIM(RTRIM(t.GL_TXT20)), ''), '(Blank)') AS cost_element_description,
    COALESCE(NULLIF(LTRIM(RTRIM(t.ACCT_LEVEL03_TEXT)), ''), 'Other') AS level_3_category,
    COALESCE(NULLIF(LTRIM(RTRIM(t.ACCT_LEVEL04_TEXT)), ''), 'Other') AS level_4_category,
    COUNT_BIG(*) AS transaction_row_count,
    SUM(TRY_CONVERT(DECIMAL(18,2), t.KSL)) AS net_cost,
    MIN(
        TRY_CONVERT(INT, t.GJAHR) * 100
        + TRY_CONVERT(INT, t.POPER)
    ) AS first_period,
    MAX(
        TRY_CONVERT(INT, t.GJAHR) * 100
        + TRY_CONVERT(INT, t.POPER)
    ) AS latest_period
FROM src.rb_CVG_Transaction_Details_03 t
JOIN CostCenterHierarchy h
    ON LTRIM(RTRIM(t.RCNTR)) = h.Cost_Center
   AND h.rn = 1
WHERE
    TRY_CONVERT(INT, t.GJAHR) >= 2025
    AND TRY_CONVERT(INT, t.POPER) BETWEEN 1 AND 12
    AND t.ACCT_LEVEL02_TEXT = 'NGRB Indirect Non Labor CEG'
    AND TRY_CONVERT(DECIMAL(18,2), t.KSL) IS NOT NULL
GROUP BY
    COALESCE(
        CONVERT(VARCHAR(50), TRY_CONVERT(BIGINT, LTRIM(RTRIM(t.RACCT)))),
        LTRIM(RTRIM(t.RACCT))
    ),
    COALESCE(NULLIF(LTRIM(RTRIM(t.GL_TXT20)), ''), '(Blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(t.ACCT_LEVEL03_TEXT)), ''), 'Other'),
    COALESCE(NULLIF(LTRIM(RTRIM(t.ACCT_LEVEL04_TEXT)), ''), 'Other');
`;
