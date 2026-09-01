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
),

FacilityCounts AS (
    SELECT
        LTRIM(RTRIM(employee_cost_center)) AS Cost_Center,
        NULLIF(
            CONCAT_WS(
                ' | ',
                NULLIF(LTRIM(RTRIM(address_1)), ''),
                NULLIF(LTRIM(RTRIM(city)), ''),
                NULLIF(LTRIM(RTRIM(state)), '')
            ),
            ''
        ) AS Facility,
        COUNT(DISTINCT employee_my_id) AS Employee_Count
    FROM rpt.rb_archibus
    WHERE NULLIF(LTRIM(RTRIM(employee_cost_center)), '') IS NOT NULL
    GROUP BY
        LTRIM(RTRIM(employee_cost_center)),
        NULLIF(
            CONCAT_WS(
                ' | ',
                NULLIF(LTRIM(RTRIM(address_1)), ''),
                NULLIF(LTRIM(RTRIM(city)), ''),
                NULLIF(LTRIM(RTRIM(state)), '')
            ),
            ''
        )
),

Facility AS (
    SELECT
        Cost_Center,
        Facility,
        ROW_NUMBER() OVER (
            PARTITION BY Cost_Center
            ORDER BY Employee_Count DESC, Facility
        ) AS rn
    FROM FacilityCounts
    WHERE Facility IS NOT NULL
)

SELECT
    TRY_CONVERT(INT, t.GJAHR) AS [year],
    TRY_CONVERT(INT, t.POPER) AS [month],

    h.Division AS division,
    h.Business_Unit AS business_unit,
    COALESCE(f.Facility, 'Unmapped') AS facility,

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

LEFT JOIN Facility f
    ON LTRIM(RTRIM(t.RCNTR)) = f.Cost_Center
   AND f.rn = 1

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
    COALESCE(f.Facility, 'Unmapped'),
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
