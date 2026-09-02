export const COST_DIMENSION_COVERAGE_DBM_QUERY = `
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

Roster AS (
    SELECT
        LTRIM(RTRIM(Employee_MyID)) AS MyID,
        NULLIF(LTRIM(RTRIM(Location_Code)), '') AS Location_Code,
        ROW_NUMBER() OVER (
            PARTITION BY LTRIM(RTRIM(Employee_MyID))
            ORDER BY
                last_modified_date DESC,
                created_date DESC,
                id DESC
        ) AS rn
    FROM rpt.rb_load_roster
    WHERE NULLIF(LTRIM(RTRIM(Employee_MyID)), '') IS NOT NULL
),

ArchibusEmployeeCounts AS (
    SELECT
        LTRIM(RTRIM(employee_my_id)) AS MyID,
        NULLIF(
            CONCAT_WS(
                ' | ',
                NULLIF(LTRIM(RTRIM(address_1)), ''),
                NULLIF(LTRIM(RTRIM(city)), ''),
                NULLIF(LTRIM(RTRIM(state)), '')
            ),
            ''
        ) AS Facility,
        COUNT(*) AS Facility_Row_Count
    FROM rpt.rb_archibus
    WHERE NULLIF(LTRIM(RTRIM(employee_my_id)), '') IS NOT NULL
    GROUP BY
        LTRIM(RTRIM(employee_my_id)),
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

ArchibusEmployee AS (
    SELECT
        MyID,
        Facility,
        ROW_NUMBER() OVER (
            PARTITION BY MyID
            ORDER BY Facility_Row_Count DESC, Facility
        ) AS rn
    FROM ArchibusEmployeeCounts
    WHERE Facility IS NOT NULL
),

LocationFacilityCounts AS (
    SELECT
        r.Location_Code,
        a.Facility,
        COUNT(DISTINCT r.MyID) AS Employee_Count
    FROM Roster r
    JOIN ArchibusEmployee a
        ON r.MyID = a.MyID
       AND a.rn = 1
    WHERE
        r.rn = 1
        AND r.Location_Code IS NOT NULL
    GROUP BY
        r.Location_Code,
        a.Facility
),

LocationTotals AS (
    SELECT
        r.Location_Code,
        COUNT(DISTINCT r.MyID) AS Total_Employees
    FROM Roster r
    JOIN ArchibusEmployee a
        ON r.MyID = a.MyID
       AND a.rn = 1
    WHERE
        r.rn = 1
        AND r.Location_Code IS NOT NULL
    GROUP BY r.Location_Code
),

LocationFallback AS (
    SELECT
        c.Location_Code,
        c.Facility,
        CAST(
            c.Employee_Count * 1.0 / NULLIF(t.Total_Employees, 0)
            AS DECIMAL(8,4)
        ) AS Facility_Share,
        ROW_NUMBER() OVER (
            PARTITION BY c.Location_Code
            ORDER BY c.Employee_Count DESC, c.Facility
        ) AS rn
    FROM LocationFacilityCounts c
    JOIN LocationTotals t
        ON c.Location_Code = t.Location_Code
),

CostCenterFacilityCounts AS (
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

CostCenterFacility AS (
    SELECT
        Cost_Center,
        Facility,
        ROW_NUMBER() OVER (
            PARTITION BY Cost_Center
            ORDER BY Employee_Count DESC, Facility
        ) AS rn
    FROM CostCenterFacilityCounts
    WHERE Facility IS NOT NULL
)

SELECT
    TRY_CONVERT(INT, t.GJAHR) AS [year],
    TRY_CONVERT(INT, t.POPER) AS [month],
    COALESCE(h.Division, 'Unmapped') AS division,
    COALESCE(h.Business_Unit, 'Unmapped') AS business_unit,
    LTRIM(RTRIM(t.RCNTR)) AS cost_center,
    ccf.Facility AS current_cost_center_facility,
    ae.Facility AS employee_myid_facility,
    lf.Facility AS roster_location_facility,
    COUNT_BIG(*) AS transaction_row_count,
    SUM(TRY_CONVERT(DECIMAL(18,2), t.KSL)) AS net_cost
FROM src.rb_CVG_Transaction_Details_03 t
JOIN CostCenterHierarchy h
    ON LTRIM(RTRIM(t.RCNTR)) = h.Cost_Center
   AND h.rn = 1
LEFT JOIN CostCenterFacility ccf
    ON LTRIM(RTRIM(t.RCNTR)) = ccf.Cost_Center
   AND ccf.rn = 1
LEFT JOIN ArchibusEmployee ae
    ON LTRIM(RTRIM(t.EMP_MYID)) = ae.MyID
   AND ae.rn = 1
LEFT JOIN Roster r
    ON LTRIM(RTRIM(t.EMP_MYID)) = r.MyID
   AND r.rn = 1
LEFT JOIN LocationFallback lf
    ON r.Location_Code = lf.Location_Code
   AND lf.rn = 1
   AND lf.Facility_Share >= 0.90
WHERE
    TRY_CONVERT(INT, t.GJAHR) >= 2025
    AND TRY_CONVERT(INT, t.POPER) BETWEEN 1 AND 12
    AND t.ACCT_LEVEL02_TEXT = 'NGRB Indirect Non Labor CEG'
    AND TRY_CONVERT(DECIMAL(18,2), t.KSL) IS NOT NULL
GROUP BY
    TRY_CONVERT(INT, t.GJAHR),
    TRY_CONVERT(INT, t.POPER),
    COALESCE(h.Division, 'Unmapped'),
    COALESCE(h.Business_Unit, 'Unmapped'),
    LTRIM(RTRIM(t.RCNTR)),
    ccf.Facility,
    ae.Facility,
    lf.Facility;
`;
