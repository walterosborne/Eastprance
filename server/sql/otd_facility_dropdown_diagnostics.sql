/*
  OTD facility diagnostics (read only)
  Three result sets:
    1. OTD table location and columns
    2. Site coverage by year and BU
    3. Raw OTD sites and facility groupings (up to 50 rows)

  The OTD upload's worksheet names become BU values.
  The Site column is optional in the upload; a missing Site remains blank.
  No facility names or business-unit names are hardcoded.
*/
SET NOCOUNT ON;

-- 1. Check whether the upload table and the app's expected columns line up.
-- The workbook loader can create BU while the application reads Business Unit.
SELECT
    s.name AS [Schema],
    t.name AS [Table],
    SUM(CASE WHEN p.index_id IN (0, 1) THEN p.rows ELSE 0 END) AS [Estimated Rows],
    CASE WHEN COL_LENGTH(N'ecosystem_source.' + s.name + N'.' + t.name, N'BU') IS NOT NULL
         THEN 1 ELSE 0 END AS [Has BU],
    CASE WHEN COL_LENGTH(N'ecosystem_source.' + s.name + N'.' + t.name, N'Business Unit') IS NOT NULL
         THEN 1 ELSE 0 END AS [Has Business Unit],
    CASE WHEN COL_LENGTH(N'ecosystem_source.' + s.name + N'.' + t.name, N'Division') IS NOT NULL
         THEN 1 ELSE 0 END AS [Has Division],
    CASE WHEN COL_LENGTH(N'ecosystem_source.' + s.name + N'.' + t.name, N'Site') IS NOT NULL
         THEN 1 ELSE 0 END AS [Has Site]
FROM [ecosystem_source].sys.tables AS t
JOIN [ecosystem_source].sys.schemas AS s ON s.schema_id = t.schema_id
LEFT JOIN [ecosystem_source].sys.partitions AS p ON p.object_id = t.object_id
WHERE t.name = N'otd' AND s.name IN (N'qmi', N'dbo')
GROUP BY s.name, t.name
ORDER BY CASE WHEN s.name = N'qmi' THEN 0 ELSE 1 END;

IF OBJECT_ID(N'ecosystem_source.qmi.otd', N'U') IS NULL
BEGIN
    PRINT 'qmi.otd was not found. Check the upload destination above.';
    RETURN;
END;

IF COL_LENGTH(N'ecosystem_source.qmi.otd', N'Site') IS NULL
    OR COL_LENGTH(N'ecosystem_source.qmi.otd', N'Year') IS NULL
    OR COL_LENGTH(N'ecosystem_source.qmi.otd', N'Program') IS NULL
BEGIN
    PRINT 'qmi.otd is missing Site, Year, or Program. Check the upload layout.';
    RETURN;
END;

DECLARE @buColumn nvarchar(100) = CASE
    WHEN COL_LENGTH(N'ecosystem_source.qmi.otd', N'Business Unit') IS NOT NULL
        THEN N'[Business Unit]'
    WHEN COL_LENGTH(N'ecosystem_source.qmi.otd', N'BU') IS NOT NULL
        THEN N'[BU]'
    ELSE N'CAST(NULL AS nvarchar(255))'
END;

DECLARE @typeColumn nvarchar(100) = CASE
    WHEN COL_LENGTH(N'ecosystem_source.qmi.otd', N'Type') IS NOT NULL
        THEN N'[Type]'
    ELSE N'CAST(NULL AS nvarchar(255))'
END;

DECLARE @source nvarchar(max) = N'
    SELECT
        TRY_CONVERT(int, [Year]) AS reporting_year,
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), ' + @buColumn + N'))), N'''') AS business_unit,
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), [Site]))), N'''') AS raw_site,
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(500), [Program]))), N'''') AS program,
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), ' + @typeColumn + N'))), N'''') AS delivery_type
    FROM [ecosystem_source].[qmi].[otd]
';

-- 2. Coverage by worksheet/BU and year.
-- Missing Site with populated Type helps distinguish absent site fields
-- from missing sheets or records.
EXEC sys.sp_executesql N'
WITH Otd AS (' + @source + N')
SELECT
    reporting_year AS [Year],
    COALESCE(business_unit, N''(missing)'') AS [BU],
    COUNT_BIG(*) AS [Rows],
    COUNT(DISTINCT program) AS [Programs],
    COUNT(DISTINCT raw_site) AS [Distinct Sites],
    SUM(CASE WHEN raw_site IS NULL THEN 1 ELSE 0 END) AS [Rows Missing Site],
    CASE WHEN COUNT(DISTINCT raw_site) = 1 THEN MAX(raw_site) END AS [Only Site If Single],
    MAX(CASE WHEN raw_site IS NULL THEN delivery_type END) AS [Example Type With No Site]
FROM Otd
GROUP BY reporting_year, business_unit
ORDER BY reporting_year DESC, business_unit;
';

-- 3. One row per raw OTD site, with the app's facility grouping applied.
-- The 50-row cap keeps results manageable; increase if needed.
EXEC sys.sp_executesql N'
WITH Otd AS (' + @source + N'),
SiteTotals AS (
    SELECT
        raw_site,
        COUNT_BIG(*) AS source_rows,
        COUNT(DISTINCT business_unit) AS business_units,
        COUNT(DISTINCT program) AS programs,
        MIN(reporting_year) AS first_year,
        MAX(reporting_year) AS last_year
    FROM Otd
    GROUP BY raw_site
)
SELECT TOP (50)
    COALESCE(st.raw_site, N''(missing)'') AS [Raw Site],
    COALESCE(g.grouped_site, st.raw_site, N''(missing)'') AS [Dashboard Facility],
    CASE WHEN st.raw_site IS NULL THEN N''Missing Site''
         WHEN g.grouped_site IS NULL THEN N''No grouping''
         ELSE N''Grouped'' END AS [Status],
    st.source_rows AS [Rows],
    st.business_units AS [BUs],
    st.programs AS [Programs],
    st.first_year AS [First Year],
    st.last_year AS [Last Year]
FROM SiteTotals AS st
OUTER APPLY (
    SELECT TOP (1)
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(1000), fg.[Group]))), N'''') AS grouped_site
    FROM [ecosystem_source].[qmi].[facilitygroupings] AS fg
    WHERE LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(1000), fg.[Original]))))
        = LOWER(st.raw_site)
    ORDER BY fg.[Group]
) AS g
ORDER BY CASE WHEN st.raw_site IS NULL THEN 0 ELSE 1 END,
         st.source_rows DESC, st.raw_site;
';
