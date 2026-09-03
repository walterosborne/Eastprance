/*
STOP/GO GATE ONLY.

Purpose: answer one question before doing any more facility-classification work:
Does dbo.rb_Actuals_SAP_Transformation.RACCT actually overlap the fresh Q1 2026 DS RACCT population?

This deliberately does NOT reference Cost_Category, Cost_Type, Facility_Type, or any other
classification column. Run the whole file and send the single result row.
*/
SET NOCOUNT ON;

WITH CurrentHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
    WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
), TransformationAccounts AS (
    SELECT DISTINCT
        TRY_CONVERT(BIGINT,
            TRY_CONVERT(DECIMAL(38,6),
                NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), RACCT))), '')
            )
        ) AS COST_ELEMENT
    FROM dbo.rb_Actuals_SAP_Transformation
    WHERE TRY_CONVERT(BIGINT,
            TRY_CONVERT(DECIMAL(38,6),
                NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), RACCT))), '')
            )
        ) IS NOT NULL
), FreshQ1 AS (
    SELECT
        TRY_CONVERT(BIGINT,
            TRY_CONVERT(DECIMAL(38,6),
                NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), T.RACCT))), '')
            )
        ) AS COST_ELEMENT,
        TRY_CONVERT(DECIMAL(38,2), T.KSL) AS DOLLARS
    FROM src.rb_CVG_Transaction_Details_03 T
    JOIN CurrentHierarchy H
      ON H.COST_CENTER = UPPER(LTRIM(RTRIM(T.RCNTR)))
     AND H.RN = 1
    WHERE TRY_CONVERT(INT, T.GJAHR) = 2026
      AND TRY_CONVERT(INT, T.POPER) BETWEEN 1 AND 3
      AND TRY_CONVERT(DECIMAL(38,2), T.KSL) IS NOT NULL
), FreshAccounts AS (
    SELECT DISTINCT COST_ELEMENT
    FROM FreshQ1
    WHERE COST_ELEMENT IS NOT NULL
), Overlap AS (
    SELECT F.COST_ELEMENT
    FROM FreshAccounts F
    JOIN TransformationAccounts T
      ON T.COST_ELEMENT = F.COST_ELEMENT
)
SELECT
    (SELECT COUNT(*) FROM TransformationAccounts) AS TRANSFORMATION_ACCOUNT_COUNT,
    (SELECT COUNT(*) FROM FreshAccounts) AS FRESH_Q1_DS_ACCOUNT_COUNT,
    (SELECT COUNT(*) FROM Overlap) AS OVERLAPPING_ACCOUNT_COUNT,
    CAST(
        100.0 * (SELECT COUNT(*) FROM Overlap)
        / NULLIF((SELECT COUNT(*) FROM FreshAccounts), 0)
        AS DECIMAL(10,2)
    ) AS FRESH_ACCOUNT_OVERLAP_PCT,
    SUM(ABS(F.DOLLARS)) AS FRESH_Q1_ABS_DOLLARS,
    SUM(CASE WHEN O.COST_ELEMENT IS NOT NULL THEN ABS(F.DOLLARS) ELSE 0 END) AS OVERLAPPING_ABS_DOLLARS,
    CAST(
        100.0 * SUM(CASE WHEN O.COST_ELEMENT IS NOT NULL THEN ABS(F.DOLLARS) ELSE 0 END)
        / NULLIF(SUM(ABS(F.DOLLARS)), 0)
        AS DECIMAL(10,2)
    ) AS FRESH_ABS_DOLLAR_OVERLAP_PCT
FROM FreshQ1 F
LEFT JOIN Overlap O
  ON O.COST_ELEMENT = F.COST_ELEMENT;
