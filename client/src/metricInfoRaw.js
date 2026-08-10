// Each metric can be a plain string, a multiline string, an array of bullets,
// or objects like { text, bold, underline, bullet }. Whole-line markers also
// work: **bold**, __underlined__, and **__both__**.
const METRIC_INFO = {
  controllableCosts: 'Compares controllable and uncontrollable costs over time.',
  controllableCostsHana: 'Shows total HANA costs over time by organization.',
  sif: 'Counts significant injuries or fatalities over time.',
  potentialSif: 'Counts potential serious injury or fatality incidents.',
  nmfr: 'Tracks near miss frequency rate across periods.',
  otd: 'Compares committed units against actual delivered units.',
  labor: 'Shows direct labor hours as percent of total.',
  laborHana: 'Shows HANA direct labor hours as percent of total.'
};

export { METRIC_INFO };
