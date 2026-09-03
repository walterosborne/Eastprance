/*
Next manual follow-up after the WS allocation test.
The WS-linked rows were all Facility_Type = NoFAC, Allocation = 1285,
ERP_Allocation_Reference = 8320589. That looks like division overhead,
not the missing facility bridge. These queries look specifically for
facility-tagged allocations and facility-like SAP activity.
*/

/* ============================================================
   QUERY 4 — What Facility_Type values actually exist?
   Fast metadata/profile query. Run this first and send ALL rows.
   ============================================================ */
SELECT
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(150), Facility_Type))), ''), '(blank)') AS FACILITY_TYPE,
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), Allocation))), ''), '(blank)') AS ALLOCATION_NAME,
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), ERP_Allocation_Reference))), ''), '(blank)') AS ERP_ALLOCATION_REFERENCE,
    COUNT(*) AS ROW_COUNT,
    COUNT(DISTINCT UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), RCNTR))))) AS DISTINCT_RCNTR,
    COUNT(DISTINCT UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), UKOSTL))))) AS DISTINCT_UKOSTL
FROM dbo.rb_Allocation_staging_Capture_SAP
GROUP BY
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(150), Facility_Type))), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), Allocation))), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), ERP_Allocation_Reference))), ''), '(blank)')
ORDER BY ROW_COUNT DESC;


/* ============================================================
   QUERY 5 — Inspect allocations that are NOT NoFAC
   If Query 4 proves there are facility-tagged rows, this shows both
   sides of those links and their current Division/BU.

   Send the first ~40 rows. If this returns zero rows, just tell me.
   ============================================================ */
WITH Hierarchy AS (
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
SELECT TOP (250)
    UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.RCNTR)))) AS RCNTR,
    HR.DIVISION AS RCNTR_DIVISION,
    HR.BUSINESS_UNIT AS RCNTR_BU,
    UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.UKOSTL)))) AS UKOSTL,
    HU.DIVISION AS UKOSTL_DIVISION,
    HU.BUSINESS_UNIT AS UKOSTL_BU,
    NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(150), A.Facility_Type))), '') AS FACILITY_TYPE,
    NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), A.Allocation))), '') AS ALLOCATION_NAME,
    NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), A.ERP_Allocation_Reference))), '') AS ERP_ALLOCATION_REFERENCE
FROM dbo.rb_Allocation_staging_Capture_SAP A
LEFT JOIN Hierarchy HR
    ON HR.COST_CENTER = UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.RCNTR))))
   AND HR.RN = 1
LEFT JOIN Hierarchy HU
    ON HU.COST_CENTER = UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.UKOSTL))))
   AND HU.RN = 1
WHERE COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(150), A.Facility_Type))), ''), '(blank)') <> 'NoFAC'
ORDER BY FACILITY_TYPE, ALLOCATION_NAME, ERP_ALLOCATION_REFERENCE, RCNTR, UKOSTL;


/* ============================================================
   QUERY 6 — Facility-like SAP activity by division, Q1 2026
   This is independent of the allocation staging table. It searches
   the live SAP transaction hierarchy for facility/FAC-related GLs,
   including applied facility allocations such as the WS FAC ALLOC
   row we saw in Query 1.

   Send the first ~40 rows. Keep Division, BU, Level2, Level3,
   Cost Element, GL Description, Net Cost and Abs Cost visible.
   ============================================================ */
WITH Hierarchy AS (
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
SELECT TOP (200)
    H.DIVISION,
    H.BUSINESS_UNIT,
    T.ACCT_LEVEL02_TEXT,
    T.ACCT_LEVEL03_TEXT,
    TRY_CONVERT(BIGINT, T.RACCT) AS COST_ELEMENT,
    MAX(T.GL_TXT20) AS GL_DESCRIPTION,
    COUNT(DISTINCT UPPER(LTRIM(RTRIM(T.RCNTR)))) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(18,2), T.KSL)) AS NET_COST,
    SUM(ABS(TRY_CONVERT(DECIMAL(18,2), T.KSL))) AS ABS_COST
FROM src.rb_CVG_Transaction_Details_03 T
JOIN Hierarchy H
    ON H.COST_CENTER = UPPER(LTRIM(RTRIM(T.RCNTR)))
   AND H.RN = 1
WHERE TRY_CONVERT(INT, T.GJAHR) = 2026
  AND TRY_CONVERT(INT, T.POPER) BETWEEN 1 AND 3
  AND TRY_CONVERT(DECIMAL(18,2), T.KSL) IS NOT NULL
  AND (
      UPPER(COALESCE(T.ACCT_LEVEL03_TEXT, '')) LIKE '%FAC%'
      OR UPPER(COALESCE(T.ACCT_LEVEL03_TEXT, '')) LIKE '%FACIL%'
      OR UPPER(COALESCE(T.GL_TXT20, '')) LIKE '%FAC%'
      OR UPPER(COALESCE(T.GL_TXT20, '')) LIKE '%FACIL%'
  )
GROUP BY
    H.DIVISION,
    H.BUSINESS_UNIT,
    T.ACCT_LEVEL02_TEXT,
    T.ACCT_LEVEL03_TEXT,
    TRY_CONVERT(BIGINT, T.RACCT)
ORDER BY ABS(SUM(TRY_CONVERT(DECIMAL(18,2), T.KSL))) DESC;


/* ============================================================
   QUERY 7 — Facility-like SAP totals by division only
   Small summary to answer the WS question directly.
   Send ALL rows.
   ============================================================ */
WITH Hierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS DIVISION,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
    WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
)
SELECT
    H.DIVISION,
    COUNT(DISTINCT UPPER(LTRIM(RTRIM(T.RCNTR)))) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(18,2), T.KSL)) AS NET_COST,
    SUM(ABS(TRY_CONVERT(DECIMAL(18,2), T.KSL))) AS ABS_COST
FROM src.rb_CVG_Transaction_Details_03 T
JOIN Hierarchy H
    ON H.COST_CENTER = UPPER(LTRIM(RTRIM(T.RCNTR)))
   AND H.RN = 1
WHERE TRY_CONVERT(INT, T.GJAHR) = 2026
  AND TRY_CONVERT(INT, T.POPER) BETWEEN 1 AND 3
  AND TRY_CONVERT(DECIMAL(18,2), T.KSL) IS NOT NULL
  AND (
      UPPER(COALESCE(T.ACCT_LEVEL03_TEXT, '')) LIKE '%FAC%'
      OR UPPER(COALESCE(T.GL_TXT20, '')) LIKE '%FAC%'
  )
GROUP BY H.DIVISION
ORDER BY ABS(SUM(TRY_CONVERT(DECIMAL(18,2), T.KSL))) DESC;
