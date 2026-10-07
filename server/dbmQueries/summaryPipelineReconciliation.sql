/*
Next reconciliation after Query 8-11.

What we know now:
- rpt.rb_Actuals_CP_CC_Summary_Validation is current through 202609.
- It contains a large, detailed Weapon Systems population with real facility-like
  cost summary categories such as Leased Land and Buildings, Allocations-Facility,
  Utilities, Facility Repair & Maint, Enterprise Facility Services, etc.
- Query 9/10 only returned Weapon Systems because the LEV02 filter used there is
  evidently not a safe all-DS selector inside this validation table.
- The module search was blank, so the population logic may be outside visible
  SQL modules (ETL/SSIS/external load).

These queries answer the next three questions:
1) What hierarchy values does the validation table actually use for all DS data?
2) How does that hierarchy crosswalk to our current rpt.rb_load_cost_center_hierarchy?
3) If we take the exact GLs from the legacy Q1 report, how much do they produce in
   this upstream validation table, especially for Weapon Systems?
*/

/* ============================================================
   QUERY 12 — Validation hierarchy inventory, Q1 2026, NO DS FILTER
   Send the first ~40 rows. This tells us why Query 9/10 selected only WS.
   ============================================================ */
WITH Q1 AS (
    SELECT *
    FROM rpt.rb_Actuals_CP_CC_Summary_Validation
    WHERE LTRIM(RTRIM(Period)) IN ('202601','202602','202603')
)
SELECT TOP (200)
    COALESCE(NULLIF(LTRIM(RTRIM(LEV02)), ''), '(blank)') AS LEV02,
    COALESCE(NULLIF(LTRIM(RTRIM(LEV02_DESC)), ''), '(blank)') AS LEV02_DESC,
    COALESCE(NULLIF(LTRIM(RTRIM(LEV03)), ''), '(blank)') AS LEV03,
    COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), '(blank)') AS LEV03_DESC,
    COALESCE(NULLIF(LTRIM(RTRIM(LEV04_DESC)), ''), '(blank)') AS LEV04_DESC,
    COUNT(DISTINCT UPPER(LTRIM(RTRIM(COST_CENTER)))) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(18,2), Dollars)) AS NET_DOLLARS,
    SUM(ABS(TRY_CONVERT(DECIMAL(18,2), Dollars))) AS ABS_DOLLARS
FROM Q1
GROUP BY
    COALESCE(NULLIF(LTRIM(RTRIM(LEV02)), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(LEV02_DESC)), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(LEV03)), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(LEV04_DESC)), ''), '(blank)')
ORDER BY ABS(SUM(TRY_CONVERT(DECIMAL(18,2), Dollars))) DESC;


/* ============================================================
   QUERY 13 — Validation hierarchy vs current hierarchy, Q1 2026
   Send the first ~40 rows. If WS is being relabeled/moved by the current
   hierarchy, this will show it directly.
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
),
Q1 AS (
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
    SUM(TRY_CONVERT(DECIMAL(18,2), Q.Dollars)) AS NET_DOLLARS,
    SUM(ABS(TRY_CONVERT(DECIMAL(18,2), Q.Dollars))) AS ABS_DOLLARS
FROM Q1 Q
LEFT JOIN CurrentHierarchy H
    ON H.COST_CENTER = UPPER(LTRIM(RTRIM(Q.COST_CENTER)))
   AND H.RN = 1
GROUP BY
    COALESCE(NULLIF(LTRIM(RTRIM(Q.LEV03_DESC)), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(Q.LEV04_DESC)), ''), '(blank)'),
    COALESCE(H.CURRENT_DIVISION, 'No current hierarchy match'),
    COALESCE(H.CURRENT_BU, 'No current hierarchy match')
ORDER BY ABS(SUM(TRY_CONVERT(DECIMAL(18,2), Q.Dollars))) DESC;


/* ============================================================
   QUERY 14 — Exact legacy Q1 GLs inside the validation table
   This is the key benchmark. It does NOT use the old cost-element key as a
   filter; it uses only cost elements that actually occurred in old Q1.

   Result set 1: legacy-category x validation/current division.
   Result set 2: division totals, with WS forced to the top.

   Send the first ~50 rows of result set 1 and ALL of result set 2.
   ============================================================ */
WITH LegacyByElementCategory AS (
    SELECT
        TRY_CONVERT(BIGINT, [Cost Element]) AS COST_ELEMENT,
        LTRIM(RTRIM([Cost Category])) AS LEGACY_CATEGORY,
        SUM(TRY_CONVERT(DECIMAL(18,2), [Cost])) AS LEGACY_COST,
        SUM(ABS(TRY_CONVERT(DECIMAL(18,2), [Cost]))) AS LEGACY_ABS_COST
    FROM controllable_costs
    WHERE TRY_CONVERT(INT, [Year]) = 2026
      AND UPPER(LTRIM(RTRIM([Quarter]))) = 'Q1'
      AND TRY_CONVERT(BIGINT, [Cost Element]) IS NOT NULL
    GROUP BY TRY_CONVERT(BIGINT, [Cost Element]), LTRIM(RTRIM([Cost Category]))
),
RankedLegacyElement AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY COST_ELEMENT
            ORDER BY LEGACY_ABS_COST DESC, LEGACY_CATEGORY
        ) AS RN
    FROM LegacyByElementCategory
),
LegacyElement AS (
    SELECT COST_ELEMENT, LEGACY_CATEGORY, LEGACY_COST
    FROM RankedLegacyElement
    WHERE RN = 1
),
LegacyCategoryTotals AS (
    SELECT LEGACY_CATEGORY, SUM(LEGACY_COST) AS LEGACY_CATEGORY_Q1
    FROM LegacyElement
    GROUP BY LEGACY_CATEGORY
),
CurrentHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS CURRENT_DIVISION,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV04_DESC)), ''), 'Unmapped') AS CURRENT_BU,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
),
ValidationExact AS (
    SELECT
        L.LEGACY_CATEGORY,
        L.COST_ELEMENT,
        COALESCE(NULLIF(LTRIM(RTRIM(V.LEV03_DESC)), ''), '(blank)') AS VALIDATION_DIVISION,
        COALESCE(NULLIF(LTRIM(RTRIM(V.LEV04_DESC)), ''), '(blank)') AS VALIDATION_BU,
        COALESCE(H.CURRENT_DIVISION, 'No current hierarchy match') AS CURRENT_DIVISION,
        COALESCE(H.CURRENT_BU, 'No current hierarchy match') AS CURRENT_BU,
        UPPER(LTRIM(RTRIM(V.COST_CENTER))) AS COST_CENTER,
        TRY_CONVERT(DECIMAL(18,2), V.Dollars) AS DOLLARS
    FROM rpt.rb_Actuals_CP_CC_Summary_Validation V
    JOIN LegacyElement L
      ON TRY_CONVERT(BIGINT, V.ACCT_ID) = L.COST_ELEMENT
    LEFT JOIN CurrentHierarchy H
      ON H.COST_CENTER = UPPER(LTRIM(RTRIM(V.COST_CENTER)))
     AND H.RN = 1
    WHERE LTRIM(RTRIM(V.Period)) IN ('202601','202602','202603')
)
SELECT
    E.LEGACY_CATEGORY,
    T.LEGACY_CATEGORY_Q1,
    E.VALIDATION_DIVISION,
    E.CURRENT_DIVISION,
    COUNT(DISTINCT E.COST_ELEMENT) AS MATCHED_LEGACY_GLS,
    COUNT(DISTINCT E.COST_CENTER) AS COST_CENTER_COUNT,
    SUM(E.DOLLARS) AS VALIDATION_EXACT_GL_DOLLARS,
    SUM(ABS(E.DOLLARS)) AS VALIDATION_EXACT_GL_ABS_DOLLARS
FROM ValidationExact E
JOIN LegacyCategoryTotals T
  ON T.LEGACY_CATEGORY = E.LEGACY_CATEGORY
GROUP BY E.LEGACY_CATEGORY, T.LEGACY_CATEGORY_Q1, E.VALIDATION_DIVISION, E.CURRENT_DIVISION
ORDER BY ABS(SUM(E.DOLLARS)) DESC;

WITH LegacyByElementCategory AS (
    SELECT
        TRY_CONVERT(BIGINT, [Cost Element]) AS COST_ELEMENT,
        LTRIM(RTRIM([Cost Category])) AS LEGACY_CATEGORY,
        SUM(TRY_CONVERT(DECIMAL(18,2), [Cost])) AS LEGACY_COST,
        SUM(ABS(TRY_CONVERT(DECIMAL(18,2), [Cost]))) AS LEGACY_ABS_COST
    FROM controllable_costs
    WHERE TRY_CONVERT(INT, [Year]) = 2026
      AND UPPER(LTRIM(RTRIM([Quarter]))) = 'Q1'
      AND TRY_CONVERT(BIGINT, [Cost Element]) IS NOT NULL
    GROUP BY TRY_CONVERT(BIGINT, [Cost Element]), LTRIM(RTRIM([Cost Category]))
),
LegacyElement AS (
    SELECT COST_ELEMENT, LEGACY_CATEGORY
    FROM (
        SELECT *, ROW_NUMBER() OVER (
            PARTITION BY COST_ELEMENT
            ORDER BY LEGACY_ABS_COST DESC, LEGACY_CATEGORY
        ) AS RN
        FROM LegacyByElementCategory
    ) X
    WHERE RN = 1
),
CurrentHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS CURRENT_DIVISION,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
),
ExactRows AS (
    SELECT
        COALESCE(NULLIF(LTRIM(RTRIM(V.LEV03_DESC)), ''), '(blank)') AS VALIDATION_DIVISION,
        COALESCE(H.CURRENT_DIVISION, 'No current hierarchy match') AS CURRENT_DIVISION,
        TRY_CONVERT(DECIMAL(18,2), V.Dollars) AS DOLLARS
    FROM rpt.rb_Actuals_CP_CC_Summary_Validation V
    JOIN LegacyElement L
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
   QUERY 15 — Clean CC summary load table by current division / type
   This table is current through 09/2026 and already has Facility_Type,
   Cost_Type and Labor_Category. This checks whether its classifications are
   more useful than the validation table's LEV02 selector.

   Send the first ~40 rows.
   ============================================================ */
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
)
SELECT TOP (200)
    COALESCE(H.DIVISION, 'No current hierarchy match') AS DIVISION,
    COALESCE(H.BUSINESS_UNIT, 'No current hierarchy match') AS BUSINESS_UNIT,
    COALESCE(NULLIF(LTRIM(RTRIM(S.Facility_Type)), ''), '(blank)') AS FACILITY_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM(S.Cost_Type)), ''), '(blank)') AS COST_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM(S.Labor_Category)), ''), '(blank)') AS LABOR_CATEGORY,
    COUNT(DISTINCT UPPER(LTRIM(RTRIM(S.Cost_Center)))) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(18,2), S.Dollars)) AS NET_DOLLARS,
    SUM(ABS(TRY_CONVERT(DECIMAL(18,2), S.Dollars))) AS ABS_DOLLARS
FROM rpt.rb_Actuals_CC_Summary_Load_Table S
LEFT JOIN CurrentHierarchy H
  ON H.COST_CENTER = UPPER(LTRIM(RTRIM(S.Cost_Center)))
 AND H.RN = 1
WHERE LTRIM(RTRIM(S.period)) IN ('012026','022026','032026')
GROUP BY
    COALESCE(H.DIVISION, 'No current hierarchy match'),
    COALESCE(H.BUSINESS_UNIT, 'No current hierarchy match'),
    COALESCE(NULLIF(LTRIM(RTRIM(S.Facility_Type)), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(S.Cost_Type)), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(S.Labor_Category)), ''), '(blank)')
ORDER BY
    CASE WHEN COALESCE(H.DIVISION, 'No current hierarchy match') = 'DS Weapon Systems' THEN 0 ELSE 1 END,
    ABS(SUM(TRY_CONVERT(DECIMAL(18,2), S.Dollars))) DESC;
