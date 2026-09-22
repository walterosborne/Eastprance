# QMI Scorecard — Card Data Sources

Current visible cards on `entraid` (September 2026). SQL is the primary source where configured; some cards have local-file fallbacks.

# Controllable Costs

Shows the original report's controllable and uncontrollable facility costs over time.

- **`controllable_costs`** — Reported costs, quarters, years, addresses, categories, and cost elements.
- **`cost_element_key` and `cost_category_key`** — Classify reported costs as controllable or uncontrollable.

# SAP Costs — New Data

Shows signed SAP costs posted to the selected cost centers; this is not yet the finished facility-cost metric.

- **`DTO_Business_Management.src.rb_CVG_Transaction_Details_03`** — `KSL` amounts, posting periods, posting cost centers (`RCNTR`), G/L accounts (`RACCT`), and account descriptions.
- **`ecosystem_source.qmi.costcenterkey`** — Defines which posting cost centers are included; it does not supply cost amounts.
- **`DTO_Business_Management.rpt.rb_load_cost_center_hierarchy`** — Maps posting cost centers to division and business unit.
- **`data/costcenterkey.xlsx`** — Optional facility address, city, and state labels for cost centers; unmatched centers remain unmapped.

# SIF Incidents

Counts significant injury or fatality incidents over time.

- **`safety_events`** — Event dates, SIF flags, divisions, and sites.

# Potential SIF Incidents

Counts incidents classified as having potential for serious injury or fatality.

- **`safety_events`** — Event dates, pSIF flags, divisions, and sites; excludes events classified as actual SIFs.

# Near Miss Frequency Rate

Measures near-miss frequency using incidents and the Defense Systems employee count.

- **`safety_events`** — Near-miss incidents by month, division, and site.
- **`RosterExtractFarm`** — Distinct Defense Systems employees used as the rate denominator; the calculation also uses working days.

# On Time Delivery (OTD)

Compares delivered units against contract commitments over time.

- **`otd`** — Program, business unit, project, site, month, committed units, and actual delivered units.

# Direct Labor Utilization

Shows direct labor hours as a percentage of total labor hours in the original dataset.

- **`labor_utilization`** — Monthly hours by labor category, forecasted cost center, pool, and worker/time classifications.

# Labor Utilization — New Data

Shows direct hours as a percentage of direct plus indirect hours in the replacement dataset.

- **`DTO_Business_Management.rpt.rb_Actuals_RM_Load_Table`** — Period, cost center, direct/indirect labor category, and hours.
- **`DTO_Business_Management.rpt.rb_load_cost_center_hierarchy`** — Division and business unit from cost center.
- **`data/costcenterkey.xlsx`** — Optional facility labels from cost center.

*The HANA cost and labor cards are disabled in the current app and are not listed above. Legacy SQL-backed cards can fall back to bundled Excel/JSON data if their database reads fail; the two new-data cards have Excel fallbacks as well.*
