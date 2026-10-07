/*
Focused follow-up after discovering the Actuals CC Summary / SAP Transformation tables.
These are diagnostics only; nothing here changes production data.

Strongest lead:
- rpt.rb_Actuals_CP_CC_Summary_Validation already contains hierarchy, cost center,
  account, Cost Summary Categories, Cost Type, Facility Type, Dollars and Hours.
- rpt.rb_Actuals_CC_Summary_Load_Table is an even simpler summarized output with
  Period, Cost Center, Cost Type, Facility Type, Labor Category, Hours and Dollars.

Run Query 8 first. If Query 9/10 return no Q1 rows, send Query 8 so we can adjust
for the exact Period string format.
*/

/* ============================================================
   QUERY 8 — Period/freshness profile for the likely summary pipeline
   Send all three result sets (or at least the newest ~15 periods from each).
   ============================================================ */
SELECT TOP (36)
    'rpt.rb_Actuals_CP_CC_Summary_Validation' AS SOURCE,
    Period,
    COUNT(*) AS ROW_COUNT,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(18,2), Dollars)) AS DOLLARS,
    MAX(RUN_DT) AS MAX_RUN_DT,
    MAX(last_modified_date) AS MAX_LAST_MODIFIED
FROM rpt.rb_Actuals_CP_CC_Summary_Validation
GROUP BY Period
ORDER BY MAX(RUN_DT) DESC, Period DESC;

SELECT TOP (36)
    'rpt.rb_Actuals_CC_Summary_Load_Table' AS SOURCE,
    period AS Period,
    COUNT(*) AS ROW_COUNT,
    COUNT(DISTINCT Cost_Center) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(18,2), Dollars)) AS DOLLARS,
    MAX(created_date) AS MAX_CREATED,
    MAX(last_modified_date) AS MAX_LAST_MODIFIED
FROM rpt.rb_Actuals_CC_Summary_Load_Table
GROUP BY period
ORDER BY MAX(created_date) DESC, period DESC;

SELECT TOP (36)
    'dbo.rb_Actuals_SAP_CC_Summary_Load_Table' AS SOURCE,
    Period,
    COUNT(*) AS ROW_COUNT,
    COUNT(DISTINCT Cost_Center) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(18,2), KSL)) AS KSL,
    MAX(created_date) AS MAX_CREATED,
    MAX(last_modified_date) AS MAX_LAST_MODIFIED
FROM dbo.rb_Actuals_SAP_CC_Summary_Load_Table
GROUP BY Period
ORDER BY MAX(created_date) DESC, Period DESC;


/* ============================================================
   QUERY 9 — Q1 2026 validation-table facility/cost definition
   This is the most important query. It should show whether the upstream
   validation table already contains the old report's facility population.

   Send the first ~60 rows.
   ============================================================ */
IF OBJECT_ID('tempdb..#VQ1') IS NOT NULL DROP TABLE #VQ1;

WITH Base AS (
    SELECT
        V.*,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            UPPER(LTRIM(RTRIM(V.Period))), '-', ''), '/', ''), '.', ''), ' ', ''), '_', '') AS PERIOD_CLEAN
    FROM rpt.rb_Actuals_CP_CC_Summary_Validation V
),
Parsed AS (
    SELECT
        B.*,
        CASE
            WHEN LEN(PERIOD_CLEAN) = 6
             AND TRY_CONVERT(INT, LEFT(PERIOD_CLEAN, 4)) BETWEEN 2000 AND 2100
                THEN TRY_CONVERT(INT, LEFT(PERIOD_CLEAN, 4))
            WHEN LEN(PERIOD_CLEAN) = 6
             AND TRY_CONVERT(INT, RIGHT(PERIOD_CLEAN, 4)) BETWEEN 2000 AND 2100
                THEN TRY_CONVERT(INT, RIGHT(PERIOD_CLEAN, 4))
            ELSE NULL
        END AS PERIOD_YEAR,
        CASE
            WHEN LEN(PERIOD_CLEAN) = 6
             AND TRY_CONVERT(INT, LEFT(PERIOD_CLEAN, 4)) BETWEEN 2000 AND 2100
                THEN TRY_CONVERT(INT, RIGHT(PERIOD_CLEAN, 2))
            WHEN LEN(PERIOD_CLEAN) = 6
             AND TRY_CONVERT(INT, RIGHT(PERIOD_CLEAN, 4)) BETWEEN 2000 AND 2100
                THEN TRY_CONVERT(INT, LEFT(PERIOD_CLEAN, 2))
            ELSE NULL
        END AS PERIOD_MONTH
    FROM Base B
)
SELECT *
INTO #VQ1
FROM Parsed
WHERE PERIOD_YEAR = 2026
  AND PERIOD_MONTH BETWEEN 1 AND 3
  AND (
      LTRIM(RTRIM(LEV02)) = 'NGRBT'
      OR UPPER(COALESCE(LEV02_DESC, '')) LIKE '%DEFENSE%'
  );

SELECT TOP (200)
    COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS DIVISION,
    COALESCE(NULLIF(LTRIM(RTRIM(LEV04_DESC)), ''), 'Unmapped') AS BUSINESS_UNIT,
    COALESCE(NULLIF(LTRIM(RTRIM([Facility Type])), ''), '(blank)') AS FACILITY_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM([Cost Type])), ''), '(blank)') AS COST_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM([Cost Summary Categories])), ''), '(blank)') AS COST_SUMMARY_CATEGORY,
    COUNT(*) AS ROW_COUNT,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(18,2), Dollars)) AS NET_DOLLARS,
    SUM(ABS(TRY_CONVERT(DECIMAL(18,2), Dollars))) AS ABS_DOLLARS
FROM #VQ1
GROUP BY
    COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped'),
    COALESCE(NULLIF(LTRIM(RTRIM(LEV04_DESC)), ''), 'Unmapped'),
    COALESCE(NULLIF(LTRIM(RTRIM([Facility Type])), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM([Cost Type])), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM([Cost Summary Categories])), ''), '(blank)')
ORDER BY ABS(SUM(TRY_CONVERT(DECIMAL(18,2), Dollars))) DESC;


/* ============================================================
   QUERY 10 — Small Q1 summary: facility type / division / totals
   Send ALL rows. This is the quickest test for whether WS is present
   in the upstream summarized facility population.
   ============================================================ */
SELECT
    COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS DIVISION,
    COALESCE(NULLIF(LTRIM(RTRIM([Facility Type])), ''), '(blank)') AS FACILITY_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM([Cost Type])), ''), '(blank)') AS COST_TYPE,
    COUNT(DISTINCT COST_CENTER) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(18,2), Dollars)) AS NET_DOLLARS,
    SUM(ABS(TRY_CONVERT(DECIMAL(18,2), Dollars))) AS ABS_DOLLARS
FROM #VQ1
GROUP BY
    COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped'),
    COALESCE(NULLIF(LTRIM(RTRIM([Facility Type])), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM([Cost Type])), ''), '(blank)')
ORDER BY
    CASE WHEN COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') = 'DS Weapon Systems' THEN 0 ELSE 1 END,
    COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped'),
    ABS(SUM(TRY_CONVERT(DECIMAL(18,2), Dollars))) DESC;


/* ============================================================
   QUERY 11 — Trace the ETL objects that populate/use these tables
   Send ALL rows. If this is blank, just tell me.
   ============================================================ */
SELECT
    S.name AS SCHEMA_NAME,
    O.name AS OBJECT_NAME,
    O.type_desc AS OBJECT_TYPE
FROM sys.sql_modules M
JOIN sys.objects O ON O.object_id = M.object_id
JOIN sys.schemas S ON S.schema_id = O.schema_id
WHERE M.definition LIKE '%rb_Actuals_CP_CC_Summary_Validation%'
   OR M.definition LIKE '%rb_Actuals_CC_Summary_Load_Table%'
   OR M.definition LIKE '%rb_Actuals_SAP_CC_Summary_Load_Table%'
   OR M.definition LIKE '%rb_Actuals_SAP_Transformation%'
ORDER BY O.type_desc, S.name, O.name;
