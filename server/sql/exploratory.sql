/*
    QMI exploratory queries
    Safety event business-unit availability
    Read-only. Reuse this file for subsequent investigations.

    The safety data source has Division and Site dimensions.
    Confirm whether any business-unit field exists in the SQL table
    before attempting business-unit-level reporting.
*/
SET NOCOUNT ON;

-- 1. Available table columns, including any candidate BU identifiers.
SELECT
    c.column_id AS [Column Order],
    c.name AS [Column Name],
    ty.name AS [SQL Type],
    CASE
        WHEN LOWER(REPLACE(REPLACE(c.name, N' ', N''), N'_', N''))
             IN (N'bu', N'businessunit', N'busunit', N'busunitlvl2nocode')
        THEN N'Possible BU field'
        WHEN LOWER(c.name) IN (N'division', N'site')
        THEN N'Existing reporting dimension'
        ELSE N''
    END AS [Dimension Role]
FROM [ecosystem_source].sys.columns AS c
JOIN [ecosystem_source].sys.tables AS t
    ON c.object_id = t.object_id
JOIN [ecosystem_source].sys.schemas AS s
    ON t.schema_id = s.schema_id
JOIN [ecosystem_source].sys.types AS ty
    ON c.user_type_id = ty.user_type_id
WHERE s.name = N'qmi'
  AND t.name = N'safety_events'
ORDER BY c.column_id;

-- 2. Current safety-event coverage by year and Division.
-- This identifies which dimensions can already be represented reliably.
SELECT
    YEAR(TRY_CONVERT(date, [Date])) AS [Year],
    COALESCE(NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), [Division]))), N''), N'(missing)') AS [Division],
    COUNT_BIG(*) AS [Event Rows],
    COUNT(DISTINCT NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), [Site]))), N'')) AS [Sites],
    SUM(CASE WHEN TRY_CAST([SIF] AS int) = 1 THEN 1 ELSE 0 END) AS [SIF Flags],
    SUM(CASE WHEN TRY_CAST([SIF] AS int) <> 1
                  AND TRY_CAST([pSIF] AS int) = 1 THEN 1 ELSE 0 END) AS [pSIF Flags],
    SUM(CASE WHEN TRY_CAST([SIF] AS int) <> 1
                  AND TRY_CAST([pSIF] AS int) <> 1
                  AND TRY_CAST([Near Miss] AS int) = 1 THEN 1 ELSE 0 END) AS [Near Miss Flags]
FROM [ecosystem_source].[qmi].[safety_events]
WHERE TRY_CONVERT(date, [Date]) IS NOT NULL
GROUP BY
    YEAR(TRY_CONVERT(date, [Date])),
    COALESCE(NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), [Division]))), N''), N'(missing)')
ORDER BY [Year] DESC, [Division];

-- A site name alone is not a reliable business-unit assignment.
-- The application currently treats BU-filtered safety records as unmatched.
