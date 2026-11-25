import { getConnectionConfig, getPool } from './sqlConnection.js';

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

// V02 represents all reported defective delivered units. V01 is the
// significant-defect subset and must not be added to V02.
export async function readCustomerEscapesData() {
  const { config, missing } = getConnectionConfig('qaf');
  if (missing.length) {
    throw new Error(`Missing Quality Data Mart settings: ${missing.join(', ')}`);
  }
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
      pc.[PCMY_PROG_Campus] AS facility,
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
      AND md.[MYDT_From_DT] < DATEADD(month, 1, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
    GROUP BY md.[MYDT_From_DT], p.[PMDH_PROG_ID],
      pc.[PCMY_PROG_Division], pc.[PCMY_PROG_BusinessUnit], pc.[PCMY_PROG_Campus]
    ORDER BY data_month, division, business_unit, facility, program_id;
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
}
