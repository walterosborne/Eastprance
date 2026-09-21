// Each metric can be a plain string, a multiline string, an array of bullets,
// or objects like { text, bold, underline, bullet }. Whole-line markers also
// work: **bold**, __underlined__, and **__both__**. Bold markers can also
// appear within a line, such as "This value is **important** today."
const METRIC_INFO = {
  controllableCosts: 'Compares controllable and uncontrollable costs over time.',
  controllableCostsNew: [
    'SAP-only validation view, not yet Priscilla’s finished facility-cost or controllable-cost metric.',
    'Amounts are signed KSL from DTO_Business_Management.src.rb_CVG_Transaction_Details_03. Credits and reversals are retained.',
    'Includes every G/L account at cost centers in ecosystem_source.qmi.costcenterkey; no G/L whitelist or indirect non-labor filter.',
    'Division and business unit are looked up from posting cost center RCNTR. The optional costcenterkey.xlsx workbook supplies facility addresses; unmatched centers display as unmapped.',
    'Shows total net SAP cost without labeling unclassified transactions as controllable or uncontrollable. Weapon Systems outside the selected cost centers is not included.'
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
