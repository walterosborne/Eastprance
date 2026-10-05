/*
  QMI global Facility filter with city grouping.

  IMPORTANT: Keep the real facility-to-city mapping out of source control.
  Paste the private mapping into FacilityCityMap locally when running the query.

  This otherwise mirrors server/sql/get_global_facilities.sql and returns:
    - Facility
    - City Group
*/

WITH CostFacilityMap AS (
    SELECT
        UPPER(LTRIM(RTRIM(COALESCE(
            TRY_CONVERT(nvarchar(255), source.cost_center),
            ''
        )))) COLLATE DATABASE_DEFAULT AS cost_center,
        MAX(NULLIF(LTRIM(RTRIM(COALESCE(
            TRY_CONVERT(nvarchar(4000), source.facility),
            ''
        ))), '')) COLLATE DATABASE_DEFAULT AS mapped_facility
    FROM [ecosystem_source].[qmi].[controllable_costs_new_extract] AS source
    WHERE TRY_CONVERT(int, source.[year]) >= 2025
    GROUP BY
        UPPER(LTRIM(RTRIM(COALESCE(
            TRY_CONVERT(nvarchar(255), source.cost_center),
            ''
        )))) COLLATE DATABASE_DEFAULT
),

ControllableCostFacilities AS (
    SELECT
        CASE
            WHEN NULLIF(LTRIM(RTRIM(COALESCE(
                TRY_CONVERT(nvarchar(4000), source.facility),
                ''
            ))), '') IS NOT NULL
                THEN LTRIM(RTRIM(TRY_CONVERT(nvarchar(4000), source.facility)))
            WHEN facility_map.mapped_facility IS NOT NULL
                THEN facility_map.mapped_facility
            WHEN NULLIF(LTRIM(RTRIM(COALESCE(
                TRY_CONVERT(nvarchar(255), source.cost_center),
                ''
            ))), '') IS NOT NULL
                THEN CONCAT(
                    'Unmapped (CC ',
                    UPPER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), source.cost_center)))),
                    ')'
                )
            ELSE 'Unmapped'
        END COLLATE DATABASE_DEFAULT AS facility
    FROM [ecosystem_source].[qmi].[controllable_costs_new_extract] AS source
    LEFT JOIN CostFacilityMap AS facility_map
        ON UPPER(LTRIM(RTRIM(COALESCE(
            TRY_CONVERT(nvarchar(255), source.cost_center),
            ''
        )))) COLLATE DATABASE_DEFAULT = facility_map.cost_center
    WHERE TRY_CONVERT(int, source.[year]) >= 2025
      AND TRY_CONVERT(int, source.[month]) BETWEEN 1 AND 12
      AND TRY_CONVERT(float, source.cost) IS NOT NULL
),

SafetyFacilities AS (
    SELECT
        LTRIM(RTRIM(COALESCE(
            TRY_CONVERT(nvarchar(4000), source.[Site]),
            ''
        ))) COLLATE DATABASE_DEFAULT AS facility
    FROM [ecosystem_source].[qmi].[safety_events] AS source
    WHERE TRY_CONVERT(date, source.[Date]) IS NOT NULL
),

OtdFacilities AS (
    SELECT
        LTRIM(RTRIM(COALESCE(
            TRY_CONVERT(nvarchar(4000), source.[Site]),
            ''
        ))) COLLATE DATABASE_DEFAULT AS facility
    FROM [ecosystem_source].[qmi].[otd] AS source
),

LaborHierarchy AS (
    SELECT
        UPPER(LTRIM(RTRIM(COALESCE(
            TRY_CONVERT(nvarchar(255), source.COST_CENTER),
            ''
        )))) COLLATE DATABASE_DEFAULT AS cost_center,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(COALESCE(
                TRY_CONVERT(nvarchar(255), source.COST_CENTER),
                ''
            )))) COLLATE DATABASE_DEFAULT
            ORDER BY
                source.last_modified_date DESC,
                source.created_date DESC,
                source.id DESC
        ) AS rn
    FROM [DTO_Business_Management].[rpt].[rb_load_cost_center_hierarchy] AS source
    WHERE LTRIM(RTRIM(COALESCE(
        TRY_CONVERT(nvarchar(255), source.LEV02),
        ''
    ))) = 'NGRBT'
),

LaborCostCenters AS (
    SELECT DISTINCT
        UPPER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), actuals.Cost_Center))))
            COLLATE DATABASE_DEFAULT AS cost_center
    FROM [DTO_Business_Management].[rpt].[rb_Actuals_RM_Load_Table] AS actuals
    JOIN LaborHierarchy AS hierarchy
        ON UPPER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), actuals.Cost_Center))))
            COLLATE DATABASE_DEFAULT = hierarchy.cost_center
       AND hierarchy.rn = 1
    WHERE NULLIF(LTRIM(RTRIM(COALESCE(
              TRY_CONVERT(nvarchar(255), actuals.Cost_Center),
              ''
          ))), '') IS NOT NULL
      AND TRY_CONVERT(decimal(18,2), actuals.Hours) IS NOT NULL
      AND TRY_CONVERT(
              int,
              RIGHT(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), actuals.[Period]))), 4)
          ) IS NOT NULL
      AND TRY_CONVERT(
              int,
              LEFT(LTRIM(RTRIM(TRY_CONVERT(nvarchar(255), actuals.[Period]))), 2)
          ) BETWEEN 1 AND 12
),

CostCenterKeyRaw AS (
    SELECT
        UPPER(LTRIM(RTRIM(COALESCE(
            TRY_CONVERT(nvarchar(255), source.[Cost Center]),
            ''
        )))) COLLATE DATABASE_DEFAULT AS cost_center,
        LTRIM(RTRIM(COALESCE(
            TRY_CONVERT(nvarchar(4000), source.[City]),
            ''
        ))) COLLATE DATABASE_DEFAULT AS city,
        LTRIM(RTRIM(COALESCE(
            TRY_CONVERT(nvarchar(255), source.[State]),
            ''
        ))) COLLATE DATABASE_DEFAULT AS state,
        UPPER(LTRIM(RTRIM(COALESCE(
            TRY_CONVERT(nvarchar(255), source.[State]),
            ''
        )))) COLLATE DATABASE_DEFAULT AS state_key
    FROM [ecosystem_source].[qmi].[costcenterkey] AS source
    WHERE NULLIF(LTRIM(RTRIM(COALESCE(
        TRY_CONVERT(nvarchar(255), source.[Cost Center]),
        ''
    ))), '') IS NOT NULL
),

CityStateCounts AS (
    SELECT
        city,
        COUNT(DISTINCT NULLIF(state_key, '')) AS state_count
    FROM CostCenterKeyRaw
    WHERE NULLIF(city, '') IS NOT NULL
    GROUP BY city
),

CostCenterKeyRanked AS (
    SELECT
        source.cost_center,
        source.city,
        source.state,
        ROW_NUMBER() OVER (
            PARTITION BY source.cost_center
            ORDER BY
                CASE WHEN NULLIF(source.city, '') IS NOT NULL THEN 0 ELSE 1 END,
                source.city,
                source.state
        ) AS rn
    FROM CostCenterKeyRaw AS source
),

LaborFacilityKey AS (
    SELECT
        source.cost_center,
        CASE
            WHEN NULLIF(source.city, '') IS NULL THEN 'Unmapped'
            WHEN COALESCE(city_states.state_count, 0) > 1
                 AND NULLIF(source.state, '') IS NOT NULL
                THEN CONCAT(source.city, ', ', source.state)
            ELSE source.city
        END COLLATE DATABASE_DEFAULT AS facility
    FROM CostCenterKeyRanked AS source
    LEFT JOIN CityStateCounts AS city_states
        ON source.city = city_states.city
    WHERE source.rn = 1
),

LaborFacilities AS (
    SELECT
        COALESCE(facility_key.facility, 'Unmapped') COLLATE DATABASE_DEFAULT AS facility
    FROM LaborCostCenters AS labor
    LEFT JOIN LaborFacilityKey AS facility_key
        ON labor.cost_center = facility_key.cost_center
),

AllFacilities AS (
    SELECT facility FROM ControllableCostFacilities
    UNION ALL
    SELECT facility FROM SafetyFacilities
    UNION ALL
    SELECT facility FROM OtdFacilities
    UNION ALL
    SELECT facility FROM LaborFacilities
),

DistinctFacilities AS (
    SELECT DISTINCT
        LTRIM(RTRIM(facility)) COLLATE DATABASE_DEFAULT AS facility
    FROM AllFacilities
    WHERE NULLIF(LTRIM(RTRIM(facility)), '') IS NOT NULL
),

/*
  PRIVATE MAPPING GOES HERE.

  Replace this empty CTE locally with the VALUES block provided outside GitHub, e.g.:

  FacilityCityMap AS (
      SELECT *
      FROM (VALUES
          -- ('facility value', 'city group'),
          -- ('another facility value', 'city group')
      ) AS mapping(facility, city_group)
  )

  Do not commit the populated mapping.
*/
FacilityCityMap AS (
    SELECT
        CAST(NULL AS nvarchar(4000)) COLLATE DATABASE_DEFAULT AS facility,
        CAST(NULL AS nvarchar(4000)) COLLATE DATABASE_DEFAULT AS city_group
    WHERE 1 = 0
)

SELECT
    facilities.facility AS Facility,
    mapping.city_group AS [City Group]
FROM DistinctFacilities AS facilities
LEFT JOIN FacilityCityMap AS mapping
    ON facilities.facility = mapping.facility
ORDER BY
    COALESCE(mapping.city_group, facilities.facility),
    facilities.facility;
