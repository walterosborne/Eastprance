/*
  OTD facility diagnostics — read-only.
  Investigates source labels, facility grouping, and cross-metric facility origins.
  Database: ecosystem_source (SQL Server).
  Run as one batch. No source tables are modified.
*/
SET NOCOUNT ON;

IF OBJECT_ID(N'ecosystem_source.qmi.otd', N'U') IS NULL
    THROW 50001, 'Missing ecosystem_source.qmi.otd.', 1;

IF OBJECT_ID(N'ecosystem_source.qmi.facilitygroupings', N'U') IS NULL
    THROW 50002, 'Missing ecosystem_source.qmi.facilitygroupings.', 1;

DROP TABLE IF EXISTS #OtdRows;
DROP TABLE IF EXISTS #FacilityMap;
DROP TABLE IF EXISTS #OtdFacilities;
DROP TABLE IF EXISTS #Targets;
DROP TABLE IF EXISTS #Terms;
DROP TABLE IF EXISTS #SourceFacilities;

-- 1. Source-table layout. The loader and app may use different BU column names.
SELECT c.column_id, c.name AS column_name, ty.name AS data_type
FROM [ecosystem_source].sys.columns AS c
JOIN [ecosystem_source].sys.types AS ty ON c.user_type_id = ty.user_type_id
WHERE c.object_id = OBJECT_ID(N'ecosystem_source.qmi.otd')
ORDER BY c.column_id;

CREATE TABLE #OtdRows (
    source_site nvarchar(4000) COLLATE DATABASE_DEFAULT NULL,
    source_program nvarchar(4000) COLLATE DATABASE_DEFAULT NULL,
    source_project nvarchar(4000) COLLATE DATABASE_DEFAULT NULL,
    source_bu nvarchar(4000) COLLATE DATABASE_DEFAULT NULL,
    source_division nvarchar(4000) COLLATE DATABASE_DEFAULT NULL,
    timeline nvarchar(4000) COLLATE DATABASE_DEFAULT NULL,
    reporting_year int NULL
);

-- Read available identifiers without assuming the uploader's BU naming convention.
DECLARE @object nvarchar(200) = N'ecosystem_source.qmi.otd';
DECLARE @site nvarchar(max) = N'TRY_CONVERT(nvarchar(4000), [Site])';
DECLARE @program nvarchar(max) = CASE WHEN COL_LENGTH(@object, 'Program') IS NOT NULL
    THEN N'TRY_CONVERT(nvarchar(4000), [Program])' ELSE N'CAST(NULL AS nvarchar(4000))' END;
DECLARE @project nvarchar(max) = CASE WHEN COL_LENGTH(@object, 'Project ID') IS NOT NULL
    THEN N'TRY_CONVERT(nvarchar(4000), [Project ID])' ELSE N'CAST(NULL AS nvarchar(4000))' END;
DECLARE @bu nvarchar(max) = CASE
    WHEN COL_LENGTH(@object, 'Business Unit') IS NOT NULL
        THEN N'TRY_CONVERT(nvarchar(4000), [Business Unit])'
    WHEN COL_LENGTH(@object, 'BU') IS NOT NULL
        THEN N'TRY_CONVERT(nvarchar(4000), [BU])'
    ELSE N'CAST(NULL AS nvarchar(4000))' END;
DECLARE @division nvarchar(max) = CASE WHEN COL_LENGTH(@object, 'Division') IS NOT NULL
    THEN N'TRY_CONVERT(nvarchar(4000), [Division])' ELSE N'CAST(NULL AS nvarchar(4000))' END;
DECLARE @timeline nvarchar(max) = CASE WHEN COL_LENGTH(@object, 'Timeline') IS NOT NULL
    THEN N'TRY_CONVERT(nvarchar(4000), [Timeline])' ELSE N'CAST(NULL AS nvarchar(4000))' END;
DECLARE @year nvarchar(max) = CASE WHEN COL_LENGTH(@object, 'Year') IS NOT NULL
    THEN N'TRY_CONVERT(int, [Year])' ELSE N'CAST(NULL AS int)' END;

IF COL_LENGTH(@object, 'Site') IS NULL
    THROW 50003, 'OTD source has no Site column.', 1;

DECLARE @sql nvarchar(max) = N'
INSERT INTO #OtdRows
    (source_site, source_program, source_project, source_bu,
     source_division, timeline, reporting_year)
SELECT ' + @site + N', ' + @program + N', ' + @project + N', ' + @bu +
    N', ' + @division + N', ' + @timeline + N', ' + @year +
    N' FROM [ecosystem_source].[qmi].[otd];';
EXEC sys.sp_executesql @sql;

-- The app matches facilitygroupings.Original against a metric's raw Site,
-- replacing it with facilitygroupings.Group when a mapping exists.
;WITH RankedMap AS (
    SELECT
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), [Original])))
            COLLATE DATABASE_DEFAULT AS original_site,
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), [Group])))
            COLLATE DATABASE_DEFAULT AS grouped_site,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), [Original]))))
                COLLATE DATABASE_DEFAULT
            ORDER BY LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), [Group])))
        ) AS rn
    FROM [ecosystem_source].[qmi].[facilitygroupings]
    WHERE NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), [Original]))), '') IS NOT NULL
      AND NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), [Group]))), '') IS NOT NULL
)
SELECT original_site, grouped_site
INTO #FacilityMap
FROM RankedMap WHERE rn = 1;

SELECT
    o.*,
    COALESCE(m.grouped_site, NULLIF(LTRIM(RTRIM(o.source_site)), ''))
        AS displayed_site,
    CASE WHEN m.original_site IS NULL THEN 0 ELSE 1 END AS mapping_found
INTO #OtdFacilities
FROM #OtdRows AS o
LEFT JOIN #FacilityMap AS m
    ON LOWER(LTRIM(RTRIM(o.source_site))) COLLATE DATABASE_DEFAULT =
       LOWER(m.original_site) COLLATE DATABASE_DEFAULT;

CREATE TABLE #Targets (target_site nvarchar(100) COLLATE DATABASE_DEFAULT PRIMARY KEY);
INSERT INTO #Targets VALUES
    (N'Huntsville'), (N'Elkton'), (N'Rocket Center'),
    (N'Edwards AFB'), (N'Redondo Beach / Manhattan Beach');

CREATE TABLE #Terms (
    target_site nvarchar(100) COLLATE DATABASE_DEFAULT,
    search_pattern nvarchar(100) COLLATE DATABASE_DEFAULT
);
INSERT INTO #Terms VALUES
    (N'Huntsville', N'%Huntsville%'),
    (N'Huntsville', N'%Wynn%'),
    (N'Huntsville', N'%EPIC%'),
    (N'Elkton', N'%Elkton%'),
    (N'Rocket Center', N'%Rocket Center%'),
    (N'Rocket Center', N'%ABL%'),
    (N'Edwards AFB', N'%Edwards%'),
    (N'Redondo Beach / Manhattan Beach', N'%Redondo%'),
    (N'Redondo Beach / Manhattan Beach', N'%Manhattan Beach%');

-- 2. Summary: facility-label matches versus mentions in other OTD fields.
-- Only matches in raw/mapped Site can produce the OTD Facility dropdown entry.
SELECT
    t.target_site,
    (SELECT COUNT_BIG(*) FROM #OtdFacilities AS o
     WHERE EXISTS (SELECT 1 FROM #Terms AS term
                   WHERE term.target_site = t.target_site
                     AND (o.source_site LIKE term.search_pattern
                          OR o.displayed_site LIKE term.search_pattern)))
        AS otd_site_rows,
    (SELECT COUNT_BIG(*) FROM #OtdFacilities AS o
     WHERE EXISTS (SELECT 1 FROM #Terms AS term
                   WHERE term.target_site = t.target_site
                     AND (o.source_program LIKE term.search_pattern
                          OR o.source_project LIKE term.search_pattern
                          OR o.source_bu LIKE term.search_pattern
                          OR o.source_division LIKE term.search_pattern)))
        AS otd_metadata_mentions
FROM #Targets AS t
ORDER BY t.target_site;

-- 3. OTD detail, including raw Site, displayed group, BU, year, and timeline.
-- 'Metadata only' means the text is NOT a facility-dropdown value.
SELECT
    hits.target_site,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM #Terms AS term
            WHERE term.target_site = hits.target_site
              AND (o.source_site LIKE term.search_pattern
                   OR o.displayed_site LIKE term.search_pattern)
        ) THEN N'Site / facility grouping'
        ELSE N'Metadata only'
    END AS match_type,
    o.source_site, o.displayed_site, o.mapping_found,
    o.source_bu, o.source_division, o.source_program, o.source_project,
    o.reporting_year, o.timeline,
    COUNT_BIG(*) AS row_count
FROM #OtdFacilities AS o
CROSS APPLY (
    SELECT DISTINCT term.target_site
    FROM #Terms AS term
    WHERE o.source_site LIKE term.search_pattern
       OR o.displayed_site LIKE term.search_pattern
       OR o.source_program LIKE term.search_pattern
       OR o.source_project LIKE term.search_pattern
       OR o.source_bu LIKE term.search_pattern
       OR o.source_division LIKE term.search_pattern
) AS hits
GROUP BY hits.target_site, o.source_site, o.displayed_site, o.mapping_found,
    o.source_bu, o.source_division, o.source_program, o.source_project,
    o.reporting_year, o.timeline
ORDER BY hits.target_site, match_type, o.source_site, o.reporting_year, o.timeline;

-- 4. Relevant groupings, including unused aliases and their OTD usage.
SELECT
    hits.target_site,
    m.original_site,
    m.grouped_site,
    COUNT_BIG(o.source_site) AS otd_rows_using_original
FROM #FacilityMap AS m
CROSS APPLY (
    SELECT DISTINCT term.target_site
    FROM #Terms AS term
    WHERE m.original_site LIKE term.search_pattern
       OR m.grouped_site LIKE term.search_pattern
) AS hits
LEFT JOIN #OtdFacilities AS o
    ON LOWER(LTRIM(RTRIM(o.source_site))) COLLATE DATABASE_DEFAULT =
       LOWER(m.original_site) COLLATE DATABASE_DEFAULT
GROUP BY hits.target_site, m.original_site, m.grouped_site
ORDER BY hits.target_site, m.grouped_site, m.original_site;

-- 5. Provenance in the facility-enabled datasets that feed global filters.
-- These are SQL-backed candidates, not proof that any individual UI cache is fresh.
CREATE TABLE #SourceFacilities (
    metric_source nvarchar(100) COLLATE DATABASE_DEFAULT NOT NULL,
    original_facility nvarchar(4000) COLLATE DATABASE_DEFAULT NULL,
    displayed_facility nvarchar(4000) COLLATE DATABASE_DEFAULT NULL,
    row_count bigint NOT NULL
);

INSERT INTO #SourceFacilities
SELECT N'OTD', source_site, displayed_site, COUNT_BIG(*)
FROM #OtdFacilities
GROUP BY source_site, displayed_site;

INSERT INTO #SourceFacilities
SELECT
    N'Safety (SIF / pSIF / Near Miss)',
    s.source_site,
    COALESCE(m.grouped_site, s.source_site),
    COUNT_BIG(*)
FROM (
    SELECT LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), [Site])))
        COLLATE DATABASE_DEFAULT AS source_site
    FROM [ecosystem_source].[qmi].[safety_events]
    WHERE TRY_CONVERT(date, [Date]) IS NOT NULL
) AS s
LEFT JOIN #FacilityMap AS m
    ON LOWER(s.source_site) COLLATE DATABASE_DEFAULT =
       LOWER(m.original_site) COLLATE DATABASE_DEFAULT
GROUP BY s.source_site, COALESCE(m.grouped_site, s.source_site);

INSERT INTO #SourceFacilities
SELECT
    N'New Controllable Costs', c.source_site,
    COALESCE(m.grouped_site, c.source_site), COUNT_BIG(*)
FROM (
    SELECT LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), facility)))
        COLLATE DATABASE_DEFAULT AS source_site
    FROM [ecosystem_source].[qmi].[controllable_costs_new_extract]
    WHERE TRY_CONVERT(int, [year]) >= 2025
      AND TRY_CONVERT(int, [month]) BETWEEN 1 AND 12
      AND TRY_CONVERT(float, cost) IS NOT NULL
) AS c
LEFT JOIN #FacilityMap AS m
    ON LOWER(c.source_site) COLLATE DATABASE_DEFAULT =
       LOWER(m.original_site) COLLATE DATABASE_DEFAULT
GROUP BY c.source_site, COALESCE(m.grouped_site, c.source_site);

-- New Labor's facility labels are derived from live labor cost centers and
-- costcenterkey city/state values (the same contributing sources as the app).
;WITH Hierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), COST_CENTER))))
            COLLATE DATABASE_DEFAULT AS cost_center,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), COST_CENTER))))
                COLLATE DATABASE_DEFAULT
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS rn
    FROM [DTO_Business_Management].[rpt].[rb_load_cost_center_hierarchy]
    WHERE LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), LEV02))) = N'NGRBT'
), LaborCenters AS (
    SELECT DISTINCT
        UPPER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), a.Cost_Center))))
            COLLATE DATABASE_DEFAULT AS cost_center
    FROM [DTO_Business_Management].[rpt].[rb_Actuals_RM_Load_Table] AS a
    JOIN Hierarchy AS h
        ON UPPER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), a.Cost_Center))))
           COLLATE DATABASE_DEFAULT = h.cost_center AND h.rn = 1
    WHERE NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), a.Cost_Center))), '') IS NOT NULL
      AND TRY_CONVERT(decimal(18,2), a.Hours) IS NOT NULL
      AND TRY_CONVERT(int, RIGHT(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), a.[Period]))), 4)) IS NOT NULL
      AND TRY_CONVERT(int, LEFT(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), a.[Period]))), 2)) BETWEEN 1 AND 12
), Keys AS (
    SELECT
        UPPER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), [Cost Center]))))
            COLLATE DATABASE_DEFAULT AS cost_center,
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), City)))
            COLLATE DATABASE_DEFAULT AS city,
        LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), State)))
            COLLATE DATABASE_DEFAULT AS state
    FROM [ecosystem_source].[qmi].[costcenterkey]
), CityStates AS (
    SELECT city, COUNT(DISTINCT NULLIF(UPPER(state), '')) AS state_count
    FROM Keys WHERE NULLIF(city, '') IS NOT NULL GROUP BY city
), RankedKeys AS (
    SELECT k.*,
        ROW_NUMBER() OVER (
            PARTITION BY cost_center
            ORDER BY CASE WHEN NULLIF(city, '') IS NULL THEN 1 ELSE 0 END,
                     city, state
        ) AS rn
    FROM Keys AS k WHERE NULLIF(cost_center, '') IS NOT NULL
)
INSERT INTO #SourceFacilities
SELECT
    N'New Labor Utilization',
    f.facility,
    COALESCE(m.grouped_site, f.facility),
    COUNT_BIG(*)
FROM LaborCenters AS c
LEFT JOIN RankedKeys AS k ON c.cost_center = k.cost_center AND k.rn = 1
LEFT JOIN CityStates AS cs ON k.city = cs.city
CROSS APPLY (VALUES (
    CASE WHEN NULLIF(k.city, '') IS NULL THEN N'Unmapped'
         WHEN COALESCE(cs.state_count, 0) > 1 AND NULLIF(k.state, '') IS NOT NULL
              THEN CONCAT(k.city, N', ', k.state)
         ELSE k.city END
)) AS f(facility)
LEFT JOIN #FacilityMap AS m
    ON LOWER(f.facility) COLLATE DATABASE_DEFAULT =
       LOWER(m.original_site) COLLATE DATABASE_DEFAULT
GROUP BY f.facility, COALESCE(m.grouped_site, f.facility);

SELECT
    hits.target_site,
    s.metric_source,
    s.original_facility,
    s.displayed_facility,
    s.row_count
FROM #SourceFacilities AS s
CROSS APPLY (
    SELECT DISTINCT term.target_site
    FROM #Terms AS term
    WHERE s.original_facility LIKE term.search_pattern
       OR s.displayed_facility LIKE term.search_pattern
) AS hits
ORDER BY hits.target_site, s.metric_source, s.displayed_facility, s.original_facility;

-- 6. Complete OTD Site inventory, to spot labels not covered by known aliases.
SELECT source_site, displayed_site, mapping_found,
       COUNT_BIG(*) AS row_count,
       MIN(reporting_year) AS first_year,
       MAX(reporting_year) AS last_year
FROM #OtdFacilities
GROUP BY source_site, displayed_site, mapping_found
ORDER BY displayed_site, source_site;
