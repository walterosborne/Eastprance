/*
Focused follow-up for the controllable-cost investigation.
Run these manually in DBM. They do not change production data.

What the latest diagnostics proved:
- dbo.rb_Allocation_staging_Capture_SAP is the only allocation object currently returning useful links.
- The page found WS allocation links, but the top bridge rows were dominated by C2.
- REMS is blocked by DB permissions, so these queries use hierarchy + roster + Archibus.
*/

/* ============================================================
   QUERY 1 — Where Weapon Systems Q1 2026 dollars actually live
   Run this first. It intentionally does NOT filter to Non-Labor CEG.
   Send the first ~30 rows, including all account hierarchy columns.
   ============================================================ */
WITH CostCenterHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        LTRIM(RTRIM(LEV03_DESC)) AS DIVISION,
        LTRIM(RTRIM(LEV04_DESC)) AS BUSINESS_UNIT,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
    WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
)
SELECT TOP (150)
    H.BUSINESS_UNIT,
    T.ACCT_LEVEL01_TEXT,
    T.ACCT_LEVEL02_TEXT,
    T.ACCT_LEVEL03_TEXT,
    TRY_CONVERT(BIGINT, T.RACCT) AS COST_ELEMENT,
    MAX(T.GL_TXT20) AS GL_DESCRIPTION,
    COUNT(DISTINCT UPPER(LTRIM(RTRIM(T.RCNTR)))) AS COST_CENTER_COUNT,
    SUM(TRY_CONVERT(DECIMAL(18,2), T.KSL)) AS NET_COST,
    SUM(ABS(TRY_CONVERT(DECIMAL(18,2), T.KSL))) AS ABS_COST
FROM src.rb_CVG_Transaction_Details_03 T
JOIN CostCenterHierarchy H
    ON UPPER(LTRIM(RTRIM(T.RCNTR))) = H.COST_CENTER
   AND H.RN = 1
WHERE TRY_CONVERT(INT, T.GJAHR) = 2026
  AND TRY_CONVERT(INT, T.POPER) BETWEEN 1 AND 3
  AND H.DIVISION = 'DS Weapon Systems'
  AND TRY_CONVERT(DECIMAL(18,2), T.KSL) IS NOT NULL
GROUP BY
    H.BUSINESS_UNIT,
    T.ACCT_LEVEL01_TEXT,
    T.ACCT_LEVEL02_TEXT,
    T.ACCT_LEVEL03_TEXT,
    TRY_CONVERT(BIGINT, T.RACCT)
ORDER BY ABS(SUM(TRY_CONVERT(DECIMAL(18,2), T.KSL))) DESC;


/* ============================================================
   QUERY 2 — WS posting cost centers -> allocation links -> location
   This is the main follow-up to the page's 36 WS links.
   It ranks WS posting cost centers by total Q1 activity, then shows
   every distinct RCNTR/UKOSTL bridge plus linked division/BU and the
   best roster/Archibus location we can see.

   Send the first ~40 rows.
   ============================================================ */
WITH CostCenterHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS DIVISION,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV04_DESC)), ''), 'Unmapped') AS BUSINESS_UNIT,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
),
WS_Q1 AS (
    SELECT
        UPPER(LTRIM(RTRIM(T.RCNTR))) AS POSTING_CC,
        H.BUSINESS_UNIT AS POSTING_BU,
        SUM(TRY_CONVERT(DECIMAL(18,2), T.KSL)) AS Q1_NET_COST,
        SUM(ABS(TRY_CONVERT(DECIMAL(18,2), T.KSL))) AS Q1_ABS_COST,
        SUM(CASE
            WHEN LTRIM(RTRIM(T.ACCT_LEVEL02_TEXT)) = 'NGRB Indirect Non Labor CEG'
            THEN TRY_CONVERT(DECIMAL(18,2), T.KSL)
            ELSE 0
        END) AS Q1_NONLABOR_COST
    FROM src.rb_CVG_Transaction_Details_03 T
    JOIN CostCenterHierarchy H
        ON UPPER(LTRIM(RTRIM(T.RCNTR))) = H.COST_CENTER
       AND H.RN = 1
    WHERE TRY_CONVERT(INT, T.GJAHR) = 2026
      AND TRY_CONVERT(INT, T.POPER) BETWEEN 1 AND 3
      AND H.DIVISION = 'DS Weapon Systems'
      AND TRY_CONVERT(DECIMAL(18,2), T.KSL) IS NOT NULL
    GROUP BY UPPER(LTRIM(RTRIM(T.RCNTR))), H.BUSINESS_UNIT
),
AllocationLinks AS (
    SELECT DISTINCT
        UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.RCNTR)))) AS RCNTR,
        UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.UKOSTL)))) AS UKOSTL,
        NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), A.Allocation))), '') AS ALLOCATION_NAME,
        NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), A.ERP_Allocation_Reference))), '') AS ERP_ALLOCATION_REFERENCE,
        NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(150), A.Facility_Type))), '') AS FACILITY_TYPE
    FROM dbo.rb_Allocation_staging_Capture_SAP A
    WHERE EXISTS (
        SELECT 1
        FROM WS_Q1 W
        WHERE UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.RCNTR)))) = W.POSTING_CC
           OR UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.UKOSTL)))) = W.POSTING_CC
    )
),
Bridges AS (
    SELECT
        W.POSTING_CC,
        W.POSTING_BU,
        W.Q1_NET_COST,
        W.Q1_ABS_COST,
        W.Q1_NONLABOR_COST,
        CASE WHEN A.RCNTR = W.POSTING_CC THEN 'RCNTR -> UKOSTL' ELSE 'UKOSTL -> RCNTR' END AS DIRECTION,
        CASE WHEN A.RCNTR = W.POSTING_CC THEN A.UKOSTL ELSE A.RCNTR END AS LINKED_CC,
        A.ALLOCATION_NAME,
        A.ERP_ALLOCATION_REFERENCE,
        A.FACILITY_TYPE
    FROM WS_Q1 W
    JOIN AllocationLinks A
      ON A.RCNTR = W.POSTING_CC OR A.UKOSTL = W.POSTING_CC
    WHERE A.RCNTR <> A.UKOSTL
),
RosterLocations AS (
    SELECT
        UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), CostCenter)))) AS COST_CENTER,
        MIN(NULLIF(CONCAT_WS(' | ',
            NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(100), LocationID))), ''),
            NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), LocationName))), ''),
            NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(100), WorkCity))), ''),
            NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(100), WorkStateCode))), '')
        ), '')) AS ROSTER_LOCATION,
        COUNT(DISTINCT CONCAT_WS('|', LocationID, LocationName, WorkCity, WorkStateCode)) AS ROSTER_LOCATION_COUNT
    FROM dbo.src_ng_nonsensitive_roster
    GROUP BY UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), CostCenter))))
),
ArchibusLocations AS (
    SELECT
        UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), employee_cost_center)))) AS COST_CENTER,
        MIN(NULLIF(CONCAT_WS(' | ',
            NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), address_1))), ''),
            NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(100), city))), ''),
            NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(100), state))), '')
        ), '')) AS ARCHIBUS_LOCATION,
        COUNT(DISTINCT CONCAT_WS('|', address_1, city, state)) AS ARCHIBUS_LOCATION_COUNT
    FROM rpt.rb_archibus
    GROUP BY UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), employee_cost_center))))
)
SELECT TOP (250)
    B.POSTING_CC,
    B.POSTING_BU,
    B.Q1_NET_COST,
    B.Q1_ABS_COST,
    B.Q1_NONLABOR_COST,
    B.DIRECTION,
    B.LINKED_CC,
    H.DIVISION AS LINKED_DIVISION,
    H.BUSINESS_UNIT AS LINKED_BUSINESS_UNIT,
    R.ROSTER_LOCATION,
    R.ROSTER_LOCATION_COUNT,
    X.ARCHIBUS_LOCATION,
    X.ARCHIBUS_LOCATION_COUNT,
    B.ALLOCATION_NAME,
    B.ERP_ALLOCATION_REFERENCE,
    B.FACILITY_TYPE
FROM Bridges B
LEFT JOIN CostCenterHierarchy H
    ON H.COST_CENTER = B.LINKED_CC
   AND H.RN = 1
LEFT JOIN RosterLocations R
    ON R.COST_CENTER = B.LINKED_CC
LEFT JOIN ArchibusLocations X
    ON X.COST_CENTER = B.LINKED_CC
ORDER BY B.Q1_ABS_COST DESC, B.POSTING_CC, B.LINKED_CC;


/* ============================================================
   QUERY 3 — What do the WS allocation clues actually mean?
   The page's best candidates repeatedly showed values like NoFAC.
   This groups the WS-linked allocation metadata so we can determine
   whether this staging table is truly a facility allocation bridge
   or merely a broader organizational allocation table.

   Send the full result; it should be small.
   ============================================================ */
WITH CostCenterHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        LTRIM(RTRIM(LEV03_DESC)) AS DIVISION,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
    WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
),
WS_CostCenters AS (
    SELECT DISTINCT UPPER(LTRIM(RTRIM(T.RCNTR))) AS COST_CENTER
    FROM src.rb_CVG_Transaction_Details_03 T
    JOIN CostCenterHierarchy H
      ON UPPER(LTRIM(RTRIM(T.RCNTR))) = H.COST_CENTER
     AND H.RN = 1
    WHERE TRY_CONVERT(INT, T.GJAHR) = 2026
      AND TRY_CONVERT(INT, T.POPER) BETWEEN 1 AND 3
      AND H.DIVISION = 'DS Weapon Systems'
),
WS_Links AS (
    SELECT DISTINCT
        UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.RCNTR)))) AS RCNTR,
        UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.UKOSTL)))) AS UKOSTL,
        COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), A.Allocation))), ''), '(blank)') AS ALLOCATION_NAME,
        COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(250), A.ERP_Allocation_Reference))), ''), '(blank)') AS ERP_ALLOCATION_REFERENCE,
        COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(150), A.Facility_Type))), ''), '(blank)') AS FACILITY_TYPE
    FROM dbo.rb_Allocation_staging_Capture_SAP A
    WHERE EXISTS (
        SELECT 1 FROM WS_CostCenters W
        WHERE UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.RCNTR)))) = W.COST_CENTER
           OR UPPER(LTRIM(RTRIM(CONVERT(VARCHAR(100), A.UKOSTL)))) = W.COST_CENTER
    )
)
SELECT
    FACILITY_TYPE,
    ALLOCATION_NAME,
    ERP_ALLOCATION_REFERENCE,
    COUNT(*) AS DISTINCT_LINK_ROWS,
    COUNT(DISTINCT RCNTR) AS DISTINCT_RCNTR,
    COUNT(DISTINCT UKOSTL) AS DISTINCT_UKOSTL
FROM WS_Links
GROUP BY FACILITY_TYPE, ALLOCATION_NAME, ERP_ALLOCATION_REFERENCE
ORDER BY COUNT(*) DESC, FACILITY_TYPE, ALLOCATION_NAME, ERP_ALLOCATION_REFERENCE;
