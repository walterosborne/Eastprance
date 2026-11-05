/*
  QMI exploratory queries
  Reuse this file for subsequent investigations.
  Read-only unless a future task explicitly requires a change.
*/

-- OTD: CWI - GC2S business-unit dropdown
-- Run only if the label is still missing after the latest OTD upload.
-- The OTD application obtains the dropdown value from [Business Unit].
SET NOCOUNT ON;

DECLARE @BusinessUnitSearch nvarchar(100) = N'GC2S';

SELECT
    TRY_CONVERT(int, [Year]) AS [Year],
    COALESCE(NULLIF(LTRIM(RTRIM([BU])), ''), '(blank)') AS [Workbook BU],
    COALESCE(NULLIF(LTRIM(RTRIM([Business Unit])), ''), '(blank)') AS [QMI Business Unit],
    COALESCE(NULLIF(LTRIM(RTRIM([Division])), ''), '(blank)') AS [Division],
    COUNT_BIG(*) AS [Records],
    COUNT(DISTINCT NULLIF(LTRIM(RTRIM([Program])), '')) AS [Programs]
FROM [ecosystem_source].[qmi].[otd]
WHERE [BU] LIKE N'%' + @BusinessUnitSearch + N'%'
   OR [Business Unit] LIKE N'%' + @BusinessUnitSearch + N'%'
GROUP BY
    TRY_CONVERT(int, [Year]),
    COALESCE(NULLIF(LTRIM(RTRIM([BU])), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM([Business Unit])), ''), '(blank)'),
    COALESCE(NULLIF(LTRIM(RTRIM([Division])), ''), '(blank)')
ORDER BY [Year] DESC, [Workbook BU], [QMI Business Unit];
