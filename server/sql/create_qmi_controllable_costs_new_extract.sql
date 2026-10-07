/*
 QMI new Controllable Costs extract — SQL Server

 1) Run STEP 1 ONCE to create the table.
 2) Run STEP 2 once to populate it, then use STEP 2 (from SET XACT_ABORT
    through END CATCH) as the daily scheduled job/procedure body.
 3) The app reads this precomputed extract through
    server/dbmQueries/controllableCostsNewQuery.js.

 CWI uses the revised G/L scope reconciled against the legacy CRE Q1 2026
 facility data. On the 14 confidently matched CWI facilities, this scope
 reproduced the legacy total within about 0.7%.

 CWI changes from the prior extract logic:
   ADDED:
     4300395  Plant Rearrangement Expense      -> 6 Maintenance & Repairs
     4300652  Physical Security                -> 7 Services
     4301101  Light, Power, Water, Heat        -> 8 Utilities
     4301103  Purchased Gas                    -> 8 Utilities

   REMOVED:
     4300625  VarRent CAM
     4301049  Depreciation - Machinery & Equipment
     8320479  P&C Property
     4300805  General Services Ex

 7000301 is intentionally not added: the legacy report contained that account,
 but the current SAP transaction source did not reproduce those legacy dollars.

 SDS logic is unchanged, including its existing selected G/L population and
 six central SDS cost centers.

 Classification as Controllable/Uncontrollable remains in the app using
 cost_element_key / cost_category_key, not in this table.

 The refresh is atomic: if the source query fails or returns zero inserted
 rows, the previous extract is preserved by transaction rollback.
 */


/* ===== STEP 1: ONE-TIME TABLE CREATION ===== */

IF OBJECT_ID(N'ecosystem_source.qmi.controllable_costs_new_extract', N'U') IS NULL
BEGIN
    CREATE TABLE [ecosystem_source].[qmi].[controllable_costs_new_extract] (
        [year] INT NOT NULL,
        [month] INT NOT NULL,
        division NVARCHAR(255) NULL,
        business_unit NVARCHAR(255) NULL,
        facility NVARCHAR(1024) NOT NULL,
        facility_city NVARCHAR(255) NULL,
        facility_state NVARCHAR(255) NULL,
        cost_center NVARCHAR(64) NOT NULL,
        cost_category NVARCHAR(128) NOT NULL,
        gl_account_cost_element VARCHAR(50) NULL,
        cost_element_description NVARCHAR(512) NULL,
        cost DECIMAL(19,2) NOT NULL
    );

    CREATE INDEX IX_qmi_cc_new_extract_period_division
        ON [ecosystem_source].[qmi].[controllable_costs_new_extract]
           ([year], [month], division)
        INCLUDE (cost);
END;
GO


/* ===== STEP 2: DAILY REFRESH JOB / PROCEDURE BODY ===== */

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    -- Keep the old extract intact if any part of the refresh fails.
    DELETE FROM [ecosystem_source].[qmi].[controllable_costs_new_extract];

    ;WITH CostCenterHierarchy AS (
        SELECT
            UPPER(LTRIM(RTRIM(COST_CENTER))) AS Cost_Center,
            NULLIF(LTRIM(RTRIM(LEV03_DESC)), '') AS Division,
            NULLIF(LTRIM(RTRIM(LEV04_DESC)), '') AS Business_Unit,
            ROW_NUMBER() OVER (
                PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
                ORDER BY last_modified_date DESC, created_date DESC, id DESC
            ) AS rn
        FROM [DTO_Business_Management].[rpt].[rb_load_cost_center_hierarchy]
        WHERE LTRIM(RTRIM(LEV02)) = 'NGRBT'
          AND LTRIM(RTRIM(LEV03_DESC)) IN (
              'DS C2 & Weapons Integration',
              'DS Strategic Deterrent Systems'
          )
    ),

    FacilityKey AS (
        SELECT
            UPPER(LTRIM(RTRIM([Cost Center]))) AS Cost_Center,
            MAX(NULLIF(LTRIM(RTRIM([Address])), '')) AS Address,
            MAX(NULLIF(LTRIM(RTRIM([City])), '')) AS City,
            MAX(NULLIF(LTRIM(RTRIM([State])), '')) AS State
        FROM [ecosystem_source].[qmi].[costcenterkey]
        WHERE NULLIF(LTRIM(RTRIM([Cost Center])), '') IS NOT NULL
        GROUP BY UPPER(LTRIM(RTRIM([Cost Center])))
    ),

    SAPRows AS (
        SELECT
            TRY_CONVERT(INT, t.GJAHR) AS [year],
            TRY_CONVERT(INT, t.POPER) AS [month],
            h.Division AS division,
            h.Business_Unit AS business_unit,
            UPPER(LTRIM(RTRIM(t.RCNTR))) AS cost_center,

            CASE
                WHEN h.Division = 'DS Strategic Deterrent Systems'
                 AND UPPER(LTRIM(RTRIM(t.RCNTR))) IN (
                     'TDA87FC0', 'TDA87FO0', 'TDB84FAC',
                     'TDB84FCO', 'TDA87FL0', 'TDA10H1C'
                 )
                    THEN 'Strategic Deterrent Facility/Operations'
                ELSE COALESCE(
                    k.Address,
                    CONCAT('Unmapped (CC ', UPPER(LTRIM(RTRIM(t.RCNTR))), ')')
                )
            END AS facility,

            CASE
                WHEN h.Division = 'DS Strategic Deterrent Systems'
                 AND UPPER(LTRIM(RTRIM(t.RCNTR))) IN (
                     'TDA87FC0', 'TDA87FO0', 'TDB84FAC',
                     'TDB84FCO', 'TDA87FL0', 'TDA10H1C'
                 )
                    THEN NULL
                ELSE k.City
            END AS facility_city,

            CASE
                WHEN h.Division = 'DS Strategic Deterrent Systems'
                 AND UPPER(LTRIM(RTRIM(t.RCNTR))) IN (
                     'TDA87FC0', 'TDA87FO0', 'TDB84FAC',
                     'TDB84FCO', 'TDA87FL0', 'TDA10H1C'
                 )
                    THEN NULL
                ELSE k.State
            END AS facility_state,

            TRY_CONVERT(BIGINT, t.RACCT) AS GL,
            NULLIF(LTRIM(RTRIM(t.GL_TXT20)), '') AS cost_element_description,
            TRY_CONVERT(DECIMAL(19,2), t.KSL) AS cost

        FROM [DTO_Business_Management].[src].[rb_CVG_Transaction_Details_03] AS t

        JOIN CostCenterHierarchy AS h
          ON UPPER(LTRIM(RTRIM(t.RCNTR))) = h.Cost_Center
         AND h.rn = 1

        LEFT JOIN FacilityKey AS k
          ON UPPER(LTRIM(RTRIM(t.RCNTR))) = k.Cost_Center

        WHERE TRY_CONVERT(INT, t.GJAHR) >= 2025
          AND TRY_CONVERT(INT, t.POPER) BETWEEN 1 AND 12
          AND TRY_CONVERT(DECIMAL(19,2), t.KSL) IS NOT NULL

          -- Require a normal facility mapping for CWI. Preserve the six
          -- synthetic central SDS facility/operations cost centers.
          AND (
              k.Cost_Center IS NOT NULL
              OR (
                  h.Division = 'DS Strategic Deterrent Systems'
                  AND UPPER(LTRIM(RTRIM(t.RCNTR))) IN (
                      'TDA87FC0', 'TDA87FO0', 'TDB84FAC',
                      'TDB84FCO', 'TDA87FL0', 'TDA10H1C'
                  )
              )
          )

          -- Filter before aggregation. CWI uses the reconciled scope;
          -- SDS deliberately retains its prior scope unchanged.
          AND (
              (
                  h.Division = 'DS C2 & Weapons Integration'
                  AND (
                      TRY_CONVERT(BIGINT, t.RACCT) BETWEEN 4100000 AND 4109999
                      OR TRY_CONVERT(BIGINT, t.RACCT) IN (
                          8320037,

                          -- Rent
                          4300591, 4300887, 4301077,

                          -- Depreciation & LHI
                          4301048, 4301050, 4301231,

                          -- Property Taxes
                          4300626,

                          -- Insurance
                          4300852, 4300630,

                          -- Maintenance & Repairs
                          4300884, 4300699, 4300702, 4300704, 4300705,
                          4300701, 4300700, 4300671, 4300643, 4300305,
                          4300669, 4300698, 4300680,
                          4300395,

                          -- Services
                          4300703, 4300666, 4300807,
                          4300652,

                          -- Utilities
                          4301102, 4301013, 4301104, 4300628,
                          4301101, 4301103
                      )
                  )
              )

              OR

              (
                  h.Division = 'DS Strategic Deterrent Systems'
                  AND (
                      TRY_CONVERT(BIGINT, t.RACCT) BETWEEN 4100000 AND 4109999
                      OR TRY_CONVERT(BIGINT, t.RACCT) IN (
                          8320037,
                          4300591, 4300625, 4300887, 4301077,
                          4301048, 4301049, 4301050, 4301231,
                          4300626,
                          4300852, 4300630, 8320479,
                          4300884, 4300699, 4300702, 4300704, 4300705,
                          4300701, 4300700, 4300671, 4300643, 4300305,
                          4300669, 4300698, 4300680,
                          4300703, 4300805, 4300666, 4300807,
                          4301102, 4301013, 4301104, 4300628
                      )
                  )
              )
          )
    ),

    Classified AS (
        SELECT
            *,

            CASE
                /* ===== CWI: reconciled legacy-equivalent scope ===== */

                WHEN division = 'DS C2 & Weapons Integration'
                 AND (GL BETWEEN 4100000 AND 4109999 OR GL = 8320037)
                    THEN '1 Labor'

                WHEN division = 'DS C2 & Weapons Integration'
                 AND GL IN (4300591, 4300887, 4301077)
                    THEN '2 Rent - Land & Building'

                WHEN division = 'DS C2 & Weapons Integration'
                 AND GL IN (4301048, 4301050, 4301231)
                    THEN '3 Depreciation & LHI'

                WHEN division = 'DS C2 & Weapons Integration'
                 AND GL = 4300626
                    THEN '4 Property Taxes'

                WHEN division = 'DS C2 & Weapons Integration'
                 AND GL IN (4300852, 4300630)
                    THEN '5 Insurance'

                WHEN division = 'DS C2 & Weapons Integration'
                 AND GL IN (
                     4300884, 4300699, 4300702, 4300704,
                     4300705, 4300701, 4300700, 4300671,
                     4300643, 4300305, 4300669, 4300698,
                     4300680, 4300395
                 )
                    THEN '6 Maintenance & Repairs'

                WHEN division = 'DS C2 & Weapons Integration'
                 AND GL IN (
                     4300703, 4300666, 4300807, 4300652
                 )
                    THEN '7 Services'

                WHEN division = 'DS C2 & Weapons Integration'
                 AND GL IN (
                     4301102, 4301013, 4301104, 4300628,
                     4301101, 4301103
                 )
                    THEN '8 Utilities'


                /* ===== SDS: existing logic unchanged ===== */

                WHEN division = 'DS Strategic Deterrent Systems'
                 AND (GL BETWEEN 4100000 AND 4109999 OR GL = 8320037)
                    THEN '1 Labor'

                WHEN division = 'DS Strategic Deterrent Systems'
                 AND GL IN (4300591, 4300625, 4300887, 4301077)
                    THEN '2 Rent - Land & Building'

                WHEN division = 'DS Strategic Deterrent Systems'
                 AND GL IN (4301048, 4301049, 4301050, 4301231)
                    THEN '3 Depreciation & LHI'

                WHEN division = 'DS Strategic Deterrent Systems'
                 AND GL = 4300626
                    THEN '4 Property Taxes'

                WHEN division = 'DS Strategic Deterrent Systems'
                 AND GL IN (4300852, 4300630, 8320479)
                    THEN '5 Insurance'

                WHEN division = 'DS Strategic Deterrent Systems'
                 AND GL IN (
                     4300884, 4300699, 4300702, 4300704,
                     4300705, 4300701, 4300700, 4300671,
                     4300643, 4300305, 4300669, 4300698,
                     4300680
                 )
                    THEN '6 Maintenance & Repairs'

                WHEN division = 'DS Strategic Deterrent Systems'
                 AND GL IN (4300703, 4300805, 4300666, 4300807)
                    THEN '7 Services'

                WHEN division = 'DS Strategic Deterrent Systems'
                 AND GL IN (4301102, 4301013, 4301104, 4300628)
                    THEN '8 Utilities'

                ELSE NULL
            END AS cost_category

        FROM SAPRows
    )

    INSERT INTO [ecosystem_source].[qmi].[controllable_costs_new_extract] (
        [year],
        [month],
        division,
        business_unit,
        facility,
        facility_city,
        facility_state,
        cost_center,
        cost_category,
        gl_account_cost_element,
        cost_element_description,
        cost
    )

    SELECT
        [year],
        [month],
        division,
        business_unit,
        facility,
        facility_city,
        facility_state,
        cost_center,
        cost_category,
        CONVERT(VARCHAR(50), GL) AS gl_account_cost_element,
        MAX(cost_element_description) AS cost_element_description,
        SUM(cost) AS cost

    FROM Classified

    WHERE cost_category IS NOT NULL

    GROUP BY
        [year],
        [month],
        division,
        business_unit,
        facility,
        facility_city,
        facility_state,
        cost_center,
        cost_category,
        GL;


    IF @@ROWCOUNT = 0
        THROW 51001,
              'QMI cost extract refresh returned zero rows; transaction rolled back.',
              1;


    COMMIT TRANSACTION;
END TRY

BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO


/* ===== STEP 3: MANUAL VALIDATION (NOT REQUIRED IN DAILY JOB) ===== */

SELECT
    [year],
    [month],
    division,
    COUNT_BIG(*) AS extract_rows,
    SUM(cost) AS selected_net_cost

FROM [ecosystem_source].[qmi].[controllable_costs_new_extract]

WHERE [year] = 2026
  AND [month] BETWEEN 1 AND 3

GROUP BY
    [year],
    [month],
    division

ORDER BY
    [year],
    [month],
    division;
