export const LABOR_UTILIZATION_NEW_DBM_QUERY = `
WITH CostCenterHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS Cost_Center,
        NULLIF(LTRIM(RTRIM(LEV03_DESC)), '') AS Division,
        NULLIF(LTRIM(RTRIM(LEV04_DESC)), '') AS Business_Unit,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY
                last_modified_date DESC,
                created_date DESC,
                id DESC
        ) AS rn
    FROM rpt.rb_load_cost_center_hierarchy
    WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
),

Actuals AS (
    SELECT
        TRY_CONVERT(
            INT,
            RIGHT(LTRIM(RTRIM([Period])), 4)
        ) AS [year],
        TRY_CONVERT(
            INT,
            LEFT(LTRIM(RTRIM([Period])), 2)
        ) AS [month],
        UPPER(LTRIM(RTRIM(Cost_Center))) AS Cost_Center,
        NULLIF(UPPER(LTRIM(RTRIM(MYID))), '') AS MyID,
        CASE
            WHEN LOWER(LTRIM(RTRIM(Labor_Category))) LIKE '%indirect%'
                THEN 'Labor Indirect'
            WHEN LOWER(LTRIM(RTRIM(Labor_Category))) LIKE '%direct%'
                THEN 'Labor Direct'
            ELSE 'Other'
        END AS Labor_Category,
        TRY_CONVERT(DECIMAL(18,2), Hours) AS Entered_Hours
    FROM rpt.rb_Actuals_RM_Load_Table
    WHERE
        NULLIF(LTRIM(RTRIM(Cost_Center)), '') IS NOT NULL
        AND TRY_CONVERT(DECIMAL(18,2), Hours) IS NOT NULL
),

LaborByPerson AS (
    SELECT
        a.[year],
        a.[month],
        COALESCE(h.Division, 'Unmapped') AS Division,
        COALESCE(h.Business_Unit, 'Unmapped') AS Business_Unit,
        a.Cost_Center,
        a.Labor_Category,
        a.MyID,
        SUM(a.Entered_Hours) AS Entered_Hours
    FROM Actuals a
    JOIN CostCenterHierarchy h
        ON a.Cost_Center = h.Cost_Center
       AND h.rn = 1
    WHERE
        a.[year] IS NOT NULL
        AND a.[month] BETWEEN 1 AND 12
    GROUP BY a.[year], a.[month], h.Division, h.Business_Unit,
        a.Cost_Center, a.Labor_Category, a.MyID
)

-- Keep MyID until the app joins the configured Databricks roster.
SELECT
    a.[year] AS year,
    a.[month] AS month,
    a.Division AS division,
    a.Business_Unit AS business_unit,
    a.Cost_Center AS cost_center,
    a.MyID AS my_id,
    a.Labor_Category AS labor_category,
    a.Entered_Hours AS entered_hours
FROM LaborByPerson AS a
ORDER BY
    a.[year], a.[month], a.Division, a.Business_Unit, a.Cost_Center,
    a.Labor_Category, a.MyID;
`;
