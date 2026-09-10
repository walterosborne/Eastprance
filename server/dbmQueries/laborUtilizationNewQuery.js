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

EnrichedActuals AS (
    SELECT
        a.[year],
        a.[month],
        COALESCE(h.Division, 'Unmapped') AS Division,
        COALESCE(h.Business_Unit, 'Unmapped') AS Business_Unit,
        a.Cost_Center,
        a.Labor_Category,
        a.Entered_Hours
    FROM Actuals a
    JOIN CostCenterHierarchy h
        ON a.Cost_Center = h.Cost_Center
       AND h.rn = 1
    WHERE
        a.[year] IS NOT NULL
        AND a.[month] BETWEEN 1 AND 12
)

SELECT
    [year] AS year,
    [month] AS month,
    Division AS division,
    Business_Unit AS business_unit,
    Cost_Center AS cost_center,
    Labor_Category AS labor_category,
    SUM(Entered_Hours) AS entered_hours
FROM EnrichedActuals
GROUP BY
    [year],
    [month],
    Division,
    Business_Unit,
    Cost_Center,
    Labor_Category
ORDER BY
    [year],
    [month],
    Division,
    Business_Unit,
    Cost_Center,
    Labor_Category;
`;
