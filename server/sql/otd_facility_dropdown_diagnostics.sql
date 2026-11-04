/*
  OTD facility lookup — read only.
  One result set: raw Site, displayed facility group, row count and year range.
*/
SET NOCOUNT ON;

WITH Targets AS (
    SELECT target FROM (VALUES
        (N'Huntsville'),
        (N'Elkton'),
        (N'Rocket Center (ABL)'),
        (N'Edwards AFB'),
        (N'Redondo / Manhattan Beach')
    ) AS v(target)
),
SearchTerms AS (
    SELECT target, term FROM (VALUES
        (N'Huntsville', N'HUNTSVILLE'),
        (N'Huntsville', N'WYNN'),
        (N'Huntsville', N'EPIC'),
        (N'Elkton', N'ELKTON'),
        (N'Rocket Center (ABL)', N'ROCKET CENTER'),
        (N'Rocket Center (ABL)', N'ABL'),
        (N'Edwards AFB', N'EDWARDS'),
        (N'Redondo / Manhattan Beach', N'REDONDO'),
        (N'Redondo / Manhattan Beach', N'MANHATTAN BEACH')
    ) AS v(target, term)
),
RawSites AS (
    SELECT
        NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(1000), [Site]))), N'') AS raw_site,
        COUNT_BIG(*) AS rows_in_otd,
        MIN(TRY_CONVERT(int, [Year])) AS first_year,
        MAX(TRY_CONVERT(int, [Year])) AS last_year
    FROM [ecosystem_source].[qmi].[otd]
    GROUP BY NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(1000), [Site]))), N'')
),
Sites AS (
    SELECT
        r.*,
        COALESCE(g.group_site, r.raw_site) AS displayed_site
    FROM RawSites AS r
    OUTER APPLY (
        SELECT TOP (1)
            NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(1000), [Group]))), N'') AS group_site
        FROM [ecosystem_source].[qmi].[facilitygroupings]
        WHERE UPPER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(1000), [Original]))))
            = UPPER(r.raw_site)
        ORDER BY [Group]
    ) AS g
),
Matches AS (
    SELECT DISTINCT t.target, s.raw_site, s.displayed_site,
        s.rows_in_otd, s.first_year, s.last_year
    FROM SearchTerms AS t
    JOIN Sites AS s
      ON UPPER(COALESCE(s.raw_site, N'')) LIKE N'%' + t.term + N'%'
      OR UPPER(COALESCE(s.displayed_site, N'')) LIKE N'%' + t.term + N'%'
)
SELECT
    t.target AS [Location],
    COALESCE(m.raw_site, N'(not found in OTD Site)') AS [Raw OTD Site],
    m.displayed_site AS [Grouped Facility],
    COALESCE(m.rows_in_otd, 0) AS [Rows],
    m.first_year AS [First Year],
    m.last_year AS [Last Year]
FROM Targets AS t
LEFT JOIN Matches AS m ON m.target = t.target
ORDER BY t.target, m.rows_in_otd DESC, m.raw_site;
