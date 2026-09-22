// Each metric can be a plain string, a multiline string, an array of bullets,
// or objects like { text, bold, underline, bullet }. Whole-line markers also
// work: **bold**, __underlined__, and **__both__**. Bold markers can also
// appear within a line, such as "This value is **important** today."
const METRIC_INFO = {
  controllableCosts: 'Legacy controllable costs with only rows having a populated numeric Cost Element; this removes Weapon Systems rows without Cost Elements for the interim comparison.',
  controllableCostsNew: [
    'Working SAP facility-cost estimate for CWI and SDS; Weapon Systems excluded. It is not the final controllability metric.',
    'Uses signed KSL from DTO_Business_Management.src.rb_CVG_Transaction_Details_03, matched by posting cost center RCNTR to the current organization hierarchy.',
    'Includes physical-facility cost centers from the live ecosystem_source.qmi.costcenterkey and the six central SDS support centers under Strategic Deterrent Facility/Operations.',
    'Uses selected facility G/L accounts for labor, rent, depreciation/LHI, taxes, insurance, maintenance, services and utilities. Other, unclassified and review-only accounts are excluded; credits and reversals remain signed.',
    'Known limitation: SAP G/L 4100000 gross timecard labor is missing from the extract. Central SDS Other is provisionally associated with overhead depreciation/LHI, with an $8,603.51 Q1 2026 difference; no adjustment is added.'
  ],
  controllableCostsHana: 'Shows total HANA costs over time by organization.',
  sif: 'Counts significant injuries or fatalities over time.',
  potentialSif: 'Counts potential serious injury or fatality incidents.',
  nmfr: 'Tracks near miss frequency rate across periods.',
  otd: 'Compares committed units against actual delivered units.',
  labor: 'Shows direct labor hours as percent of total.',
  laborNew: 'Shows direct labor hours as percent of direct plus indirect hours in the replacement dataset.',
  laborHana: 'Shows HANA direct labor hours as percent of total.'
};

export { METRIC_INFO };
