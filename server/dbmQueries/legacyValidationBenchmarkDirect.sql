/*
Direct legacy-vs-validation benchmark.

We now know the legacy upload is:
    ecosystem_source.qmi.controllable_costs

This avoids dynamic source discovery entirely and benchmarks the exact Q1 2026
legacy GL population against rpt.rb_Actuals_CP_CC_Summary_Validation.
*/

SET NOCOUNT ON;

IF OBJECT_ID('tempdb..#LegacyElement') IS NOT NULL DROP TABLE #LegacyElement;

/* ============================================================
   RESULT 1 — legacy Q1 sanity check
   Send all rows (one row).
   ============================================================ */
SELECT
    COUNT(*) AS LEGACY_Q1_ROWS,
    COUNT([Cost Element]) AS LEGACY_Q1_ROWS_WITH_ELEMENT,
    COUNT(DISTINCT TRY_CONVERT(BIGINT, [Cost Element])) AS LEGACY_DISTINCT_ELEMENTS,
    SUM(TRY_CONVERT(DECIMAL(38,2), [Cost])) AS LEGACY_Q1_COST,
    SUM(CASE WHEN TRY_CONVERT(BIGINT, [Cost Element]) IS NOT NULL
             THEN TRY_CONVERT(DECIMAL(38,2), [Cost]) ELSE 0 END) AS LEGACY_Q1_COST_WITH_ELEMENT
FROM ecosystem_source.qmi.controllable_costs
WHERE TRY_CONVERT(INT, [Year]) = 2026
  AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(100), [Quarter])))) = 'Q1';

/* One dominant legacy category per GL. */
WITH LegacyByElementCategory AS (
    SELECT
        TRY_CONVERT(BIGINT, [Cost Element]) AS COST_ELEMENT,
        LTRIM(RTRIM(CONVERT(nvarchar(4000), [Cost Category]))) AS LEGACY_CATEGORY,
        SUM(TRY_CONVERT(DECIMAL(38,2), [Cost])) AS LEGACY_COST,
        SUM(ABS(TRY_CONVERT(DECIMAL(38,2), [Cost]))) AS LEGACY_ABS_COST
    FROM ecosystem_source.qmi.controllable_costs
    WHERE TRY_CONVERT(INT, [Year]) = 2026
      AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(100), [Quarter])))) = 'Q1'
      AND TRY_CONVERT(BIGINT, [Cost Element]) IS NOT NULL
    GROUP BY
        TRY_CONVERT(BIGINT, [Cost Element]),
        LTRIM(RTRIM(CONVERT(nvarchar(4000), [Cost Category])))
), Ranked AS (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY COST_ELEMENT
            ORDER BY LEGACY_ABS_COST DESC, LEGACY_CATEGORY
        ) AS RN
    FROM LegacyByElementCategory
)
SELECT COST_ELEMENT, LEGACY_CATEGORY, LEGACY_COST
INTO #LegacyElement
FROM Ranked
WHERE RN = 1;

/* ============================================================
   RESULT 2 — legacy GL/category sanity
   Send all rows. Should be roughly ~49 elements.
   ============================================================ */
SELECT
    LEGACY_CATEGORY,
    COUNT(*) AS LEGACY_ELEMENTS,
    SUM(LEGACY_COST) AS LEGACY_Q1_COST
FROM #LegacyElement
GROUP BY LEGACY_CATEGORY
ORDER BY ABS(SUM(LEGACY_COST)) DESC;

/* ============================================================
   RESULT 3 — exact old GLs in validation table by category/division
   Send first ~50 rows.
   ============================================================ */
WITH CurrentHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS CURRENT_DIVISION,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV04_DESC)), ''), 'Unmapped') AS CURRENT_BU,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
), ValidationExact AS (
    SELECT
        L.LEGACY_CATEGORY,
        L.COST_ELEMENT,
        COALESCE(NULLIF(LTRIM(RTRIM(V.LEV03_DESC)), ''), '(blank)') AS VALIDATION_DIVISION,
        COALESCE(NULLIF(LTRIM(RTRIM(V.LEV04_DESC)), ''), '(blank)') AS VALIDATION_BU,
        COALESCE(H.CURRENT_DIVISION, 'No current hierarchy match') AS CURRENT_DIVISION,
        COALESCE(H.CURRENT_BU, 'No current hierarchy match') AS CURRENT_BU,
        UPPER(LTRIM(RTRIM(V.COST_CENTER))) AS COST_CENTER,
        TRY_CONVERT(DECIMAL(38,2), V.Dollars) AS DOLLARS
    FROM rpt.rb_Actuals_CP_CC_Summary_Validation V
    JOIN #LegacyElement L
      ON TRY_CONVERT(BIGINT, V.ACCT_ID) = L.COST_ELEMENT
    LEFT JOIN CurrentHierarchy H
      ON H.COST_CENTER = UPPER(LTRIM(RTRIM(V.COST_CENTER)))
     AND H.RN = 1
    WHERE LTRIM(RTRIM(V.Period)) IN ('202601','202602','202603')
)
SELECT TOP (200)
    LEGACY_CATEGORY,
    VALIDATION_DIVISION,
    CURRENT_DIVISION,
    COUNT(DISTINCT COST_ELEMENT) AS MATCHED_LEGACY_GLS,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    SUM(DOLLARS) AS VALIDATION_EXACT_GL_DOLLARS,
    SUM(ABS(DOLLARS)) AS VALIDATION_EXACT_GL_ABS_DOLLARS
FROM ValidationExact
GROUP BY LEGACY_CATEGORY, VALIDATION_DIVISION, CURRENT_DIVISION
ORDER BY ABS(SUM(DOLLARS)) DESC;

/* ============================================================
   RESULT 4 — division totals for exact old GLs
   Send ALL rows. WS is forced to the top.
   ============================================================ */
WITH CurrentHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS CURRENT_DIVISION,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
), ExactRows AS (
    SELECT
        COALESCE(NULLIF(LTRIM(RTRIM(V.LEV03_DESC)), ''), '(blank)') AS VALIDATION_DIVISION,
        COALESCE(H.CURRENT_DIVISION, 'No current hierarchy match') AS CURRENT_DIVISION,
        TRY_CONVERT(DECIMAL(38,2), V.Dollars) AS DOLLARS
    FROM rpt.rb_Actuals_CP_CC_Summary_Validation V
    JOIN #LegacyElement L
      ON TRY_CONVERT(BIGINT, V.ACCT_ID) = L.COST_ELEMENT
    LEFT JOIN CurrentHierarchy H
      ON H.COST_CENTER = UPPER(LTRIM(RTRIM(V.COST_CENTER)))
     AND H.RN = 1
    WHERE LTRIM(RTRIM(V.Period)) IN ('202601','202602','202603')
)
SELECT
    VALIDATION_DIVISION,
    CURRENT_DIVISION,
    SUM(DOLLARS) AS EXACT_LEGACY_GL_DOLLARS,
    SUM(ABS(DOLLARS)) AS EXACT_LEGACY_GL_ABS_DOLLARS
FROM ExactRows
GROUP BY VALIDATION_DIVISION, CURRENT_DIVISION
ORDER BY
    CASE WHEN VALIDATION_DIVISION = 'DS Weapon Systems' OR CURRENT_DIVISION = 'DS Weapon Systems' THEN 0 ELSE 1 END,
    ABS(SUM(DOLLARS)) DESC;

/* ============================================================
   RESULT 5 — validation hierarchy vs current hierarchy, Q1 2026
   Send first ~40 rows. This is the direct hierarchy mismatch check.
   ============================================================ */
WITH CurrentHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS CURRENT_DIVISION,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV04_DESC)), ''), 'Unmapped') AS CURRENT_BU,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
), Q1 AS (
    SELECT *
    FROM rpt.rb_Actuals_CP_CC_Summary_Validation
    WHERE LTRIM(RTRIM(Period)) IN ('202601','202602','202603')
)
SELECT TOP (200)
    COALESCE(NULLIF(LTRIM(RTRIM(Q.LEV03_DESC)), ''), '(blank)') AS VALIDATION_DIVISION,
    COALESCE(NULLIF(LTRIM(RTRIM(Q.LEV04_DESC)), ''), '(blank)') AS VALIDATION_BU,
    COALESCE(H.CURRENT_DIVISION, 'No current hierarchy match') AS CURRENT_DIVISION,
    COALESCE(H.CURRENT_BU, 'No current hierarchy match') AS CURRENT_BU,
    COUNT(DISTINCT UPPER(LTRIM(RTRIM(Q.COST_CENTER)))) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(38,2), Q.Dollars)) AS NET_DOLLARS,
    SUM(ABS(TRY_CONVERT(DECIMAL(38,2), Q.Dollars))) AS ABS_DOLLARS
FROM Q1 Q
LEFT JOIN CurrentHierarchy H
  ON H.COST_CENTER = UPPER(LTRIM(RTRIM(Q.COST_CENTER)))
 AND H.RN = 1
GROUP BY
    COALESCE(NULLIF(LTRIM(RTRIM(Q.LEV03_DESC)), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(Q.LEV04_DESC)), ''), '(blank)'),
    COALESCE(H.CURRENT_DIVISION, 'No current hierarchy match'),
    COALESCE(H.CURRENT_BU, 'No current hierarchy match')
ORDER BY ABS(SUM(TRY_CONVERT(DECIMAL(38,2), Q.Dollars))) DESC;
