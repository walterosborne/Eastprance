/*
Fixed replacement for Query 14.

Why the original failed:
- The SSMS connection is in DTO_Business_Management / DBM.
- The legacy controllable_costs table is used by the app's old-data connection and
  is not in the current DBM database, so an unqualified FROM controllable_costs fails.

This script first searches every database on the current SQL Server that the user
can access for a table named controllable_costs. If found, it loads the Q1 2026
legacy GL/category set into #LegacyElement, then benchmarks those exact GLs against
rpt.rb_Actuals_CP_CC_Summary_Validation.
*/

SET NOCOUNT ON;

IF OBJECT_ID('tempdb..#LegacySources') IS NOT NULL DROP TABLE #LegacySources;
IF OBJECT_ID('tempdb..#LegacyElement') IS NOT NULL DROP TABLE #LegacyElement;

CREATE TABLE #LegacySources (
    DatabaseName sysname NOT NULL,
    SchemaName sysname NOT NULL
);

DECLARE @db sysname;
DECLARE @findSql nvarchar(max);

DECLARE db_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT name
FROM sys.databases
WHERE state_desc = 'ONLINE'
  AND HAS_DBACCESS(name) = 1;

OPEN db_cursor;
FETCH NEXT FROM db_cursor INTO @db;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @findSql = N'
        INSERT INTO #LegacySources (DatabaseName, SchemaName)
        SELECT ' + QUOTENAME(@db, '''') + N', S.name
        FROM ' + QUOTENAME(@db) + N'.sys.tables T
        JOIN ' + QUOTENAME(@db) + N'.sys.schemas S
          ON S.schema_id = T.schema_id
        WHERE T.name = ''controllable_costs'';';

    BEGIN TRY
        EXEC sys.sp_executesql @findSql;
    END TRY
    BEGIN CATCH
        -- Ignore databases visible in sys.databases but not readable enough for metadata.
    END CATCH;

    FETCH NEXT FROM db_cursor INTO @db;
END

CLOSE db_cursor;
DEALLOCATE db_cursor;

SELECT DatabaseName, SchemaName
FROM #LegacySources
ORDER BY DatabaseName, SchemaName;

IF NOT EXISTS (SELECT 1 FROM #LegacySources)
BEGIN
    THROW 50001, 'controllable_costs was not found in any database accessible from this DBM SQL Server. The old app source is probably on a different server/connection. Send this message back; do not keep troubleshooting.', 1;
END;

DECLARE @legacyDb sysname;
DECLARE @legacySchema sysname;
SELECT TOP (1)
    @legacyDb = DatabaseName,
    @legacySchema = SchemaName
FROM #LegacySources
ORDER BY
    CASE WHEN SchemaName = 'dbo' THEN 0 ELSE 1 END,
    DatabaseName,
    SchemaName;

CREATE TABLE #LegacyElement (
    COST_ELEMENT bigint NOT NULL,
    LEGACY_CATEGORY nvarchar(4000) NULL,
    LEGACY_COST decimal(38,2) NULL
);

DECLARE @loadLegacySql nvarchar(max) = N'
WITH LegacyByElementCategory AS (
    SELECT
        TRY_CONVERT(BIGINT, [Cost Element]) AS COST_ELEMENT,
        LTRIM(RTRIM(CONVERT(nvarchar(4000), [Cost Category]))) AS LEGACY_CATEGORY,
        SUM(TRY_CONVERT(DECIMAL(38,2), [Cost])) AS LEGACY_COST,
        SUM(ABS(TRY_CONVERT(DECIMAL(38,2), [Cost]))) AS LEGACY_ABS_COST
    FROM ' + QUOTENAME(@legacyDb) + N'.' + QUOTENAME(@legacySchema) + N'.[controllable_costs]
    WHERE TRY_CONVERT(INT, [Year]) = 2026
      AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(100), [Quarter])))) = ''Q1''
      AND TRY_CONVERT(BIGINT, [Cost Element]) IS NOT NULL
    GROUP BY
        TRY_CONVERT(BIGINT, [Cost Element]),
        LTRIM(RTRIM(CONVERT(nvarchar(4000), [Cost Category])))
), Ranked AS (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY COST_ELEMENT
            ORDER BY LEGACY_ABS_COST DESC, LEGACY_CATEGORY
        ) AS RN
    FROM LegacyByElementCategory
)
SELECT COST_ELEMENT, LEGACY_CATEGORY, LEGACY_COST
FROM Ranked
WHERE RN = 1;';

INSERT INTO #LegacyElement (COST_ELEMENT, LEGACY_CATEGORY, LEGACY_COST)
EXEC sys.sp_executesql @loadLegacySql;

-- Small sanity check: should be about the same legacy-element count we saw on the page.
SELECT
    @legacyDb AS LEGACY_DATABASE,
    @legacySchema AS LEGACY_SCHEMA,
    COUNT(*) AS LEGACY_ELEMENT_COUNT,
    SUM(LEGACY_COST) AS LEGACY_Q1_COST
FROM #LegacyElement;

WITH CurrentHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS CURRENT_DIVISION,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV04_DESC)), ''), 'Unmapped') AS CURRENT_BU,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
), ValidationExact AS (
    SELECT
        L.LEGACY_CATEGORY,
        L.COST_ELEMENT,
        COALESCE(NULLIF(LTRIM(RTRIM(V.LEV03_DESC)), ''), '(blank)') AS VALIDATION_DIVISION,
        COALESCE(NULLIF(LTRIM(RTRIM(V.LEV04_DESC)), ''), '(blank)') AS VALIDATION_BU,
        COALESCE(H.CURRENT_DIVISION, 'No current hierarchy match') AS CURRENT_DIVISION,
        COALESCE(H.CURRENT_BU, 'No current hierarchy match') AS CURRENT_BU,
        UPPER(LTRIM(RTRIM(V.COST_CENTER))) AS COST_CENTER,
        TRY_CONVERT(DECIMAL(38,2), V.Dollars) AS DOLLARS
    FROM rpt.rb_Actuals_CP_CC_Summary_Validation V
    JOIN #LegacyElement L
      ON TRY_CONVERT(BIGINT, V.ACCT_ID) = L.COST_ELEMENT
    LEFT JOIN CurrentHierarchy H
      ON H.COST_CENTER = UPPER(LTRIM(RTRIM(V.COST_CENTER)))
     AND H.RN = 1
    WHERE LTRIM(RTRIM(V.Period)) IN ('202601','202602','202603')
)
SELECT TOP (200)
    E.LEGACY_CATEGORY,
    E.VALIDATION_DIVISION,
    E.CURRENT_DIVISION,
    COUNT(DISTINCT E.COST_ELEMENT) AS MATCHED_LEGACY_GLS,
    COUNT(DISTINCT E.COST_CENTER) AS COST_CENTER_COUNT,
    SUM(E.DOLLARS) AS VALIDATION_EXACT_GL_DOLLARS,
    SUM(ABS(E.DOLLARS)) AS VALIDATION_EXACT_GL_ABS_DOLLARS
FROM ValidationExact E
GROUP BY E.LEGACY_CATEGORY, E.VALIDATION_DIVISION, E.CURRENT_DIVISION
ORDER BY ABS(SUM(E.DOLLARS)) DESC;

WITH CurrentHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COST_CENTER))) AS COST_CENTER,
        COALESCE(NULLIF(LTRIM(RTRIM(LEV03_DESC)), ''), 'Unmapped') AS CURRENT_DIVISION,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COST_CENTER)))
            ORDER BY last_modified_date DESC, created_date DESC, id DESC
        ) AS RN
    FROM rpt.rb_load_cost_center_hierarchy
), ExactRows AS (
    SELECT
        COALESCE(NULLIF(LTRIM(RTRIM(V.LEV03_DESC)), ''), '(blank)') AS VALIDATION_DIVISION,
        COALESCE(H.CURRENT_DIVISION, 'No current hierarchy match') AS CURRENT_DIVISION,
        TRY_CONVERT(DECIMAL(38,2), V.Dollars) AS DOLLARS
    FROM rpt.rb_Actuals_CP_CC_Summary_Validation V
    JOIN #LegacyElement L
      ON TRY_CONVERT(BIGINT, V.ACCT_ID) = L.COST_ELEMENT
    LEFT JOIN CurrentHierarchy H
      ON H.COST_CENTER = UPPER(LTRIM(RTRIM(V.COST_CENTER)))
     AND H.RN = 1
    WHERE LTRIM(RTRIM(V.Period)) IN ('202601','202602','202603')
)
SELECT
    VALIDATION_DIVISION,
    CURRENT_DIVISION,
    SUM(DOLLARS) AS EXACT_LEGACY_GL_DOLLARS,
    SUM(ABS(DOLLARS)) AS EXACT_LEGACY_GL_ABS_DOLLARS
FROM ExactRows
GROUP BY VALIDATION_DIVISION, CURRENT_DIVISION
ORDER BY
    CASE WHEN VALIDATION_DIVISION = 'DS Weapon Systems' OR CURRENT_DIVISION = 'DS Weapon Systems' THEN 0 ELSE 1 END,
    ABS(SUM(DOLLARS)) DESC;
