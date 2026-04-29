import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const WORKBOOK_MONTH_COLUMNS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NORMALIZED_MONTH_COLUMNS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const laborUtilizationFilePath = path.resolve(__dirname, '../data/labor_utilization.xlsx');

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLaborUtilizationRow(row) {
  const normalizedRow = {
    my_id: row.MyID ?? '',
    employee_name: row['Employee Name'] ?? '',
    forecasted_cc: row['Forecasted CC'] ?? '',
    pool: row.Pool ?? '',
    location_code: row['Location Code'] ?? '',
    union_type: row['Union Type'] ?? '',
    worker_type: row['Worker Type'] ?? '',
    worker_subtype: row['Worker Subtype'] ?? '',
    time_type: row['Time Type'] ?? '',
    labor_category: row['Labor Category'] ?? '',
    measure: row.Measure ?? '',
    total_2026: normalizeNumber(row['2026'])
  };

  WORKBOOK_MONTH_COLUMNS.forEach((month, index) => {
    normalizedRow[NORMALIZED_MONTH_COLUMNS[index]] = normalizeNumber(row[month]);
  });

  return normalizedRow;
}

export async function readLaborUtilizationData() {
  await fs.access(laborUtilizationFilePath);

  const workbook = XLSX.readFile(laborUtilizationFilePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils
    .sheet_to_json(worksheet, { defval: null, raw: true })
    .map(normalizeLaborUtilizationRow);

  return {
    source: 'excel',
    fileName: path.basename(laborUtilizationFilePath),
    sheetName,
    rowCount: rows.length,
    rows
  };
}
