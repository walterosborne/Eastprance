// Each metric can be a plain string, a multiline string, an array of bullets,
// or objects like { text, bold, underline, bullet }. Whole-line markers also
// work: **bold**, __underlined__, and **__both__**. Bold markers can also
// appear within a line, such as "This value is **important** today."
const METRIC_INFO = {
  controllableCosts: 'Compares controllable and uncontrollable costs over time.',
  controllableCostsNew: [
    'Validation view of the replacement DBM cost dataset; this is not yet the final facility-cost metric.',
    'Organization is mapped from each transaction posting cost center (RCNTR) through the current cost-center hierarchy.',
    'Physical facility is mapped from normalized RCNTR values through the cost-center key; unmatched cost centers remain labeled as unmapped.',
    'Only transactions whose G/L account matches a Cost Element key are included, and the matching key determines controllability.'
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
