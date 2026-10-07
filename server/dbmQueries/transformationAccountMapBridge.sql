/*
Fallback after proving rpt.rb_Actuals_CP_CC_Summary_Validation.ACCT_ID is not usable
as an account key (zero numeric mappings).

Use dbo.rb_Actuals_SAP_Transformation only as a RACCT -> classification dictionary.
Its dollars/date coverage do NOT become authoritative. Fresh dollars still come from
src.rb_CVG_Transaction_Details_03 and current DS org comes from the hierarchy table.

Run the whole file. Send Query A, A2, B, C, and D.
*/
SET NOCOUNT ON;

IF OBJECT_ID('tempdb..#MapCandidates') IS NOT NULL DROP TABLE #MapCandidates;
IF OBJECT_ID('tempdb..#AccountMap') IS NOT NULL DROP TABLE #AccountMap;
IF OBJECT_ID('tempdb..#FreshQ1') IS NOT NULL DROP TABLE #FreshQ1;
IF OBJECT_ID('tempdb..#FreshBridge') IS NOT NULL DROP TABLE #FreshBridge;

/* Build a classification dictionary from the historical SAP transformation table. */
SELECT
    TRY_CONVERT(BIGINT, TRY_CONVERT(DECIMAL(38,6), NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), T.RACCT))), ''))) AS COST_ELEMENT,
    COALESCE(NULLIF(LTRIM(RTRIM(T.Cost_Category)), ''), '(blank)') AS COST_CATEGORY,
    COALESCE(NULLIF(LTRIM(RTRIM(T.Cost_Type)), ''), '(blank)') AS COST_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM(T.Facility_Type)), ''), '(blank)') AS FACILITY_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM(T.GL_TXT20)), ''), '(blank)') AS GL_DESCRIPTION,
    COUNT(*) AS SOURCE_ROW_COUNT,
    SUM(ABS(COALESCE(TRY_CONVERT(DECIMAL(38,2), T.KSL), 0))) AS SOURCE_ABS_DOLLARS
INTO #MapCandidates
FROM dbo.rb_Actuals_SAP_Transformation T
WHERE TRY_CONVERT(BIGINT, TRY_CONVERT(DECIMAL(38,6), NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), T.RACCT))), ''))) IS NOT NULL
GROUP BY
    TRY_CONVERT(BIGINT, TRY_CONVERT(DECIMAL(38,6), NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), T.RACCT))), ''))),
    COALESCE(NULLIF(LTRIM(RTRIM(T.Cost_Category)), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(T.Cost_Type)), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(T.Facility_Type)), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(T.GL_TXT20)), ''), '(blank)');

WITH Ranked AS (
    SELECT
        M.*,
        COUNT(*) OVER (PARTITION BY M.COST_ELEMENT) AS MAPPING_VARIANTS,
        ROW_NUMBER() OVER (
            PARTITION BY M.COST_ELEMENT
            ORDER BY
                CASE WHEN M.COST_CATEGORY = '(blank)' THEN 1 ELSE 0 END,
                M.SOURCE_ROW_COUNT DESC,
                M.SOURCE_ABS_DOLLARS DESC,
                M.COST_CATEGORY,
                M.COST_TYPE
        ) AS RN
    FROM #MapCandidates M
)
SELECT
    COST_ELEMENT,
    COST_CATEGORY,
    COST_TYPE,
    FACILITY_TYPE,
    GL_DESCRIPTION,
    SOURCE_ROW_COUNT,
    SOURCE_ABS_DOLLARS,
    MAPPING_VARIANTS
INTO #AccountMap
FROM Ranked
WHERE RN = 1;

/* QUERY A — dictionary health. Send this one row. */
SELECT
    COUNT(*) AS MAPPED_ACCOUNTS,
    SUM(CASE WHEN MAPPING_VARIANTS = 1 THEN 1 ELSE 0 END) AS STABLE_ACCOUNTS,
    SUM(CASE WHEN MAPPING_VARIANTS > 1 THEN 1 ELSE 0 END) AS AMBIGUOUS_ACCOUNTS,
    SUM(CASE WHEN COST_CATEGORY <> '(blank)' THEN 1 ELSE 0 END) AS ACCOUNTS_WITH_CATEGORY
FROM #AccountMap;

/* QUERY A2 — classification vocabulary. Send first ~30 rows. */
SELECT TOP (60)
    COST_CATEGORY,
    COST_TYPE,
    FACILITY_TYPE,
    COUNT(*) AS ACCOUNT_COUNT,
    SUM(SOURCE_ABS_DOLLARS) AS SOURCE_ABS_DOLLARS
FROM #AccountMap
GROUP BY COST_CATEGORY, COST_TYPE, FACILITY_TYPE
ORDER BY SUM(SOURCE_ABS_DOLLARS) DESC;

/* Fresh Q1 2026 DS dollars using current DS hierarchy. */
WITH CurrentHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS DIVISION,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV04_DESC)), ''), 'Unmapped') AS BUSINESS_UNIT,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
    WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
)
SELECT
    H.DIVISION,
    H.BUSINESS_UNIT,
    UPPER(LTRIM(RTRIM(F.RCNTR))) AS COST_CENTER,
    TRY_CONVERT(BIGINT, TRY_CONVERT(DECIMAL(38,6), NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), F.RACCT))), ''))) AS COST_ELEMENT,
    COALESCE(NULLIF(LTRIM(RTRIM(F.GL_TXT20)), ''), '(blank)') AS FRESH_GL_DESCRIPTION,
    TRY_CONVERT(DECIMAL(38,2), F.KSL) AS DOLLARS,
    M.COST_CATEGORY,
    M.COST_TYPE,
    M.FACILITY_TYPE,
    M.MAPPING_VARIANTS
INTO #FreshQ1
FROM src.rb_CVG_Transaction_Details_03 F
JOIN CurrentHierarchy H
  ON H.COST_CENTER = UPPER(LTRIM(RTRIM(F.RCNTR)))
 AND H.RN = 1
LEFT JOIN #AccountMap M
  ON M.COST_ELEMENT = TRY_CONVERT(BIGINT, TRY_CONVERT(DECIMAL(38,6), NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), F.RACCT))), '')))
WHERE TRY_CONVERT(INT, F.GJAHR) = 2026
  AND TRY_CONVERT(INT, F.POPER) BETWEEN 1 AND 3
  AND TRY_CONVERT(DECIMAL(38,2), F.KSL) IS NOT NULL;

/* QUERY B — fresh mapping coverage by division. Send all four rows. */
SELECT
    DIVISION,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    COUNT(DISTINCT COST_ELEMENT) AS FRESH_ACCOUNT_COUNT,
    COUNT(DISTINCT CASE WHEN COST_CATEGORY IS NOT NULL THEN COST_ELEMENT END) AS MAPPED_ACCOUNT_COUNT,
    SUM(DOLLARS) AS FRESH_NET_DOLLARS,
    SUM(ABS(DOLLARS)) AS FRESH_ABS_DOLLARS,
    SUM(CASE WHEN COST_CATEGORY IS NOT NULL THEN ABS(DOLLARS) ELSE 0 END) AS MAPPED_ABS_DOLLARS,
    CAST(100.0 * SUM(CASE WHEN COST_CATEGORY IS NOT NULL THEN ABS(DOLLARS) ELSE 0 END)
         / NULLIF(SUM(ABS(DOLLARS)), 0) AS DECIMAL(10,2)) AS ABS_DOLLAR_COVERAGE_PCT
FROM #FreshQ1
GROUP BY DIVISION
ORDER BY CASE WHEN DIVISION = 'DS Weapon Systems' THEN 0 ELSE 1 END, ABS(SUM(DOLLARS)) DESC;

/* Normalize transformation categories into legacy facility-report categories. */
SELECT
    CASE
        WHEN COST_CATEGORY IN ('2 Rent - Land & Building','Leased Land and Buildings')
          OR COST_CATEGORY LIKE '%Leased Land%'
            THEN '2 Rent - Land & Building'
        WHEN COST_CATEGORY IN ('3 Depreciation & LHI','Deprec In-Service')
          OR COST_CATEGORY LIKE 'Deprec%'
          OR COST_CATEGORY LIKE '%LHI%'
            THEN '3 Depreciation & LHI'
        WHEN COST_CATEGORY IN ('8 Utilities','Utilities')
            THEN '8 Utilities'
        WHEN COST_CATEGORY IN ('6 Maintenance & Repairs','Facility Repair & Maint')
          OR COST_CATEGORY LIKE 'Facility Repair & Maint%'
            THEN '6 Maintenance & Repairs'
        WHEN COST_CATEGORY IN ('7 Services','Enterprise Facility Services','Facility Purchased Serv','Facility Purchased Services')
          OR COST_CATEGORY LIKE 'Facility Purchased Serv%'
            THEN '7 Services'
        WHEN COST_CATEGORY IN ('4 Property Taxes','5 Insurance','Taxes and Insurance')
            THEN '4+5 Property Taxes & Insurance'
        ELSE NULL
    END AS BRIDGE_CATEGORY,
    DIVISION,
    BUSINESS_UNIT,
    COST_CENTER,
    COST_ELEMENT,
    DOLLARS
INTO #FreshBridge
FROM #FreshQ1;

/* QUERY C — mapped facility categories by division. Send all rows. */
SELECT
    BRIDGE_CATEGORY,
    DIVISION,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    COUNT(DISTINCT COST_ELEMENT) AS COST_ELEMENT_COUNT,
    SUM(DOLLARS) AS FRESH_Q1_DOLLARS,
    SUM(ABS(DOLLARS)) AS FRESH_Q1_ABS_DOLLARS
FROM #FreshBridge
WHERE BRIDGE_CATEGORY IS NOT NULL
GROUP BY BRIDGE_CATEGORY, DIVISION
ORDER BY BRIDGE_CATEGORY, ABS(SUM(DOLLARS)) DESC;

/* QUERY D — old Q1 vs fresh mapped categories. Send all six rows. */
WITH Legacy AS (
    SELECT
        CASE
            WHEN LTRIM(RTRIM(CONVERT(nvarchar(4000), [Cost Category]))) IN ('4 Property Taxes','5 Insurance')
                THEN '4+5 Property Taxes & Insurance'
            ELSE LTRIM(RTRIM(CONVERT(nvarchar(4000), [Cost Category])))
        END AS BRIDGE_CATEGORY,
        SUM(TRY_CONVERT(decimal(38,2), [Cost])) AS LEGACY_Q1_DOLLARS
    FROM ecosystem_source.qmi.controllable_costs
    WHERE TRY_CONVERT(int, [Year]) = 2026
      AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(100), [Quarter])))) = 'Q1'
    GROUP BY CASE
        WHEN LTRIM(RTRIM(CONVERT(nvarchar(4000), [Cost Category]))) IN ('4 Property Taxes','5 Insurance')
            THEN '4+5 Property Taxes & Insurance'
        ELSE LTRIM(RTRIM(CONVERT(nvarchar(4000), [Cost Category])))
    END
), Fresh AS (
    SELECT BRIDGE_CATEGORY, SUM(DOLLARS) AS FRESH_Q1_DOLLARS
    FROM #FreshBridge
    WHERE BRIDGE_CATEGORY IS NOT NULL
    GROUP BY BRIDGE_CATEGORY
)
SELECT
    L.BRIDGE_CATEGORY,
    L.LEGACY_Q1_DOLLARS,
    COALESCE(F.FRESH_Q1_DOLLARS, 0) AS FRESH_Q1_DOLLARS,
    COALESCE(F.FRESH_Q1_DOLLARS, 0) - L.LEGACY_Q1_DOLLARS AS DIFFERENCE,
    CAST(CASE WHEN NULLIF(L.LEGACY_Q1_DOLLARS, 0) IS NULL THEN NULL
         ELSE 100.0 * (COALESCE(F.FRESH_Q1_DOLLARS, 0) - L.LEGACY_Q1_DOLLARS) / ABS(L.LEGACY_Q1_DOLLARS)
    END AS DECIMAL(12,2)) AS DIFFERENCE_PCT
FROM Legacy L
LEFT JOIN Fresh F ON F.BRIDGE_CATEGORY = L.BRIDGE_CATEGORY
WHERE L.BRIDGE_CATEGORY IN (
    '2 Rent - Land & Building',
    '3 Depreciation & LHI',
    '4+5 Property Taxes & Insurance',
    '6 Maintenance & Repairs',
    '7 Services',
    '8 Utilities'
)
ORDER BY ABS(L.LEGACY_Q1_DOLLARS) DESC;
