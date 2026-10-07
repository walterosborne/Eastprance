/*
Manual fallback / follow-up queries for the controllable-cost facility investigation.
These do not change production data.
*/

/* ============================================================
   1) Weapon Systems Q1 2026 account population
   Purpose: prove where WS dollars actually live across the SAP
   account hierarchy instead of assuming Non-Labor CEG is complete.
   ============================================================ */
WITH CostCenterHierarchy AS (
    SELECT
        LTRIM(RTRIM(COST_CENTER)) AS COST_CENTER,
        LTRIM(RTRIM(LEV03_DESC)) AS DIVISION,
        LTRIM(RTRIM(LEV04_DESC)) AS BUSINESS_UNIT,
        ROW_NUMBER() OVER (
            PARTITION BY LTRIM(RTRIM(COST_CENTER))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
    WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
)
SELECT TOP (150)
    H.DIVISION,
    H.BUSINESS_UNIT,
    T.ACCT_LEVEL01_TEXT,
    T.ACCT_LEVEL02_TEXT,
    T.ACCT_LEVEL03_TEXT,
    TRY_CONVERT(BIGINT, T.RACCT) AS COST_ELEMENT,
    MAX(T.GL_TXT20) AS GL_DESCRIPTION,
    COUNT(DISTINCT LTRIM(RTRIM(T.RCNTR))) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(18,2), T.KSL)) AS NET_COST,
    SUM(ABS(TRY_CONVERT(DECIMAL(18,2), T.KSL))) AS ABS_COST
FROM src.rb_CVG_Transaction_Details_03 T
JOIN CostCenterHierarchy H
    ON LTRIM(RTRIM(T.RCNTR)) = H.COST_CENTER
   AND H.RN = 1
WHERE TRY_CONVERT(INT, T.GJAHR) = 2026
  AND TRY_CONVERT(INT, T.POPER) BETWEEN 1 AND 3
  AND H.DIVISION = 'DS Weapon Systems'
  AND TRY_CONVERT(DECIMAL(18,2), T.KSL) IS NOT NULL
GROUP BY
    H.DIVISION,
    H.BUSINESS_UNIT,
    T.ACCT_LEVEL01_TEXT,
    T.ACCT_LEVEL02_TEXT,
    T.ACCT_LEVEL03_TEXT,
    TRY_CONVERT(BIGINT, T.RACCT)
ORDER BY ABS(SUM(TRY_CONVERT(DECIMAL(18,2), T.KSL))) DESC;


/* ============================================================
   2) Allocation bridge for one posting cost center
   Replace the value below with a posting CC shown on the new
   DBM diagnostics page. Run this for the most interesting WS row
   and for one or two large non-WS rows that recover legacy sites.
   ============================================================ */
DECLARE @POSTING_CC VARCHAR(100) = 'REPLACE_ME';

WITH AllocationLinks AS (
    SELECT TOP (500)
        UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), RCNTR)))) AS RCNTR,
        UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), UKOSTL)))) AS UKOSTL,
        NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), Allocation))), '') AS ALLOCATION_NAME,
        NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), ERP_Allocation_Reference))), '') AS ERP_ALLOCATION_REFERENCE,
        NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(150), Facility_Type))), '') AS FACILITY_TYPE
    FROM dbo.rb_Allocation_staging_Capture_SAP
    WHERE UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), RCNTR)))) = UPPER(@POSTING_CC)
       OR UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), UKOSTL)))) = UPPER(@POSTING_CC)
),
Endpoints AS (
    SELECT DISTINCT
        CASE WHEN RCNTR = UPPER(@POSTING_CC) THEN UKOSTL ELSE RCNTR END AS LINKED_COST_CENTER
    FROM AllocationLinks
    WHERE RCNTR <> UKOSTL
),
Hierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        LEV03_DESC AS DIVISION,
        LEV04_DESC AS BUSINESS_UNIT,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
)
SELECT
    L.RCNTR,
    L.UKOSTL,
    L.ALLOCATION_NAME,
    L.ERP_ALLOCATION_REFERENCE,
    L.FACILITY_TYPE,
    E.LINKED_COST_CENTER,
    H.DIVISION AS LINKED_DIVISION,
    H.BUSINESS_UNIT AS LINKED_BUSINESS_UNIT,
    R.ADDRESS,
    R.BLDG_NAME,
    R.CITY,
    R.STATE,
    R.BLDG_FACID
FROM AllocationLinks L
LEFT JOIN Endpoints E
    ON E.LINKED_COST_CENTER = CASE WHEN L.RCNTR = UPPER(@POSTING_CC) THEN L.UKOSTL ELSE L.RCNTR END
LEFT JOIN Hierarchy H
    ON H.COST_CENTER = E.LINKED_COST_CENTER
   AND H.RN = 1
LEFT JOIN src.rb_lvw_fdw_rems_buildings R
    ON UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), R.COST_CENTER)))) = E.LINKED_COST_CENTER
ORDER BY L.RCNTR, L.UKOSTL, R.ADDRESS;
