/*
  QMI exploratory queries - safety and OTD facility coverage
  Read-only; reuse this file for subsequent investigations.

  The safety metrics require a valid event date and at least one
  classified SIF, pSIF, or Near Miss flag. The OTD card uses Site,
  while facilitygroupings controls the displayed facility label.
*/
SET NOCOUNT ON;

-- 1. Source presence, by facility and dataset.
-- Rocket Center also searches for the ABL site code.
-- Beavercreek includes the "Beaver Creek" spelling.
;WITH Targets AS (
    SELECT target_name
    FROM (VALUES
        (N'Rocket Center'), (N'Beavercreek'), (N'Rolling Meadows')
    ) AS t(target_name)
),
Sources AS (
    SELECT source_name
    FROM (VALUES (N'Safety'), (N'OTD')) AS s(source_name)
),
SafetyRows AS (
    SELECT
        t.target_name,
        N'Safety' AS source_name,
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), e.[Site]))) AS raw_site,
        TRY_CONVERT(date, e.[Date]) AS event_date,
        YEAR(TRY_CONVERT(date, e.[Date])) AS reporting_year,
        COALESCE(TRY_CAST(e.[SIF] AS int), 0) AS sif_flag,
        COALESCE(TRY_CAST(e.[pSIF] AS int), 0) AS psif_flag,
        COALESCE(TRY_CAST(e.[Near Miss] AS int), 0) AS near_miss_flag
    FROM [ecosystem_source].[qmi].[safety_events] AS e
    CROSS APPLY (VALUES (
        LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), e.[Site]))))
    )) AS normalized(site_name)
    JOIN Targets AS t
      ON (t.target_name = N'Rocket Center'
          AND (normalized.site_name LIKE N'%rocket%' OR normalized.site_name = N'abl'))
      OR (t.target_name = N'Beavercreek' AND normalized.site_name LIKE N'%beaver%')
      OR (t.target_name = N'Rolling Meadows' AND normalized.site_name LIKE N'%rolling%meadow%')
),
OtdRows AS (
    SELECT
        t.target_name,
        N'OTD' AS source_name,
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), o.[Site]))) AS raw_site,
        CAST(NULL AS date) AS event_date,
        TRY_CONVERT(int, o.[Year]) AS reporting_year,
        CAST(0 AS int) AS sif_flag,
        CAST(0 AS int) AS psif_flag,
        CAST(0 AS int) AS near_miss_flag
    FROM [ecosystem_source].[qmi].[otd] AS o
    CROSS APPLY (VALUES (
        LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), o.[Site]))))
    )) AS normalized(site_name)
    JOIN Targets AS t
      ON (t.target_name = N'Rocket Center'
          AND (normalized.site_name LIKE N'%rocket%' OR normalized.site_name = N'abl'))
      OR (t.target_name = N'Beavercreek' AND normalized.site_name LIKE N'%beaver%')
      OR (t.target_name = N'Rolling Meadows' AND normalized.site_name LIKE N'%rolling%meadow%')
),
Matched AS (
    SELECT * FROM SafetyRows
    UNION ALL
    SELECT * FROM OtdRows
)
SELECT
    t.target_name AS [Facility],
    src.source_name AS [Dataset],
    COUNT(m.raw_site) AS [Source Rows],
    COUNT(DISTINCT m.raw_site) AS [Distinct Site Labels],
    SUM(CASE WHEN m.source_name = N'Safety' AND m.event_date IS NOT NULL
             THEN 1 ELSE 0 END) AS [Valid Dated Safety Rows],
    SUM(CASE WHEN m.source_name = N'Safety' AND m.event_date IS NOT NULL
                  AND (m.sif_flag = 1 OR m.psif_flag = 1 OR m.near_miss_flag = 1)
             THEN 1 ELSE 0 END) AS [Safety Rows Included by QMI],
    MIN(m.reporting_year) AS [Earliest Year],
    MAX(m.reporting_year) AS [Latest Year]
FROM Targets AS t
CROSS JOIN Sources AS src
LEFT JOIN Matched AS m
  ON m.target_name = t.target_name
 AND m.source_name = src.source_name
GROUP BY t.target_name, src.source_name
ORDER BY t.target_name, src.source_name;

-- 2. Matching site labels, division, reporting year, and classification.
-- Shows exactly which rows can produce a safety-site option.
;WITH RawSources AS (
    SELECT
        N'Safety' AS [Dataset],
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), e.[Site]))) AS [Raw Site],
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), e.[Division]))) AS [Division],
        YEAR(TRY_CONVERT(date, e.[Date])) AS [Year],
        CASE WHEN TRY_CONVERT(date, e.[Date]) IS NULL THEN 0 ELSE 1 END AS valid_date,
        COALESCE(TRY_CAST(e.[SIF] AS int), 0) AS sif_flag,
        COALESCE(TRY_CAST(e.[pSIF] AS int), 0) AS psif_flag,
        COALESCE(TRY_CAST(e.[Near Miss] AS int), 0) AS near_miss_flag
    FROM [ecosystem_source].[qmi].[safety_events] AS e
    UNION ALL
    SELECT
        N'OTD',
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), o.[Site]))),
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), o.[Division]))),
        TRY_CONVERT(int, o.[Year]),
        0, 0, 0, 0
    FROM [ecosystem_source].[qmi].[otd] AS o
),
Matched AS (
    SELECT
        CASE
            WHEN LOWER(r.[Raw Site]) LIKE N'%rocket%'
                 OR LOWER(r.[Raw Site]) = N'abl' THEN N'Rocket Center'
            WHEN LOWER(r.[Raw Site]) LIKE N'%beaver%' THEN N'Beavercreek'
            WHEN LOWER(r.[Raw Site]) LIKE N'%rolling%meadow%' THEN N'Rolling Meadows'
        END AS [Target],
        r.*
    FROM RawSources AS r
    WHERE LOWER(r.[Raw Site]) LIKE N'%rocket%'
       OR LOWER(r.[Raw Site]) = N'abl'
       OR LOWER(r.[Raw Site]) LIKE N'%beaver%'
       OR LOWER(r.[Raw Site]) LIKE N'%rolling%meadow%'
)
SELECT
    m.[Target],
    m.[Dataset],
    m.[Year],
    m.[Division],
    m.[Raw Site],
    COALESCE(mapping.mapped_group, m.[Raw Site]) AS [QMI Mapped Site],
    COUNT_BIG(*) AS [Source Rows],
    SUM(CASE WHEN m.[Dataset] = N'Safety' AND m.valid_date = 1
             THEN 1 ELSE 0 END) AS [Valid Dated Events],
    SUM(CASE WHEN m.[Dataset] = N'Safety' AND m.valid_date = 1
             AND (m.sif_flag = 1 OR m.psif_flag = 1 OR m.near_miss_flag = 1)
             THEN 1 ELSE 0 END) AS [QMI Included Events],
    SUM(CASE WHEN m.[Dataset] = N'Safety' AND m.valid_date = 1
                 AND m.sif_flag = 1 THEN 1 ELSE 0 END) AS [SIF],
    SUM(CASE WHEN m.[Dataset] = N'Safety' AND m.valid_date = 1
                 AND m.sif_flag <> 1 AND m.psif_flag = 1
             THEN 1 ELSE 0 END) AS [pSIF],
    SUM(CASE WHEN m.[Dataset] = N'Safety' AND m.valid_date = 1
                 AND m.sif_flag <> 1 AND m.psif_flag <> 1 AND m.near_miss_flag = 1
             THEN 1 ELSE 0 END) AS [Near Miss]
FROM Matched AS m
OUTER APPLY (
    SELECT TOP (1)
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), fm.[Group]))), N'') AS mapped_group
    FROM [ecosystem_source].[qmi].[facilitygroupings] AS fm
    WHERE LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), fm.[Original]))))
          COLLATE DATABASE_DEFAULT =
          LOWER(m.[Raw Site]) COLLATE DATABASE_DEFAULT
    ORDER BY fm.[Group]
) AS mapping
GROUP BY m.[Target], m.[Dataset], m.[Year], m.[Division], m.[Raw Site],
         COALESCE(mapping.mapped_group, m.[Raw Site])
ORDER BY m.[Target], m.[Dataset], m.[Year] DESC, m.[Raw Site];

-- 3. Facility aliases relevant to these locations.
SELECT
    [Original],
    [Group]
FROM [ecosystem_source].[qmi].[facilitygroupings]
WHERE LOWER(TRY_CONVERT(nvarchar(4000), [Original])) LIKE N'%rocket%'
   OR LOWER(TRY_CONVERT(nvarchar(4000), [Original])) = N'abl'
   OR LOWER(TRY_CONVERT(nvarchar(4000), [Original])) LIKE N'%beaver%'
   OR LOWER(TRY_CONVERT(nvarchar(4000), [Original])) LIKE N'%rolling%meadow%'
   OR LOWER(TRY_CONVERT(nvarchar(4000), [Group])) LIKE N'%rocket%'
   OR LOWER(TRY_CONVERT(nvarchar(4000), [Group])) LIKE N'%beaver%'
   OR LOWER(TRY_CONVERT(nvarchar(4000), [Group])) LIKE N'%rolling%meadow%'
ORDER BY [Group], [Original];
