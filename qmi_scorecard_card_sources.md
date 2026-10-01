# QMI Scorecard — Card Data Sources

Data sources used for the project are listed below, along with their database within server `RSSVAG-DB0262` in parentheses when applicable.

## Forecasting (ARIMA)

QMI forecasts use an ARIMA(1,0,1) time-series model through the open-source JavaScript `arima` package (`arima/async`). ARIMA uses the previous observation and previous forecast error to estimate the next period, allowing it to respond to recent movement while damping short-term noise. The same forecasting helper is used across Controllable Costs, Labor Utilization, SIF/pSIF, NMFR, and OTD. QMI requires at least 10 valid observations before fitting ARIMA; with fewer than 10, the expected value falls back to the arithmetic average of the available observations.

## Controllable Costs

- **`qmi.controllable_costs` (SQL Database: `ecosystem_source`)** — A table which is an upload of a business-provided **CRE Facility Report**, distributed [here](https://ngc.sharepoint.us/sites/NG00006569/sitepages/rates%20and%20budget.aspx?RootFolder=%2Fsites%2FNG00006569%2FRates%20and%20Budgets%2FFacility%20Reports%2FFacility%20BAV%20Detail&FolderCTID=0x012000F6F608A1E13EE34FA1C6D01D2804A7C2&View=%7B2A1C2718-2F1E-40ED-95AC-3D650969444E%7D) quarterly.

> The report linked above is generated quarterly using the upstream source titled **"CO Transaction Details - Multi-Dim (Real-Time)"** report from iERP. This covers only SDS and CWI division facilities; Weapons Systems facilities costs are obtained from individual WS POCs. The report reports costs, quarters, years, addresses, categories, and cost elements.

<Callout type="info" title="Automating in i2 ecosystem">
We pursue automation instead of direct ingest for three reasons:
<ul>
<li><strong>First</strong> is to improve upon the level of detail provided in the CRE Facility Report, which lacks critical details like Business Unit, Division, and Specific Dates.</li>
<li><strong>Second</strong> is to allow for more frequent updates (daily instead of quarterly).</li>
<li><strong>Third</strong> is to eliminate the reliance upon and cost of the manual labor associated with the current data collection process.</li>
</ul>
</Callout>

### **controllable_costs Metadata**

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Cost Element | `Cost Element` | Coding of general ledger account which yields the type of cost. Available only for CWI/SDS. |
| Cost Element Description | `Cost Element Description` | Description of the type of cost indicated by the Cost Element. |
| Cost Category | `Cost Category` | Cost type of the given expense, based on Cost Element for CWI/SDS. |
| Facility Address | `Address` | The street address of the record's associated facility. |
| Cost Amount | `Cost` | The amount of money spent on the provided cost at the provided facility. |
| Quarter | `Quarter` | The quarter in which the costs were accrued. |
| Year | `Year` | The year in which the costs were accrued. |

- **`qmi.cost_element_key` and `qmi.cost_category_key` (SQL Database: `ecosystem_source`)** — These are extracts of an assessment completed in 2022 which identified cost elements as controllable or uncontrollable. This assessment can be found at `data/controllable_assessment.xlsx`. The existing data is joined by cost element, or cost category when cost element is not assigned, to retrieve each record's controllability.

### **cost_category_key Metadata**

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Cost Category | `Cost Category` | An umbrella category type, starting with a number then text. |
| Controllable | `Controllable` | The category's status as generally controllable or not, as the strings 'Controllable' or 'Uncontrollable'. |

### **cost_element_key Metadata**

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Cost Category | `Cost Category` | The umbrella category the specific cost corresponds to. Matches cost_category_key. |
| Cost Element | `Cost Element` | The numerical code which identifies the cost account, and column for joining with cost data. |
| Cost Element Description | `Cost Element Description` | A text description of the cost. |
| Controllable | `Controllable` | The category's status as generally controllable or not, as the strings 'Controllable' or 'Uncontrollable'. |

## Controllable Costs — New Data

The replacement controllable cost data comes directly from SAP transaction data rather than the quarterly CRE Facility Report used above. This provides more detailed organizational information and allows the data to be updated daily instead of quarterly.

- **`src.rb_CVG_Transaction_Details_03` (SQL Database: `DTO_Business_Management`)** — A table in `DTO_Business_Management` used for Cognos reports. Contains signed cost amounts, fiscal years and posting periods, posting cost centers, selected facility G/L accounts, and descriptions. This only includes data for the CWI and SDS divisions; when WS goes to SAP in 2027 it will be roped in. Daily reporting.

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Year | `GJAHR` | Fiscal year associated with the transaction. |
| Posting Period | `POPER` | Fiscal posting period used as the reporting month. |
| Cost Amount | `KSL` | The signed SAP cost amount for the transaction. |
| Posting Cost Center | `RCNTR` | The cost center the transaction was posted against. Used to identify facility, division, and business unit. |
| G/L Account | `RACCT` | The general ledger account associated with the transaction. Used to select and classify facility-related costs. |
| G/L Description | `GL_TXT20` | Description of the G/L account associated with the transaction. |

- **`qmi.costcenterkey` (SQL Database: `ecosystem_source`)** — A hardcoded key between cost centers and facilities, obtained from Rates and Budget.

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Cost Center | `Cost Center` | Posting cost center used to join SAP transactions to a facility. |
| Facility Address | `Address` | Facility associated with the cost center. |
| City | `City` | City associated with the facility. |
| State | `State` | State associated with the facility. |

- **`rpt.rb_load_cost_center_hierarchy` (SQL Database: `DTO_Business_Management`)** — Maps posting cost centers to division and business unit.

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Cost Center | `COST_CENTER` | Cost center used to join the hierarchy to the SAP transaction data. |
| Division | `LEV03_DESC` | The division associated with the posting cost center. |
| Business Unit | `LEV04_DESC` | The business unit associated with the posting cost center. |

- **`qmi.cost_element_key` and `qmi.cost_category_key` (SQL Database: `ecosystem_source`)** — See above. These tables are used to determine whether the selected costs are controllable or uncontrollable.


## Safety Metrics

All safety metrics, including pSIF, SIF, and Near Miss are collected [here](https://oursites.myngc.com/DS/EHS/Tools/CEHS%20Metrics%20Data%20Collection/NM/NearMissCompliation.xlsx), an Excel sheet updated 2-3 times per month. The Excel sheet is then uploaded to SQL.

The same safety event data supports all three metrics.
<dl>
<dt>SIF</dt>
<dd>Reports events identified as an actual Significant Injury or Fatality</dd>
<dt>pSIF</dt>
<dd>Reports events identified as having the potential for a Significant Injury or Fatality and excludes events already classified as an actual SIF.</dd>
<dt>Near Miss Frequency Rate</dt>
<dd>Combines recorded near miss events with Defense Systems roster information and working days.</dd>
</dl>

<Callout type="info" title="Future Steps">
Data will be maintained in Cority starting in 2027.
</Callout>

- **`qmi.safety_events` (SQL Database: `ecosystem_source`)** — An extract of the Excel file linked above. Contains the event date, organizational information, location, and the classifications needed to identify SIF, pSIF, and Near Miss events.

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Event Date | `Date` | Date of the safety event. Used to report results by month, quarter, and year. |
| Division | `Division` | Division associated with the event. |
| Site | `Site` | Site associated with the event. |
| SIF | `SIF` | Flag identifying an actual Significant Injury or Fatality event. |
| pSIF | `pSIF` | Flag identifying an event with the potential for a Significant Injury or Fatality. |
| Near Miss | `Near Miss` | Flag identifying an event recorded as a near miss. |

- **`RosterExtractFarm`** — An extract of the official NG roster, refreshed with a SQL job daily. Distinct Defense Systems employees are used in the rate denominator for NMFR.

| Field | Column Name in Table | Description |
| --- | --- | --- |
| MyID | `MyID` | Six digit code familiar to most employees and used for distinct count of employees for the NMFR denominator. |
| Business Unit | `BusUnitLvl2NoCode` | Used to limit the roster denominator to Defense Systems employees. |

NMFR is calculated as `(200,000 × Near Miss Count) / (Defense Systems Employee Count × 8 × Working Days)`.

## On Time Delivery (OTD)

Absolute source of truth is [this Excel sheet](https://ngc.sharepoint.us/:x:/r/teams/DSSectorMI/Shared%20Documents/General/2%20%20ID%20Contract%20Commit%20Performance.xlsx?d=w77e1d2579302471fa8f9ba8f453d0d1b&csf=1&web=1&e=xWNObo). Updated at least monthly, contains selected business units.

The source workbook is normalized before being uploaded to SQL so that the different business unit sheets use a common structure. QMI compares the units identified as `Contract Commitment` against the corresponding `Actuals Delivered` values over time.

- **`qmi.otd` (SQL Database: `ecosystem_source`)** — Extract of above; program, business unit, project, site, month, committed units, and actual delivered units.

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Timeline | `Timeline` | Identifies whether the row contains Contract Commitment or Actuals Delivered values. |
| Program | `Program` | The program associated with the delivery commitment. |
| Business Unit | `BU` | The business unit associated with the program. |
| Project | `Project ID` | Project identifier associated with the delivery. |
| Site | `Site` | Site associated with the program or delivery. |
| Type | `Type` | Delivery type or grouping supplied by the source workbook where available. |
| Monthly Units | `JAN - DEC` | Monthly committed or delivered units, depending on the Timeline value. |
| Year | `Year` | Reporting year associated with the monthly values. |

## Labor Utilization

The existing labor utilization data comes from a Cognos report and is uploaded to SQL. The report provides monthly labor hours using cost center, labor category, and workforce classifications. QMI calculates direct labor utilization as direct labor hours divided by total labor hours.

- **`qmi.labor_utilization` (SQL Database: `ecosystem_source`)** — An extract of the Cognos report. The data contains monthly labor hours from January through December.

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Labor Category | `Labor Category` | Labor classification used to identify direct, indirect, and other labor. |
| Monthly Hours | `Jan - Dec` | Monthly labor hours used to calculate labor utilization. |

Labor Category values containing `Labor Direct` are treated as direct, values containing `Labor Indirect` are treated as indirect, and any remaining categories are grouped as `Other`.

## Labor Utilization — New Data

The replacement labor utilization data uses actual labor hours directly from DBM instead of the existing Cognos output. Cost center is used to add Division, Business Unit, and facility information before the data is displayed in QMI.

- **`rpt.rb_Actuals_RM_Load_Table` (SQL Database: `DTO_Business_Management`)** — The labor actuals source. Contains the reporting period, charged cost center, labor category, and entered hours used for the metric.

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Period | `Period` | Reporting month and year associated with the labor hours. |
| Cost Center | `Cost_Center` | Cost center charged by the labor actual. Used to identify Division, Business Unit, and facility. |
| Labor Category | `Labor_Category` | Source labor classification. Values are normalized into direct, indirect, or other labor. |
| Entered Hours | `Hours` | Actual labor hours summed for labor utilization reporting. |

- **`rpt.rb_load_cost_center_hierarchy` (SQL Database: `DTO_Business_Management`)** — Maps each cost center to Division and Business Unit.

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Cost Center | `COST_CENTER` | Cost center used to join the hierarchy to the labor actuals. |
| Division | `LEV03_DESC` | The division associated with the cost center. |
| Business Unit | `LEV04_DESC` | The business unit associated with the cost center. |

- **`data/costcenterkey.xlsx`** — A hardcoded key between cost centers and facilities, obtained from Rates and Budget. The new labor data joins to this key by cost center to add facility information.

| Field | Column Name in Table | Description |
| --- | --- | --- |
| Cost Center | `Cost Center` | Cost center used to join the labor data to a facility. |
| Facility Address | `Address` | Address associated with the cost center. |
| City | `City` | City associated with the facility and used as the facility label. |
| State | `State` | State associated with the facility. |

The replacement source groups the actual hours by year, month, Division, Business Unit, cost center, and labor category. Labor categories containing `Direct` or `Indirect` are grouped accordingly; unexpected values remain grouped as `Other`.

*Legacy SQL-backed cards can fall back to bundled Excel/JSON data if their database reads fail.*
