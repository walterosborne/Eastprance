import XLSX from 'xlsx';
import { getCachedSqlDataset } from '../sqlDatasetCache.js';
import { getSafetyMetricPayload } from '../sifRepository.js';
import { readLaborUtilizationNewData } from '../laborUtilizationNewRepository.js';
import { logError } from '../debugLogger.js';
import { buildCardMonthlyPoints, getCardMonthConfig, isScorecardSourceRow } from '../../shared/scorecardMonths.mjs';
import { assessMonthHistory, getLastCompletedMonthStamp } from '../../shared/latestMonthOutlier.mjs';

const number = {
  display: new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }),
  excel: '#,##0.00##'
};
const currency = {
  display: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
  excel: '$#,##0.00'
};
const percent = {
  display: new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 4 }),
  excel: '0.00##%'
};
const month = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const MIN_PRIOR_MONTHS_FOR_HISTORY = 10;
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

async function readCardReport({ key, title, format, read }, lastCompletedMonth) {
  try {
    const { rows } = await read();
    const scope = rows.filter(row => isScorecardSourceRow(row, key));
    const points = buildCardMonthlyPoints(scope, key, lastCompletedMonth);
    const { minAbsoluteChange, minRelativeChange } = getCardMonthConfig(key);
    const months = assessMonthHistory(points, { lastCompletedMonth, minAbsoluteChange, minRelativeChange });
    return { title, format, months };
  } catch (error) {
    logError('outlier-test', `Unable to assess ${key}.`, error);
    return { title, format, months: null };
  }
}

function latestDecision(months) {
  if (!months) return 'Data unavailable';
  const latest = months.at(-1);
  if (!latest) return 'No completed data';
  if (latest.lower === null) return 'Shown (insufficient history)';
  if (latest.processingMonth === null) return 'Shown';
  return latest.value < latest.lower ? 'Hidden (below range)' : 'Hidden (above range)';
}

function renderLatestRow({ title, format, months }) {
  const decision = latestDecision(months);
  if (!months) return `<tr><th scope="row">${title}</th><td colspan="6">${decision}</td></tr>`;
  const latest = months.at(-1);
  const display = n => Number.isFinite(n) ? format.display.format(n) : '—';
  return `<tr><th scope="row">${title}</th><td>${latest ? month.format(latest.stamp) : '—'}</td>
    <td>${display(latest?.value)}</td><td>${display(latest?.lower)}</td><td>${display(latest?.upper)}</td>
    <td>${latest?.historyCount ?? 0}</td><td>${decision}</td></tr>`;
}

function workbookRow({ title, format }, assessment) {
  if (!assessment) return [title, null, null, null, null];
  const { stamp, value, lower, upper } = assessment;
  const utc = new Date(stamp);
  // SheetJS converts local calendar dates to Excel serial dates.
  const monthStart = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), 1);
  const numericCell = n => Number.isFinite(n) ? { t: 'n', v: n, z: format.excel } : null;
  return [title, monthStart, numericCell(value), numericCell(lower), numericCell(upper)];
}

function buildWorkbook(reports) {
  const book = XLSX.utils.book_new();
  const columns = ['Card', 'Month and year', 'Actual value', 'Lower cutoff', 'Upper cutoff'];
  const latestRows = [[...columns, 'Decision']];
  const historicalRows = [columns];
  for (const report of reports) {
    const { months } = report;
    latestRows.push([...workbookRow(report, months?.at(-1)), latestDecision(months)]);
    for (const assessment of months ?? []) {
      if (assessment.historyCount >= MIN_PRIOR_MONTHS_FOR_HISTORY) {
        historicalRows.push(workbookRow(report, assessment));
      }
    }
  }
  for (const [name, rows] of [['Most recent month', latestRows], ['Historical ranges', historicalRows]]) {
    const sheet = XLSX.utils.aoa_to_sheet(rows, { dateNF: 'mmm yyyy' });
    sheet['!cols'] = rows[0].map(header => ({ wch: header === 'Card' || header === 'Decision' ? 30 : 20 }));
    sheet['!autofilter'] = { ref: sheet['!ref'] };
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  return XLSX.write(book, { bookType: 'xlsx', type: 'base64', compression: true });
}

export async function renderOutlierReport(now = new Date()) {
  const lastCompletedMonth = getLastCompletedMonthStamp(now);
  const reports = await Promise.all(cards.map(card => readCardReport(card, lastCompletedMonth)));
  const workbook = buildWorkbook(reports);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Latest-month outlier report</title><style>
    body{font:16px/1.5 system-ui;margin:4vw;color:#172536}p{max-width:85ch}.scroll{overflow-x:auto}
    a{display:inline-block;background:#164d75;color:white;padding:.45rem .8rem;border-radius:.3rem}
    table{border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:.6rem .8rem;text-align:right;border-bottom:1px solid #ccd2d7}
    th:first-child,td:last-child{text-align:left}thead{background:#edf2f5}tbody th{white-space:nowrap}</style></head>
    <body><main><h1>Latest-month outlier report</h1>
    <p><a download="outlier-report.xlsx" href="data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${workbook}">Download Excel workbook</a></p>
    <p>The Historical ranges sheet uses the data available today to reconstruct cutoffs for each month with at least ${MIN_PRIOR_MONTHS_FOR_HISTORY} earlier observed months on that card.</p>
    <p>All divisions, business units and facilities. Each card tests its newest observed completed month against the previous 6–12 observed months. A value on either cutoff is included. The test uses full precision. Dashboard filters can change the result.</p>
    <div class="scroll"><table><thead><tr><th>Card</th><th>Month tested</th><th>Actual</th><th>Lower cutoff</th><th>Upper cutoff</th><th>Prior months</th><th>Decision</th></tr></thead>
    <tbody>${reports.map(renderLatestRow).join('')}</tbody></table></div>
    <p>There is no scheduled release day. A hidden month is shown when its value returns inside the range on refresh, or when a newer completed month has a usable value for that card.</p></main></body></html>`;
}
