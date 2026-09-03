export const CONTROLLABLE_COSTS_NEW_DBM_QUERY = `
WITH CostCenterHierarchy AS (
    SELECT
        LTRIM(RTRIM(COST_CENTER)) AS Cost_Center,
        NULLIF(LTRIM(RTRIM(LEV03_DESC)), '') AS Division,
        NULLIF(LTRIM(RTRIM(LEV04_DESC)), '') AS Business_Unit,
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
    TRY_CONVERT(INT, t.GJAHR) AS [year],
    TRY_CONVERT(INT, t.POPER) AS [month],

    h.Division AS division,
    h.Business_Unit AS business_unit,
    CONCAT('Unmapped (CC ', LTRIM(RTRIM(t.RCNTR)), ')') AS facility,

    LTRIM(RTRIM(t.RCNTR)) AS cost_center,

    COALESCE(
        CONVERT(VARCHAR(50), TRY_CONVERT(BIGINT, LTRIM(RTRIM(t.RACCT)))),
        LTRIM(RTRIM(t.RACCT))
    ) AS gl_account_cost_element,

    NULLIF(LTRIM(RTRIM(t.GL_TXT20)), '') AS cost_element_description,

    COALESCE(
        NULLIF(LTRIM(RTRIM(t.ACCT_LEVEL03_TEXT)), ''),
        'Other'
    ) AS cost_category,

    SUM(TRY_CONVERT(DECIMAL(18,2), t.KSL)) AS cost

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
    TRY_CONVERT(INT, t.GJAHR),
    TRY_CONVERT(INT, t.POPER),
    h.Division,
    h.Business_Unit,
    LTRIM(RTRIM(t.RCNTR)),
    COALESCE(
        CONVERT(VARCHAR(50), TRY_CONVERT(BIGINT, LTRIM(RTRIM(t.RACCT)))),
        LTRIM(RTRIM(t.RACCT))
    ),
    NULLIF(LTRIM(RTRIM(t.GL_TXT20)), ''),
    COALESCE(
        NULLIF(LTRIM(RTRIM(t.ACCT_LEVEL03_TEXT)), ''),
        'Other'
    )

ORDER BY
    [year],
    [month],
    division,
    business_unit,
    facility,
    cost_category,
    gl_account_cost_element;
`;
