// Working CWI + SDS facility-cost estimate sourced only from SAP transactions.
export const CONTROLLABLE_COSTS_NEW_DBM_QUERY = `
/*
 * Working SAP facility-cost reconstruction (CWI + SDS, not Weapon Systems).
 * Signed KSL; selected facility G/L accounts only. Q1 2026 reference:
 * CWI selected $9,051,453.41; SDS selected $27,309,995.64.
 * Gross timecard labor G/L 4100000 is absent from this SAP extract.
 * Facility/Operations consolidates central SDS postings; do not add
 * the legacy "Other" entry on top of its SAP depreciation/LHI.
 */
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
      AND LTRIM(RTRIM(LEV03_DESC)) IN (
          'DS C2 & Weapons Integration',
          'DS Strategic Deterrent Systems'
      )
),
FacilityKey AS (
    SELECT UPPER(LTRIM(RTRIM([Cost Center]))) AS Cost_Center,
           MAX(NULLIF(LTRIM(RTRIM([Address])), '')) AS Address,
           MAX(NULLIF(LTRIM(RTRIM([City])), '')) AS City,
           MAX(NULLIF(LTRIM(RTRIM([State])), '')) AS State
    FROM [ecosystem_source].[qmi].[costcenterkey]
    WHERE NULLIF(LTRIM(RTRIM([Cost Center])), '') IS NOT NULL
    GROUP BY UPPER(LTRIM(RTRIM([Cost Center])))
),
SAPRows AS (
    SELECT TRY_CONVERT(INT, t.GJAHR) AS [year],
           TRY_CONVERT(INT, t.POPER) AS [month],
           h.Division AS division,
           h.Business_Unit AS business_unit,
           UPPER(LTRIM(RTRIM(t.RCNTR))) AS cost_center,
           CASE WHEN h.Division = 'DS Strategic Deterrent Systems'
                      AND UPPER(LTRIM(RTRIM(t.RCNTR))) IN (
                          'TDA87FC0', 'TDA87FO0', 'TDB84FAC',
                          'TDB84FCO', 'TDA87FL0', 'TDA10H1C'
                      )
                THEN 'Strategic Deterrent Facility/Operations'
                ELSE COALESCE(k.Address,
                    CONCAT('Unmapped (CC ', UPPER(LTRIM(RTRIM(t.RCNTR))), ')'))
           END AS facility,
           CASE WHEN h.Division = 'DS Strategic Deterrent Systems'
                      AND UPPER(LTRIM(RTRIM(t.RCNTR))) IN (
                          'TDA87FC0', 'TDA87FO0', 'TDB84FAC',
                          'TDB84FCO', 'TDA87FL0', 'TDA10H1C'
                      )
                THEN NULL ELSE k.City END AS facility_city,
           CASE WHEN h.Division = 'DS Strategic Deterrent Systems'
                      AND UPPER(LTRIM(RTRIM(t.RCNTR))) IN (
                          'TDA87FC0', 'TDA87FO0', 'TDB84FAC',
                          'TDB84FCO', 'TDA87FL0', 'TDA10H1C'
                      )
                THEN NULL ELSE k.State END AS facility_state,
           TRY_CONVERT(BIGINT, t.RACCT) AS GL,
           NULLIF(LTRIM(RTRIM(t.GL_TXT20)), '') AS cost_element_description,
           TRY_CONVERT(DECIMAL(19,2), t.KSL) AS cost
    FROM [DTO_Business_Management].[src].[rb_CVG_Transaction_Details_03] AS t
    JOIN CostCenterHierarchy AS h
      ON UPPER(LTRIM(RTRIM(t.RCNTR))) = h.Cost_Center AND h.rn = 1
    LEFT JOIN FacilityKey AS k
      ON UPPER(LTRIM(RTRIM(t.RCNTR))) = k.Cost_Center
    WHERE TRY_CONVERT(INT, t.GJAHR) >= 2025
      AND TRY_CONVERT(INT, t.POPER) BETWEEN 1 AND 12
      AND TRY_CONVERT(DECIMAL(19,2), t.KSL) IS NOT NULL
      AND (
          k.Cost_Center IS NOT NULL
          OR (h.Division = 'DS Strategic Deterrent Systems'
              AND UPPER(LTRIM(RTRIM(t.RCNTR))) IN (
                  'TDA87FC0', 'TDA87FO0', 'TDB84FAC',
                  'TDB84FCO', 'TDA87FL0', 'TDA10H1C'
              ))
      )
),
Classified AS (
    SELECT *,
           CASE
             WHEN GL BETWEEN 4100000 AND 4109999 OR GL = 8320037
               THEN '1 Labor'
             WHEN GL IN (4300591, 4300625, 4300887, 4301077)
               THEN '2 Rent - Land & Building'
             WHEN GL IN (4301048, 4301049, 4301050, 4301231)
               THEN '3 Depreciation & LHI'
             WHEN GL = 4300626
               THEN '4 Property Taxes'
             WHEN GL IN (4300852, 4300630, 8320479)
               THEN '5 Insurance'
             WHEN GL IN (4300884, 4300699, 4300702, 4300704,
                         4300705, 4300701, 4300700, 4300671,
                         4300643, 4300305, 4300669, 4300698, 4300680)
               THEN '6 Maintenance & Repairs'
             WHEN GL IN (4300703, 4300805, 4300666, 4300807)
               THEN '7 Services'
             WHEN GL IN (4301102, 4301013, 4301104, 4300628)
               THEN '8 Utilities'
             ELSE NULL
           END AS cost_category
    FROM SAPRows
)
SELECT [year], [month], division, business_unit, facility,
       facility_city, facility_state, cost_center, cost_category,
       CONVERT(VARCHAR(50), GL) AS gl_account_cost_element,
       MAX(cost_element_description) AS cost_element_description,
       SUM(cost) AS cost
FROM Classified
WHERE cost_category IS NOT NULL
GROUP BY [year], [month], division, business_unit, facility,
         facility_city, facility_state, cost_center, cost_category, GL
ORDER BY [year], [month], division, business_unit, facility,
         cost_center, cost_category, gl_account_cost_element;
`;
