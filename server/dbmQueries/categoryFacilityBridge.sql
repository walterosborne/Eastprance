/*
Next step after proving that only ~$8.38M of the $74.63M legacy Q1 report has a populated Cost Element.

Conclusion: GL matching cannot define the report. The legacy report was mostly facility/category-level submissions.
This diagnostic therefore compares the complete old Q1 category totals to the upstream validation table's
Cost Summary Categories without requiring a Cost Element.

IMPORTANT FIX:
- Cost centers are reused outside Defense Systems.
- The hierarchy must be filtered to LEV02 = NGRBT BEFORE ROW_NUMBER/deduping.
- Without that filter, many valid C2/SDS/HQ cost centers were being assigned to a non-DS hierarchy row and then
  dropped from #DSQ1. That is why the prior category bridge misleadingly came back almost entirely Weapon Systems.

Run Query 16 first, then the DSQ1 build, 17A, 17, 18, and 19.
*/

SET NOCOUNT ON;

/* ============================================================
   QUERY 16 — Complete legacy Q1 category/address profile
   No GL requirement. Send ALL rows.
   ============================================================ */
SELECT
    LTRIM(RTRIM(CONVERT(nvarchar(4000), [Cost Category]))) AS LEGACY_CATEGORY,
    COUNT(*) AS ROW_COUNT,
    COUNT(DISTINCT NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(4000), [Address]))), '')) AS ADDRESS_COUNT,
    SUM(TRY_CONVERT(decimal(38,2), [Cost])) AS LEGACY_Q1_COST,
    SUM(CASE
        WHEN TRY_CONVERT(decimal(38,6), NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), [Cost Element]))), '')) IS NULL
        THEN TRY_CONVERT(decimal(38,2), [Cost]) ELSE 0 END) AS COST_WITHOUT_ELEMENT,
    SUM(CASE
        WHEN TRY_CONVERT(decimal(38,6), NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), [Cost Element]))), '')) IS NOT NULL
        THEN TRY_CONVERT(decimal(38,2), [Cost]) ELSE 0 END) AS COST_WITH_ELEMENT
FROM ecosystem_source.qmi.controllable_costs
WHERE TRY_CONVERT(int, [Year]) = 2026
  AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(100), [Quarter])))) = 'Q1'
GROUP BY LTRIM(RTRIM(CONVERT(nvarchar(4000), [Cost Category])))
ORDER BY LEGACY_Q1_COST DESC;


/* ============================================================
   Shared DS Q1 population from the upstream validation table.
   CRITICAL: restrict hierarchy rows to Defense Systems BEFORE choosing the
   latest row per cost center. Otherwise reused cost centers can resolve to
   another sector/division and disappear from the DS population.
   ============================================================ */
IF OBJECT_ID('tempdb..#DSQ1') IS NOT NULL DROP TABLE #DSQ1;

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
    UPPER(LTRIM(RTRIM(V.COST_CENTER))) AS COST_CENTER,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Cost Summary Categories])), ''), '(blank)') AS COST_SUMMARY_CATEGORY,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Cost Type])), ''), '(blank)') AS COST_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Facility Type])), ''), '(blank)') AS FACILITY_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[RB Fin Stmt Mapping])), ''), '(blank)') AS RB_FIN_STMT_MAPPING,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[RB Indicator])), ''), '(blank)') AS RB_INDICATOR,
    COALESCE(NULLIF(LTRIM(RTRIM(V.[Account Name])), ''), '(blank)') AS ACCOUNT_NAME,
    TRY_CONVERT(decimal(38,2), V.Dollars) AS DOLLARS
INTO #DSQ1
FROM rpt.rb_Actuals_CP_CC_Summary_Validation V
JOIN CurrentHierarchy H
  ON H.COST_CENTER = UPPER(LTRIM(RTRIM(V.COST_CENTER)))
 AND H.RN = 1
WHERE LTRIM(RTRIM(V.Period)) IN ('202601','202602','202603')
  AND H.DIVISION IN (
      'DS Weapon Systems',
      'DS C2 & Weapons Integration',
      'DS Strategic Deterrent Systems',
      'DS Sector HQ'
  );


/* ============================================================
   QUERY 17A — DS population sanity check after hierarchy fix
   Send ALL rows (should be four divisions).
   ============================================================ */
SELECT
    DIVISION,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    SUM(DOLLARS) AS NET_DOLLARS,
    SUM(ABS(DOLLARS)) AS ABS_DOLLARS
FROM #DSQ1
GROUP BY DIVISION
ORDER BY ABS(SUM(DOLLARS)) DESC;


/* ============================================================
   QUERY 17 — Upstream DS taxonomy by Cost Summary Category
   Send first ~60 rows. After the fix this should include more than WS.
   ============================================================ */
SELECT TOP (250)
    DIVISION,
    BUSINESS_UNIT,
    COST_SUMMARY_CATEGORY,
    COST_TYPE,
    FACILITY_TYPE,
    RB_FIN_STMT_MAPPING,
    RB_INDICATOR,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    SUM(DOLLARS) AS NET_DOLLARS,
    SUM(ABS(DOLLARS)) AS ABS_DOLLARS
FROM #DSQ1
GROUP BY
    DIVISION,
    BUSINESS_UNIT,
    COST_SUMMARY_CATEGORY,
    COST_TYPE,
    FACILITY_TYPE,
    RB_FIN_STMT_MAPPING,
    RB_INDICATOR
ORDER BY ABS(SUM(DOLLARS)) DESC;


/* ============================================================
   QUERY 18 — First-pass category bridge, NO GL filter

   Only maps categories that are semantically strong enough to test now.
   Labor is deliberately NOT mapped yet because generic rostered labor is much
   broader than facility labor. Property Tax + Insurance are combined because
   the upstream table commonly uses one Taxes and Insurance category.

   Result set 1: candidate old-category totals by division.
   Result set 2: total candidate vs old Q1 benchmark.
   Send ALL rows from both result sets.
   ============================================================ */
IF OBJECT_ID('tempdb..#CandidateBridge') IS NOT NULL DROP TABLE #CandidateBridge;

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
    DOLLARS
INTO #CandidateBridge
FROM #DSQ1;

SELECT
    BRIDGE_CATEGORY,
    DIVISION,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    SUM(DOLLARS) AS VALIDATION_Q1_DOLLARS,
    SUM(ABS(DOLLARS)) AS VALIDATION_Q1_ABS_DOLLARS
FROM #CandidateBridge
WHERE BRIDGE_CATEGORY IS NOT NULL
GROUP BY BRIDGE_CATEGORY, DIVISION
ORDER BY BRIDGE_CATEGORY, ABS(SUM(DOLLARS)) DESC;

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
), Validation AS (
    SELECT BRIDGE_CATEGORY, SUM(DOLLARS) AS VALIDATION_Q1_DOLLARS
    FROM #CandidateBridge
    WHERE BRIDGE_CATEGORY IS NOT NULL
    GROUP BY BRIDGE_CATEGORY
)
SELECT
    L.BRIDGE_CATEGORY,
    L.LEGACY_Q1_DOLLARS,
    COALESCE(V.VALIDATION_Q1_DOLLARS, 0) AS VALIDATION_Q1_DOLLARS,
    COALESCE(V.VALIDATION_Q1_DOLLARS, 0) - L.LEGACY_Q1_DOLLARS AS DIFFERENCE,
    CASE WHEN NULLIF(L.LEGACY_Q1_DOLLARS, 0) IS NULL THEN NULL
         ELSE 100.0 * (COALESCE(V.VALIDATION_Q1_DOLLARS, 0) - L.LEGACY_Q1_DOLLARS) / ABS(L.LEGACY_Q1_DOLLARS)
    END AS DIFFERENCE_PCT
FROM Legacy L
LEFT JOIN Validation V ON V.BRIDGE_CATEGORY = L.BRIDGE_CATEGORY
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
   QUERY 19 — Do RB fields identify the facility subset?
   Focus only on facility-like categories, grouped by RB fields and division.
   Send first ~60 rows.
   ============================================================ */
SELECT TOP (250)
    DIVISION,
    COST_SUMMARY_CATEGORY,
    RB_FIN_STMT_MAPPING,
    RB_INDICATOR,
    COST_TYPE,
    FACILITY_TYPE,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    SUM(DOLLARS) AS NET_DOLLARS,
    SUM(ABS(DOLLARS)) AS ABS_DOLLARS
FROM #DSQ1
WHERE
       COST_SUMMARY_CATEGORY = 'Leased Land and Buildings'
    OR COST_SUMMARY_CATEGORY LIKE 'Deprec%'
    OR COST_SUMMARY_CATEGORY LIKE '%LHI%'
    OR COST_SUMMARY_CATEGORY = 'Utilities'
    OR COST_SUMMARY_CATEGORY LIKE 'Facility Repair & Maint%'
    OR COST_SUMMARY_CATEGORY LIKE 'Facility Purchased Serv%'
    OR COST_SUMMARY_CATEGORY = 'Enterprise Facility Services'
    OR COST_SUMMARY_CATEGORY = 'Taxes and Insurance'
    OR COST_SUMMARY_CATEGORY LIKE '%Facility%'
GROUP BY
    DIVISION,
    COST_SUMMARY_CATEGORY,
    RB_FIN_STMT_MAPPING,
    RB_INDICATOR,
    COST_TYPE,
    FACILITY_TYPE
ORDER BY ABS(SUM(DOLLARS)) DESC;
