/*
  OTD September reconciliation
  Read-only diagnostics for a single facility group and reporting year.

  Results:
    1. September totals by year, with reference comparison
    2. Source-site and business-unit contributions
    3. Largest program/project contributions

  Set @ReportingYear and @FacilityGroup as needed.
*/
SET NOCOUNT ON;

DECLARE @ReportingYear int = 2026;
DECLARE @FacilityGroup nvarchar(255) = N'Radford';
DECLARE @ReferenceCommitments decimal(28, 2) = 354000;
DECLARE @ReferenceActuals decimal(28, 2) = 330000;

IF OBJECT_ID(N'ecosystem_source.qmi.otd', N'U') IS NULL
    THROW 50001, 'The OTD data table was not found.', 1;

IF OBJECT_ID(N'ecosystem_source.qmi.facilitygroupings', N'U') IS NULL
    THROW 50002, 'The facility grouping table was not found.', 1;

-- 1. September totals using the OTD card's sum-by-timeline method.
-- The prior year is included separately to reveal year-scope differences.
;WITH RelevantRows AS (
    SELECT
        TRY_CONVERT(int, o.[Year]) AS reporting_year,
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(100), o.[Timeline]))) AS measure_type,
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(500), o.[Program]))) AS program,
        COALESCE(TRY_CONVERT(decimal(28, 2), o.[SEP]), 0) AS september_units
    FROM [ecosystem_source].[qmi].[otd] AS o
    OUTER APPLY (
        SELECT TOP (1)
            NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), fg.[Group]))), N'')
                AS grouped_site
        FROM [ecosystem_source].[qmi].[facilitygroupings] AS fg
        WHERE LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), fg.[Original]))))
              COLLATE DATABASE_DEFAULT
            = LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Site]))))
              COLLATE DATABASE_DEFAULT
        ORDER BY fg.[Group]
    ) AS mapped
    WHERE TRY_CONVERT(int, o.[Year]) IN (@ReportingYear - 1, @ReportingYear)
      AND LOWER(
          COALESCE(mapped.grouped_site,
              NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Site]))), N''))
      ) COLLATE DATABASE_DEFAULT = LOWER(@FacilityGroup) COLLATE DATABASE_DEFAULT
),
Totals AS (
    SELECT
        reporting_year,
        COUNT_BIG(*) AS source_rows,
        COUNT(DISTINCT NULLIF(program, N'')) AS programs,
        SUM(CASE WHEN measure_type = N'Contract Commitment'
                 THEN september_units ELSE 0 END) AS commitments,
        SUM(CASE WHEN measure_type IN (N'Actuals Delivered', N'Actual Delivered')
                 THEN september_units ELSE 0 END) AS actuals
    FROM RelevantRows
    GROUP BY reporting_year
)
SELECT
    y.reporting_year AS [Year],
    COALESCE(t.source_rows, 0) AS [Rows],
    COALESCE(t.programs, 0) AS [Programs],
    COALESCE(t.commitments, 0) AS [September Commitments],
    COALESCE(t.actuals, 0) AS [September Actuals],
    CASE WHEN y.reporting_year = @ReportingYear
         THEN @ReferenceCommitments END AS [Reference Commitments],
    CASE WHEN y.reporting_year = @ReportingYear
         THEN @ReferenceActuals END AS [Reference Actuals],
    CASE WHEN y.reporting_year = @ReportingYear
         THEN COALESCE(t.commitments, 0) - @ReferenceCommitments END
         AS [Commitment Difference],
    CASE WHEN y.reporting_year = @ReportingYear
         THEN COALESCE(t.actuals, 0) - @ReferenceActuals END
         AS [Actual Difference]
FROM (VALUES (@ReportingYear - 1), (@ReportingYear)) AS y(reporting_year)
LEFT JOIN Totals AS t ON t.reporting_year = y.reporting_year
ORDER BY y.reporting_year DESC;

-- 2. Identify contributing raw site names, divisions, and business units.
;WITH Contributions AS (
    SELECT
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Site]))), N'') AS raw_site,
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Division]))), N'') AS division,
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Business Unit]))), N'') AS business_unit,
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(100), o.[Timeline]))) AS measure_type,
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(500), o.[Program]))) AS program,
        COALESCE(TRY_CONVERT(decimal(28, 2), o.[SEP]), 0) AS september_units
    FROM [ecosystem_source].[qmi].[otd] AS o
    OUTER APPLY (
        SELECT TOP (1)
            NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), fg.[Group]))), N'')
                AS grouped_site
        FROM [ecosystem_source].[qmi].[facilitygroupings] AS fg
        WHERE LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), fg.[Original]))))
              COLLATE DATABASE_DEFAULT
            = LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Site]))))
              COLLATE DATABASE_DEFAULT
        ORDER BY fg.[Group]
    ) AS mapped
    WHERE TRY_CONVERT(int, o.[Year]) = @ReportingYear
      AND LOWER(
          COALESCE(mapped.grouped_site,
              NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Site]))), N''))
      ) COLLATE DATABASE_DEFAULT = LOWER(@FacilityGroup) COLLATE DATABASE_DEFAULT
)
SELECT TOP (30)
    COALESCE(raw_site, N'(missing)') AS [Original Site],
    COALESCE(division, N'(missing)') AS [Division],
    COALESCE(business_unit, N'(missing)') AS [Business Unit],
    COUNT_BIG(*) AS [Rows],
    COUNT(DISTINCT NULLIF(program, N'')) AS [Programs],
    SUM(CASE WHEN measure_type = N'Contract Commitment'
             THEN september_units ELSE 0 END) AS [September Commitments],
    SUM(CASE WHEN measure_type IN (N'Actuals Delivered', N'Actual Delivered')
             THEN september_units ELSE 0 END) AS [September Actuals]
FROM Contributions
GROUP BY raw_site, division, business_unit
ORDER BY ABS(
    SUM(CASE WHEN measure_type = N'Contract Commitment'
             THEN september_units ELSE 0 END)
) + ABS(
    SUM(CASE WHEN measure_type IN (N'Actuals Delivered', N'Actual Delivered')
             THEN september_units ELSE 0 END)
) DESC, raw_site, business_unit;

-- 3. Largest contributing programs; repeated timeline rows are visible.
;WITH ProgramRows AS (
    SELECT
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(500), o.[Program]))), N'') AS program,
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Project ID]))), N'') AS project_id,
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Business Unit]))), N'') AS business_unit,
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Site]))), N'') AS raw_site,
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(100), o.[Timeline]))) AS measure_type,
        COALESCE(TRY_CONVERT(decimal(28, 2), o.[SEP]), 0) AS september_units
    FROM [ecosystem_source].[qmi].[otd] AS o
    OUTER APPLY (
        SELECT TOP (1)
            NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), fg.[Group]))), N'')
                AS grouped_site
        FROM [ecosystem_source].[qmi].[facilitygroupings] AS fg
        WHERE LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), fg.[Original]))))
              COLLATE DATABASE_DEFAULT
            = LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Site]))))
              COLLATE DATABASE_DEFAULT
        ORDER BY fg.[Group]
    ) AS mapped
    WHERE TRY_CONVERT(int, o.[Year]) = @ReportingYear
      AND LOWER(
          COALESCE(mapped.grouped_site,
              NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), o.[Site]))), N''))
      ) COLLATE DATABASE_DEFAULT = LOWER(@FacilityGroup) COLLATE DATABASE_DEFAULT
)
SELECT TOP (30)
    COALESCE(program, N'(missing)') AS [Program],
    COALESCE(project_id, N'(missing)') AS [Project ID],
    COALESCE(raw_site, N'(missing)') AS [Original Site],
    COALESCE(business_unit, N'(missing)') AS [Business Unit],
    SUM(CASE WHEN measure_type = N'Contract Commitment'
             THEN 1 ELSE 0 END) AS [Commitment Rows],
    SUM(CASE WHEN measure_type IN (N'Actuals Delivered', N'Actual Delivered')
             THEN 1 ELSE 0 END) AS [Actual Rows],
    SUM(CASE WHEN measure_type = N'Contract Commitment'
             THEN september_units ELSE 0 END) AS [September Commitments],
    SUM(CASE WHEN measure_type IN (N'Actuals Delivered', N'Actual Delivered')
             THEN september_units ELSE 0 END) AS [September Actuals]
FROM ProgramRows
GROUP BY program, project_id, raw_site, business_unit
ORDER BY ABS(
    SUM(CASE WHEN measure_type = N'Contract Commitment'
             THEN september_units ELSE 0 END)
) + ABS(
    SUM(CASE WHEN measure_type IN (N'Actuals Delivered', N'Actual Delivered')
             THEN september_units ELSE 0 END)
) DESC, program, project_id;
