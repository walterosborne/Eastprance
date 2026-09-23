# QMI Scorecard — Card Data Sources

Visible scorecard cards on `entraid` (September 2026). SQL is the primary source where configured.

## Controllable Costs

Shows the original report's controllable and uncontrollable facility costs over time, currently limited to records with a populated numeric Cost Element.

- **`controllable_costs`** — Reported costs, quarters, years, addresses, categories, and cost elements.
- **`cost_element_key` and `cost_category_key`** — Classify reported costs as controllable or uncontrollable.

## Controllable Costs — New Data

Shows the working SAP facility-cost reconstruction for CWI and SDS, excluding Weapon Systems. Amounts are signed and the gross timecard labor account `4100000` is missing from the SAP extract.

- **`ecosystem_source.qmi.controllable_costs_new_extract`** — Dashboard reads the precomputed, monthly CWI/SDS facility-cost extract; the app does not execute the heavy SAP reconstruction on each request.
- **`server/sql/create_qmi_controllable_costs_new_extract.sql`** — One-time table creation and daily refresh body. The refresh derives signed `KSL` from `DTO_Business_Management.src.rb_CVG_Transaction_Details_03`, preserves the selected G/L categories and central SDS logic, and must run before the app switches to this table.
- **`ecosystem_source.qmi.costcenterkey`** — Selects mapped physical-facility cost centers and supplies facility labels; six additional central SDS support centers are grouped under Strategic Deterrent Facility/Operations.
- **`DTO_Business_Management.rpt.rb_load_cost_center_hierarchy`** — Maps posting cost centers to division and business unit.
- **`cost_element_key` and `cost_category_key`** — Assign Controllable or Uncontrollable status; costs without a matching classification remain Unclassified.

## Safety Metrics

### SIF Incidents

Counts significant injury or fatality incidents over time.

- **`safety_events`** — Event dates, SIF flags, divisions, and sites.

### Potential SIF Incidents

Counts incidents classified as having potential for serious injury or fatality.

- **`safety_events`** — Event dates, pSIF flags, divisions, and sites; excludes events classified as actual SIFs.

### Near Miss Frequency Rate

Measures near-miss frequency using incidents and the Defense Systems employee count.

- **`safety_events`** — Near-miss incidents by month, division, and site.
- **`RosterExtractFarm`** — Distinct Defense Systems employees used as the rate denominator; the calculation also uses working days.

## On Time Delivery (OTD)

Compares delivered units against contract commitments over time.

- **`otd`** — Program, business unit, project, site, month, committed units, and actual delivered units.

## Labor Utilization

Shows direct labor hours as a percentage of total labor hours in the original dataset.

- **`labor_utilization`** — Monthly hours by labor category, forecasted cost center, pool, and worker/time classifications.

## Labor Utilization — New Data

Shows direct hours as a percentage of direct plus indirect hours in the replacement dataset.

- **`DTO_Business_Management.rpt.rb_Actuals_RM_Load_Table`** — Period, cost center, direct/indirect labor category, and hours.
- **`DTO_Business_Management.rpt.rb_load_cost_center_hierarchy`** — Division and business unit from cost center.
- **`data/costcenterkey.xlsx`** — Optional facility labels from cost center.

*Legacy SQL-backed cards can fall back to bundled Excel/JSON data if their database reads fail.*
