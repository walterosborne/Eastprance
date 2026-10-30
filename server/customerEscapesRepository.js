import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { getConnectionConfig, getPool } from './sqlConnection.js';

const dataDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const requiredColumns = [
  'data_month', 'program_id', 'division', 'business_unit',
  'software_escapes', 'hardware_escapes', 'documentation_escapes'
];

// Match the division labels used by the dashboard hierarchy and other cards.
function normalizeDivision(value) {
  const division = String(value ?? '').trim().replace(/^DS\s+/i, '').trim();
  switch (division.toUpperCase()) {
    case 'CWI':
    case 'GBMR':
    case 'C2 & WEAPONS INTEGRATION':
      return 'C2 & Weapons Integration';
    case 'SDS':
    case 'STRATEGIC DETERRENT SYSTEMS':
      return 'Strategic Deterrent Systems';
    case 'WS':
    case 'WEAPON SYSTEMS':
      return 'Weapon Systems';
    default:
      return division;
  }
}

function normalizeMonth(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  throw new Error(`Invalid customer escapes data_month: ${String(value)}`);
}

async function readCustomerEscapesWorkbook(reason) {
  const candidates = ['customer_escapes.xlsx', 'customer_escapes.csv'];
  let filePath;
  for (const name of candidates) {
    const candidate = path.join(dataDirectory, name);
    try {
      await fs.access(candidate);
      filePath = candidate;
      break;
    } catch {
      // Try the next supported export format.
    }
  }
  if (!filePath) throw new Error(
    `Quality Data Mart unavailable (${reason}). Put customer_escapes.xlsx or customer_escapes.csv in data/.`
  );
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const headers = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] ?? []).map(String);
  const missing = requiredColumns.filter(column => !headers.includes(column));
  if (missing.length) throw new Error(`Customer escapes export missing columns: ${missing.join(', ')}`);
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }).map(row => {
    const month = normalizeMonth(row.data_month);
    const values = Object.fromEntries(
      ['software_escapes', 'hardware_escapes', 'documentation_escapes'].map(column => {
        const value = Number(row[column]);
        if (row[column] == null || row[column] === '' || !Number.isFinite(value)) {
          throw new Error(`Invalid ${column} for customer escapes month ${month}`);
        }
        return [column, value];
      })
    );
    if (row.program_id == null || row.program_id === '') {
      throw new Error(`Missing program_id for customer escapes month ${month}`);
    }
    return {
      data_month: month,
      program_id: String(row.program_id),
      division: normalizeDivision(row.division),
      business_unit: String(row.business_unit ?? '').trim(),
      ...values
    };
  });
  return { source: 'excel', fileName: path.basename(filePath), rowCount: rows.length, rows };
}

// V02 represents all reported defective delivered units. V01 is the
// significant-defect subset and must not be added to V02.
export async function readCustomerEscapesData() {
  const { config, missing } = getConnectionConfig('qaf');
  if (missing.length) {
    return readCustomerEscapesWorkbook(`missing settings: ${missing.join(', ')}`);
  }
  try {
  const pool = await getPool(config, 'qaf');
  if (['kerberos', 'kerberos-password'].includes(config.authMode)) {
    const authentication = await pool.request().query(
      "SELECT CONVERT(varchar(20), CONNECTIONPROPERTY('auth_scheme')) AS auth_scheme;"
    );
    const scheme = String(authentication.recordset[0]?.auth_scheme ?? '').toUpperCase();
    if (scheme !== 'KERBEROS') {
      throw new Error('Quality Data Mart did not negotiate Kerberos. Verify SQL FQDN and MSSQLSvc SPN.');
    }
    console.info('[customer-escapes] Verified Kerberos authentication with Quality Data Mart.');
  }
  const result = await pool.request().query(`
    SELECT
      CONVERT(char(10), md.[MYDT_From_DT], 23) AS data_month,
      p.[PMDH_PROG_ID] AS program_id,
      pc.[PCMY_PROG_Division] AS division,
      pc.[PCMY_PROG_BusinessUnit] AS business_unit,
      SUM(CASE WHEN p.[PMDH_DATV_ID] = 148
          THEN CONVERT(decimal(18, 2), p.[PMDH_Data_Value]) ELSE 0 END) AS software_escapes,
      SUM(CASE WHEN p.[PMDH_DATV_ID] = 151
          THEN CONVERT(decimal(18, 2), p.[PMDH_Data_Value]) ELSE 0 END) AS hardware_escapes,
      SUM(CASE WHEN p.[PMDH_DATV_ID] = 154
          THEN CONVERT(decimal(18, 2), p.[PMDH_Data_Value]) ELSE 0 END) AS documentation_escapes
    FROM [QAF_RawData].[PMDH_Program_MonthYear_Data_History] AS p
    JOIN [QAF_RawData].[MYDT_Month_Year_Date] AS md
      ON md.[MYDT_ID] = p.[PMDH_MYDT_ID]
    JOIN [QAF_RawData].[PCMY_Program_Configuration_Month_Year] AS pc
      ON pc.[PCMY_ID] = p.[PMDH_PCMY_ID]
    WHERE p.[PMDH_Level] = 4
      AND p.[PMDH_DATV_ID] IN (148, 151, 154)
      AND pc.[PCMY_Status] = 'FINAL'
      AND pc.[PCMY_PROG_Sector] = 'Defense Systems'
      AND md.[MYDT_From_DT] >= '2025-01-01'
      AND md.[MYDT_From_DT] < DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
    GROUP BY md.[MYDT_From_DT], p.[PMDH_PROG_ID],
      pc.[PCMY_PROG_Division], pc.[PCMY_PROG_BusinessUnit]
    ORDER BY data_month, division, business_unit, program_id;
  `);
  return {
    source: 'mssql',
    rowCount: result.recordset.length,
    rows: result.recordset.map(row => ({
      ...row,
      division: normalizeDivision(row.division),
      software_escapes: Number(row.software_escapes),
      hardware_escapes: Number(row.hardware_escapes),
      documentation_escapes: Number(row.documentation_escapes)
    }))
  };
  } catch (error) {
    return readCustomerEscapesWorkbook(error.message);
  }
}
