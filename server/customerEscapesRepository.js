import { getConnectionConfig, getPool } from './sqlConnection.js';

// V02 represents all reported defective delivered units. V01 is the
// significant-defect subset and must not be added to V02.
export async function readCustomerEscapesData() {
  const { config, missing } = getConnectionConfig('qaf');
  if (missing.length) {
    throw new Error(`Missing Quality Data Mart connection settings: ${missing.join(', ')}`);
  }
  const pool = await getPool(config, 'qaf');
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
      software_escapes: Number(row.software_escapes),
      hardware_escapes: Number(row.hardware_escapes),
      documentation_escapes: Number(row.documentation_escapes)
    }))
  };
}
