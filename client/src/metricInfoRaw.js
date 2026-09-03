// Each metric can be a plain string, a multiline string, an array of bullets,
// or objects like { text, bold, underline, bullet }. Whole-line markers also
// work: **bold**, __underlined__, and **__both__**. Bold markers can also
// appear within a line, such as "This value is **important** today."
const METRIC_INFO = {
  controllableCosts: 'Compares controllable and uncontrollable costs over time.',
  controllableCostsNew: [
    'Validation view of the replacement DBM cost dataset; this is not yet the final facility-cost metric.',
    'All current DS indirect non-labor rows are retained. Organization is mapped from each transaction posting cost center (RCNTR) through the current cost-center hierarchy, so Weapon Systems can be viewed directly.',
    'Physical facility mapping is still unresolved. Employee/Archibus locations did not reliably represent the posting cost center, so the card shows the posting cost center as unmapped instead of assigning a physical facility.',
    'Controllability is still provisional. Rows matching the current Cost Element key are classified; unmatched rows are retained as Unclassified instead of being dropped. In the Q1 2026 legacy comparison, only about $8.4M of $74.6M (~11%) was on rows with a populated Cost Element.'
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
