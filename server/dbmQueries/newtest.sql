SELECT
    COUNT(*) AS TOTAL_ROWS,
    COUNT(DISTINCT [Year]) AS YEAR_VALUES,
    COUNT(DISTINCT [Quarter]) AS QUARTER_VALUES
FROM ecosystem_source.qmi.controllable_costs;

SELECT
    [Year],
    [Quarter],
    COUNT(*) AS ROWS,
    SUM(TRY_CONVERT(DECIMAL(18,2), [Cost])) AS COST
FROM ecosystem_source.qmi.controllable_costs
GROUP BY [Year], [Quarter]
ORDER BY [Year], [Quarter];

SELECT TOP (10)
    [Cost Category],
    [Address],
    [Cost Element],
    [Cost Element Description],
    [Cost],
    [Quarter],
    [Year]
FROM ecosystem_source.qmi.controllable_costs;