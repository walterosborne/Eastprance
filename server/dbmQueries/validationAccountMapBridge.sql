/*
Next step after proving rpt.rb_Actuals_CP_CC_Summary_Validation only intersects the
current Defense Systems hierarchy cleanly for Weapon Systems.

Do NOT use the validation table as the dollar source. Instead, use it only as an
account -> Cost Summary Category / RB mapping dictionary, then apply that dictionary
to the fresh SAP transaction source across the current DS hierarchy.

Run the whole file. Queries are intentionally Q1 2026 only on the fresh side.
*/

SET NOCOUNT ON;

/* ============================================================
   Build account mapping candidates from the validation table.
   We use all 2026 validation rows so an account's dominant mapping is based on
   more than one month, but no organization filter is applied here.
   ============================================================ */
IF OBJECT_ID('tempdb..#AccountMapCandidates') IS NOT NULL DROP TABLE #AccountMapCandidates;
IF OBJECT_ID('tempdb..#AccountMap') IS NOT NULL DROP TABLE #AccountMap;

SELECT
    TRY_CONVERT(BIGINT, V.ACCT_ID) AS COST_ELEMENT,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Cost Summary Categories])), ''), '(blank)') AS COST_SUMMARY_CATEGORY,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Cost Type])), ''), '(blank)') AS COST_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Facility Type])), ''), '(blank)') AS FACILITY_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[RB Fin Stmt Mapping])), ''), '(blank)') AS RB_FIN_STMT_MAPPING,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[RB Indicator])), ''), '(blank)') AS RB_INDICATOR,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Account Name])), ''), '(blank)') AS ACCOUNT_NAME,
    COUNT(*) AS SOURCE_ROW_COUNT,
    SUM(ABS(COALESCE(TRY_CONVERT(DECIMAL(38,2), V.Dollars), 0))) AS SOURCE_ABS_DOLLARS
INTO #AccountMapCandidates
FROM rpt.rb_Actuals_CP_CC_Summary_Validation V
WHERE TRY_CONVERT(BIGINT, V.ACCT_ID) IS NOT NULL
  AND LEFT(LTRIM(RTRIM(V.Period)), 4) = '2026'
GROUP BY
    TRY_CONVERT(BIGINT, V.ACCT_ID),
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Cost Summary Categories])), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Cost Type])), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Facility Type])), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(V.[RB Fin Stmt Mapping])), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(V.[RB Indicator])), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Account Name])), ''), '(blank)');

WITH Ranked AS (
    SELECT
        C.*,
        COUNT(*) OVER (PARTITION BY C.COST_ELEMENT) AS MAPPING_VARIANTS,
        ROW_NUMBER() OVER (
            PARTITION BY C.COST_ELEMENT
            ORDER BY
                C.SOURCE_ROW_COUNT DESC,
                C.SOURCE_ABS_DOLLARS DESC,
                CASE WHEN C.COST_SUMMARY_CATEGORY = '(blank)' THEN 1 ELSE 0 END,
                C.COST_SUMMARY_CATEGORY,
                C.RB_FIN_STMT_MAPPING
        ) AS RN
    FROM #AccountMapCandidates C
)
SELECT
    COST_ELEMENT,
    COST_SUMMARY_CATEGORY,
    COST_TYPE,
    FACILITY_TYPE,
    RB_FIN_STMT_MAPPING,
    RB_INDICATOR,
    ACCOUNT_NAME,
    SOURCE_ROW_COUNT,
    SOURCE_ABS_DOLLARS,
    MAPPING_VARIANTS
INTO #AccountMap
FROM Ranked
WHERE RN = 1;

/* ============================================================
   QUERY 20A — Mapping dictionary health. Send ALL rows (one row).
   ============================================================ */
SELECT
    COUNT(*) AS MAPPED_ACCOUNTS,
    SUM(CASE WHEN MAPPING_VARIANTS = 1 THEN 1 ELSE 0 END) AS STABLE_ACCOUNTS,
    SUM(CASE WHEN MAPPING_VARIANTS > 1 THEN 1 ELSE 0 END) AS AMBIGUOUS_ACCOUNTS,
    SUM(CASE WHEN COST_SUMMARY_CATEGORY <> '(blank)' THEN 1 ELSE 0 END) AS ACCOUNTS_WITH_CATEGORY,
    SUM(CASE WHEN RB_FIN_STMT_MAPPING <> '(blank)' THEN 1 ELSE 0 END) AS ACCOUNTS_WITH_RB_MAPPING
FROM #AccountMap;

/* QUERY 20B — Largest ambiguous account mappings. Send first ~20 rows. */
SELECT TOP (40)
    A.COST_ELEMENT,
    A.ACCOUNT_NAME,
    A.MAPPING_VARIANTS,
    A.COST_SUMMARY_CATEGORY AS CHOSEN_CATEGORY,
    A.COST_TYPE AS CHOSEN_COST_TYPE,
    A.RB_FIN_STMT_MAPPING AS CHOSEN_RB_MAPPING,
    A.RB_INDICATOR AS CHOSEN_RB_INDICATOR,
    A.SOURCE_ROW_COUNT,
    A.SOURCE_ABS_DOLLARS
FROM #AccountMap A
WHERE A.MAPPING_VARIANTS > 1
ORDER BY A.SOURCE_ABS_DOLLARS DESC;


/* ============================================================
   Build fresh Q1 2026 DS transaction population using CURRENT DS hierarchy.
   This is the authoritative dollar side of the test.
   ============================================================ */
IF OBJECT_ID('tempdb..#FreshQ1') IS NOT NULL DROP TABLE #FreshQ1;

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
    UPPER(LTRIM(RTRIM(T.RCNTR))) AS COST_CENTER,
    TRY_CONVERT(BIGINT, T.RACCT) AS COST_ELEMENT,
    COALESCE(NULLIF(LTRIM(RTRIM(T.GL_TXT20)), ''), '(blank)') AS GL_DESCRIPTION,
    TRY_CONVERT(DECIMAL(38,2), T.KSL) AS DOLLARS,
    M.COST_SUMMARY_CATEGORY,
    M.COST_TYPE,
    M.FACILITY_TYPE,
    M.RB_FIN_STMT_MAPPING,
    M.RB_INDICATOR,
    M.MAPPING_VARIANTS
INTO #FreshQ1
FROM src.rb_CVG_Transaction_Details_03 T
JOIN CurrentHierarchy H
  ON H.COST_CENTER = UPPER(LTRIM(RTRIM(T.RCNTR)))
 AND H.RN = 1
LEFT JOIN #AccountMap M
  ON M.COST_ELEMENT = TRY_CONVERT(BIGINT, T.RACCT)
WHERE TRY_CONVERT(INT, T.GJAHR) = 2026
  AND TRY_CONVERT(INT, T.POPER) BETWEEN 1 AND 3
  AND TRY_CONVERT(DECIMAL(38,2), T.KSL) IS NOT NULL;

/* ============================================================
   QUERY 21 — Fresh mapping coverage by division.
   Send ALL rows (should be four divisions).
   ============================================================ */
SELECT
    DIVISION,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    COUNT(DISTINCT COST_ELEMENT) AS FRESH_ACCOUNT_COUNT,
    COUNT(DISTINCT CASE WHEN COST_SUMMARY_CATEGORY IS NOT NULL THEN COST_ELEMENT END) AS MAPPED_ACCOUNT_COUNT,
    SUM(DOLLARS) AS FRESH_NET_DOLLARS,
    SUM(ABS(DOLLARS)) AS FRESH_ABS_DOLLARS,
    SUM(CASE WHEN COST_SUMMARY_CATEGORY IS NOT NULL THEN DOLLARS ELSE 0 END) AS MAPPED_NET_DOLLARS,
    SUM(CASE WHEN COST_SUMMARY_CATEGORY IS NOT NULL THEN ABS(DOLLARS) ELSE 0 END) AS MAPPED_ABS_DOLLARS,
    CAST(100.0 * SUM(CASE WHEN COST_SUMMARY_CATEGORY IS NOT NULL THEN ABS(DOLLARS) ELSE 0 END)
         / NULLIF(SUM(ABS(DOLLARS)), 0) AS DECIMAL(10,2)) AS ABS_DOLLAR_COVERAGE_PCT
FROM #FreshQ1
GROUP BY DIVISION
ORDER BY
    CASE WHEN DIVISION = 'DS Weapon Systems' THEN 0 ELSE 1 END,
    ABS(SUM(DOLLARS)) DESC;


/* ============================================================
   QUERY 22A — Apply validation-derived categories to fresh DS dollars.
   This is the key test. Send ALL rows.
   ============================================================ */
IF OBJECT_ID('tempdb..#FreshBridge') IS NOT NULL DROP TABLE #FreshBridge;

SELECT
    CASE
        WHEN COST_SUMMARY_CATEGORY = 'Leased Land and Buildings'
            THEN '2 Rent - Land & Building'
        WHEN COST_SUMMARY_CATEGORY LIKE 'Deprec%'
          OR COST_SUMMARY_CATEGORY LIKE '%LHI%'
            THEN '3 Depreciation & LHI'
        WHEN COST_SUMMARY_CATEGORY = 'Utilities'
            THEN '8 Utilities'
        WHEN COST_SUMMARY_CATEGORY LIKE 'Facility Repair & Maint%'
            THEN '6 Maintenance & Repairs'
        WHEN COST_SUMMARY_CATEGORY IN ('Enterprise Facility Services','Facility Purchased Serv','Facility Purchased Services')
          OR COST_SUMMARY_CATEGORY LIKE 'Facility Purchased Serv%'
            THEN '7 Services'
        WHEN COST_SUMMARY_CATEGORY = 'Taxes and Insurance'
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

/* ============================================================
   QUERY 22B — Old Q1 total vs fresh mapped-category total.
   Send ALL rows (six rows).
   ============================================================ */
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
         ELSE 100.0 * (COALESCE(F.FRESH_Q1_DOLLARS, 0) - L.LEGACY_Q1_DOLLARS)
              / ABS(L.LEGACY_Q1_DOLLARS)
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

/* ============================================================
   QUERY 23 — Which fresh facility-like categories are still unmapped/ambiguous?
   Send first ~30 rows only if Query 22 is materially off.
   ============================================================ */
SELECT TOP (60)
    DIVISION,
    COST_ELEMENT,
    GL_DESCRIPTION,
    COST_SUMMARY_CATEGORY,
    RB_FIN_STMT_MAPPING,
    RB_INDICATOR,
    MAPPING_VARIANTS,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    SUM(DOLLARS) AS NET_DOLLARS,
    SUM(ABS(DOLLARS)) AS ABS_DOLLARS
FROM #FreshQ1
WHERE
       COST_SUMMARY_CATEGORY LIKE '%Fac%'
    OR COST_SUMMARY_CATEGORY LIKE '%Utilit%'
    OR COST_SUMMARY_CATEGORY LIKE '%Deprec%'
    OR COST_SUMMARY_CATEGORY LIKE '%Lease%'
    OR COST_SUMMARY_CATEGORY LIKE '%Tax%'
    OR RB_FIN_STMT_MAPPING LIKE '%FAC%'
    OR RB_FIN_STMT_MAPPING LIKE '%UTILIT%'
    OR RB_FIN_STMT_MAPPING LIKE '%DEPREC%'
    OR RB_FIN_STMT_MAPPING LIKE '%LEASE%'
GROUP BY
    DIVISION,
    COST_ELEMENT,
    GL_DESCRIPTION,
    COST_SUMMARY_CATEGORY,
    RB_FIN_STMT_MAPPING,
    RB_INDICATOR,
    MAPPING_VARIANTS
ORDER BY ABS(SUM(DOLLARS)) DESC;
