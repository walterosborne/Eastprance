import { getCachedSqlDataset } from '../sqlDatasetCache.js';
import { getSafetyMetricPayload } from '../sifRepository.js';
import { readLaborUtilizationNewData } from '../laborUtilizationNewRepository.js';
import { logError } from '../debugLogger.js';
import { assessCardMonth, isScorecardSourceRow } from '../../shared/scorecardMonths.mjs';
import { getLastCompletedMonthStamp } from '../../shared/latestMonthOutlier.mjs';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 4 });
const month = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const cached = (scope) => () => getCachedSqlDataset(scope);
const safety = (scope, key) => async () => getSafetyMetricPayload(await getCachedSqlDataset(scope), key);

const cards = [
  { key: 'controllableCostsNew', title: 'Controllable Costs', format: currency, read: cached('controllable-costs-databricks-new') },
  { key: 'laborNew', title: 'Labor Utilization', format: percent, read: readLaborUtilizationNewData },
  { key: 'nmfr', title: 'Near Miss Frequency Rate', format: number, read: safety('safety-nmfr', 'nmfr') },
  { key: 'otd', title: 'On Time Delivery (OTD)', format: percent, read: cached('otd') },
  { key: 'customerEscapes', title: 'Customer Escapes', format: number, read: cached('customer-escapes') },
  { key: 'potentialSif', title: 'Potential SIF Incidents', format: number, read: safety('safety-incidents', 'potentialSif') },
  { key: 'sif', title: 'SIF Incidents', format: number, read: safety('safety-incidents', 'sif') }
];

export async function renderOutlierReport(now = new Date()) {
  const lastCompletedMonth = getLastCompletedMonthStamp(now);
  const rows = await Promise.all(cards.map(async ({ key, title, format, read }) => {
    let result;
    try {
      const payload = await read();
      const scope = payload.rows.filter(row => isScorecardSourceRow(row, key));
      result = assessCardMonth(scope, key, lastCompletedMonth);
    } catch (error) {
      logError('outlier-test', `Unable to assess ${key}.`, error);
      return `<tr><th scope="row">${title}</th><td colspan="6">Data unavailable</td></tr>`;
    }
    const { stamp, value, lower, upper, historyCount, processingMonth } = result;
    const display = n => Number.isFinite(n) ? format.format(n) : '—';
    let decision = 'Shown';
    if (stamp === null) decision = 'No completed data';
    else if (lower === null) decision = 'Shown (insufficient history)';
    else if (processingMonth !== null) decision = value < lower ? 'Hidden (below range)' : 'Hidden (above range)';
    return `<tr><th scope="row">${title}</th><td>${stamp === null ? '—' : month.format(stamp)}</td>
      <td>${display(value)}</td><td>${display(lower)}</td><td>${display(upper)}</td>
      <td>${historyCount}</td><td>${decision}</td></tr>`;
  }));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Latest-month outlier report</title><style>
    body{font:16px/1.5 system-ui;margin:4vw;color:#172536}p{max-width:85ch}.scroll{overflow-x:auto}
    table{border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:.6rem .8rem;text-align:right;border-bottom:1px solid #ccd2d7}
    th:first-child,td:last-child{text-align:left}thead{background:#edf2f5}tbody th{white-space:nowrap}</style></head>
    <body><main><h1>Latest-month outlier report</h1>
    <p>All divisions, business units and facilities. Each card tests its newest observed completed month against the previous 6–12 observed months. A value on either cutoff is included. The test uses full precision. Dashboard filters can change the result.</p>
    <div class="scroll"><table><thead><tr><th>Card</th><th>Month tested</th><th>Actual</th><th>Lower cutoff</th><th>Upper cutoff</th><th>Prior months</th><th>Decision</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>
    <p>There is no scheduled release day. A hidden month is shown when its value returns inside the range on refresh, or when a newer completed month has a usable value for that card.</p></main></body></html>`;
}
