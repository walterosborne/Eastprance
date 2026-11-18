-- Run this in Databricks to identify why the QMI cost card's ledger query returns zero.
-- Counts accumulate the same filters the app applies before joining hierarchy and lookups.
WITH normalized AS (
  SELECT
    TRY_CAST(GJAHR AS INT) AS year,
    TRY_CAST(POPER AS INT) AS month,
    UPPER(TRIM(CAST(RCNTR AS STRING))) AS cost_center,
    TRY_CAST(REGEXP_REPLACE(TRIM(CAST(RACCT AS STRING)), '^0+', '') AS BIGINT) AS gl_account_number,
    TRY_CAST(KSL AS DOUBLE) AS cost
  FROM `source_systems_dev`.`sql_central_integration`.`lfc_transaction_details_s3`
)
SELECT
  COUNT(*) AS all_ledger_rows,
  MIN(year) AS earliest_year,
  MAX(year) AS latest_year,
  SUM(CASE WHEN year >= 2025 THEN 1 ELSE 0 END) AS from_2025,
  SUM(CASE WHEN year >= 2025 AND month BETWEEN 1 AND 12 THEN 1 ELSE 0 END) AS valid_months,
  SUM(CASE WHEN year >= 2025 AND month BETWEEN 1 AND 12 AND year * 100 + month < YEAR(CURRENT_DATE()) * 100 + MONTH(CURRENT_DATE()) THEN 1 ELSE 0 END) AS completed_month_rows,
  SUM(CASE WHEN year >= 2025 AND month BETWEEN 1 AND 12 AND year * 100 + month < YEAR(CURRENT_DATE()) * 100 + MONTH(CURRENT_DATE()) AND cost IS NOT NULL THEN 1 ELSE 0 END) AS with_ksl,
  SUM(CASE WHEN year >= 2025 AND month BETWEEN 1 AND 12 AND year * 100 + month < YEAR(CURRENT_DATE()) * 100 + MONTH(CURRENT_DATE()) AND cost IS NOT NULL AND NULLIF(cost_center, '') IS NOT NULL THEN 1 ELSE 0 END) AS with_cost_center,
  SUM(CASE WHEN year >= 2025 AND month BETWEEN 1 AND 12 AND year * 100 + month < YEAR(CURRENT_DATE()) * 100 + MONTH(CURRENT_DATE()) AND cost IS NOT NULL AND NULLIF(cost_center, '') IS NOT NULL
    AND (
    gl_account_number BETWEEN 4100000 AND 4109999
    OR gl_account_number IN (
      8320037,
      4300305, 4300395, 4300591, 4300625, 4300626, 4300628, 4300630,
      4300643, 4300652, 4300666, 4300669, 4300671, 4300680, 4300698,
      4300699, 4300700, 4300701, 4300702, 4300703, 4300704, 4300705,
      4300805, 4300807, 4300852, 4300884, 4300887, 4301013, 4301048,
      4301049, 4301050, 4301077, 4301101, 4301102, 4301103, 4301104,
      4301231, 8320479
    )
  ) THEN 1 ELSE 0 END) AS matching_app_ledger_query
FROM normalized;
