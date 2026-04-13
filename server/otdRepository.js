import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const MONTH_COLUMNS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const otdFilePath = path.resolve(__dirname, '../data/otd_data.xlsx');

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeOtdRow(row) {
  const normalizedRow = {
    program: row.Program ?? '',
    project_id: row['Project ID'] ?? '',
    site: row.Site ?? '',
    type: row.Type ?? '',
    measure_type: row['2026'] ?? ''
  };

  for (const month of MONTH_COLUMNS) {
    normalizedRow[month] = normalizeNumber(row[month]);
  }

  return normalizedRow;
}

export async function readOtdData() {
  await fs.access(otdFilePath);

  const workbook = XLSX.readFile(otdFilePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils
    .sheet_to_json(worksheet, { defval: null, raw: true })
    .map(normalizeOtdRow);

  return {
    source: 'excel',
    fileName: path.basename(otdFilePath),
    sheetName,
    rowCount: rows.length,
    rows
  };
}
