// Each metric can be a plain string, a multiline string, an array of bullets,
// or objects like { text, bold, underline, bullet }. Whole-line markers also
// work: **bold**, __underlined__, and **__both__**. Bold markers can also
// appear within a line, such as "This value is **important** today."
const METRIC_INFO = {
  controllableCosts: 'Legacy controllable costs with only rows having a populated numeric Cost Element; this removes Weapon Systems rows without Cost Elements for the interim comparison.',
  controllableCostsNew: [
    'Controllable Costs uses signed KSL from source_systems_dev.sql_central_integration.lfc_transaction_details_s3 in Databricks. Weapon Systems data is not present until 2027.',
    'Fiscal year and posting period define each month. Posting cost center maps to Division and Business Unit through the DBM hierarchy and to Facility through qmi.costcenterkey.',
    'CWI and SDS use their division-specific G/L account and cost-category rules. Six central SDS support centers appear under Strategic Deterrent Facility/Operations.',
    'Controllable / Uncontrollable comes from cost_element_key, then cost_category_key where needed. Unmatched accounts remain Unclassified and stay in the total.'
  ],
  controllableCostsDatabricksProcessed: [
    'Comparison view from finance_dev.analytics.cost_vis_full in Databricks, filtered to Defense Systems.',
    'Uses signed DOC_NET_VALUE and aggregates in Databricks before QMI dimension joins.',
    'Division and Business Unit come from the latest cost-center hierarchy row; Facility comes from costcenterkey.',
    'G/L accounts are normalized for leading zeros and restricted to the same controllable-cost G/L population used by the SQL source.',
    'This is the processed Databricks comparison and does not replace the current Controllable Costs source.'
  ],
  controllableCostsDatabricksRaw: [
    'Raw comparison view from finance_dev.analytics.dev_cv_transaction_details in Databricks.',
    'Uses GJAHR, POPER, RCNTR, RACCT, GL_TXT50 and signed DOC_NET_VALUE.',
    'Division and Business Unit come from the latest cost-center hierarchy row; Facility comes from costcenterkey, including the six central SDS support centers under Strategic Deterrent Facility/Operations.',
    'RACCT is normalized for leading zeros, then filtered and categorized with the same division-specific CWI and SDS G/L rules used by the SQL controllable-cost extract.',
    'Controllable / Uncontrollable comes from cost_element_key, then cost_category_key where needed. This is the raw Databricks comparison and does not replace the current Controllable Costs source.'
  ],
  sif: 'Counts significant injuries or fatalities over time.',
  potentialSif: 'Counts potential serious injury or fatality incidents.',
  nmfr: 'Tracks near miss frequency rate across periods.',
  otd: 'Compares committed units against actual delivered units.',
  labor: 'Shows direct labor hours as percent of total.',
  laborNew: 'Shows direct labor hours as percent of direct plus indirect hours.',
  laborHana: 'Shows HANA direct labor hours as percent of total.'
};

export { METRIC_INFO };
