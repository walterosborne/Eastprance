/*
  QMI exploratory queries
  Read-only site and division coverage for safety events.
*/
SELECT DISTINCT
    LTRIM(RTRIM([Site])) AS [Site],
    LTRIM(RTRIM([Division])) AS [Division]
FROM [ecosystem_source].[qmi].[safety_events]
WHERE NULLIF(LTRIM(RTRIM([Site])), '') IS NOT NULL
-- AND [Site] IN ('Site 1', 'Site 2')  -- Narrow to a specific site list when available.
ORDER BY [Site], [Division];
