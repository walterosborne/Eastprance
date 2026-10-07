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
),

SapCostCenterMaster AS (
    SELECT
        Cost_Center,
        Plant,
        City,
        District
    FROM (
        SELECT
            UPPER(LTRIM(RTRIM(KOSTL))) AS Cost_Center,
            NULLIF(LTRIM(RTRIM(WERKS)), '') AS Plant,
            NULLIF(LTRIM(RTRIM(ORT01)), '') AS City,
            NULLIF(LTRIM(RTRIM(ORT02)), '') AS District,
            ROW_NUMBER() OVER (
                PARTITION BY UPPER(LTRIM(RTRIM(KOSTL)))
                ORDER BY
                    CASE WHEN NULLIF(LTRIM(RTRIM(WERKS)), '') IS NULL THEN 1 ELSE 0 END,
                    CASE WHEN NULLIF(LTRIM(RTRIM(ORT01)), '') IS NULL THEN 1 ELSE 0 END,
                    LTRIM(RTRIM(WERKS)),
                    LTRIM(RTRIM(ORT01)),
                    LTRIM(RTRIM(ORT02))
            ) AS rn
        FROM src.cv_md_cost_ctr
        WHERE NULLIF(LTRIM(RTRIM(KOSTL)), '') IS NOT NULL
    ) master
    WHERE rn = 1
),

SapKostlKeys AS (
    SELECT DISTINCT UPPER(LTRIM(RTRIM(KOSTL))) AS Candidate_Key
    FROM src.cv_md_cost_ctr
    WHERE NULLIF(LTRIM(RTRIM(KOSTL)), '') IS NOT NULL
),

SapPrctrKeys AS (
    SELECT DISTINCT UPPER(LTRIM(RTRIM(PRCTR))) AS Candidate_Key
    FROM src.cv_md_cost_ctr
    WHERE NULLIF(LTRIM(RTRIM(PRCTR)), '') IS NOT NULL
),

SapOrgCodeKeys AS (
    SELECT DISTINCT UPPER(LTRIM(RTRIM(ZZORGCODE))) AS Candidate_Key
    FROM src.cv_md_cost_ctr
    WHERE NULLIF(LTRIM(RTRIM(ZZORGCODE)), '') IS NOT NULL
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
    scm.Plant AS sap_plant,
    scm.City AS sap_city,
    scm.District AS sap_district,
    CASE WHEN sk.Candidate_Key IS NULL THEN 0 ELSE 1 END AS sap_kostl_match,
    CASE WHEN sp.Candidate_Key IS NULL THEN 0 ELSE 1 END AS sap_prctr_match,
    CASE WHEN so.Candidate_Key IS NULL THEN 0 ELSE 1 END AS sap_orgcode_match,
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
LEFT JOIN SapCostCenterMaster scm
    ON UPPER(LTRIM(RTRIM(t.RCNTR))) = scm.Cost_Center
LEFT JOIN SapKostlKeys sk
    ON UPPER(LTRIM(RTRIM(t.RCNTR))) = sk.Candidate_Key
LEFT JOIN SapPrctrKeys sp
    ON UPPER(LTRIM(RTRIM(t.RCNTR))) = sp.Candidate_Key
LEFT JOIN SapOrgCodeKeys so
    ON UPPER(LTRIM(RTRIM(t.RCNTR))) = so.Candidate_Key
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
    lf.Facility,
    scm.Plant,
    scm.City,
    scm.District,
    CASE WHEN sk.Candidate_Key IS NULL THEN 0 ELSE 1 END,
    CASE WHEN sp.Candidate_Key IS NULL THEN 0 ELSE 1 END,
    CASE WHEN so.Candidate_Key IS NULL THEN 0 ELSE 1 END;
`;
