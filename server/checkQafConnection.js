import { loadEnvironment } from './loadEnvironment.js';

await loadEnvironment();
const { getConnectionConfig, getPool, closeDatabaseConnection } = await import('./sqlConnection.js');

// SELECT TOP (0) checks source table/column access without retrieving data.
const tableChecks = [
  {
    name: 'Program monthly history',
    sql: [
      'SELECT TOP (0) [PMDH_PROG_ID], [PMDH_DATV_ID], [PMDH_Data_Value],',
      '[PMDH_MYDT_ID], [PMDH_PCMY_ID], [PMDH_Level]',
      'FROM [QAF_RawData].[PMDH_Program_MonthYear_Data_History];'
    ].join(' ')
  },
  {
    name: 'Month-year dimension',
    sql: 'SELECT TOP (0) [MYDT_ID], [MYDT_From_DT] FROM [QAF_RawData].[MYDT_Month_Year_Date];'
  },
  {
    name: 'Program configuration',
    sql: [
      'SELECT TOP (0) [PCMY_ID], [PCMY_PROG_Division], [PCMY_PROG_BusinessUnit],',
      '[PCMY_Status], [PCMY_PROG_Sector]',
      'FROM [QAF_RawData].[PCMY_Program_Configuration_Month_Year];'
    ].join(' ')
  }
];

const { config, missing } = getConnectionConfig('qaf');
if (missing.length > 0) {
  console.error('[QAF] Configuration needs attention:', missing.join('; '));
  process.exitCode = 1;
} else {
  try {
    console.log('[QAF] Checking authentication and three Customer Escapes source tables.');
    const pool = await getPool(config, 'qaf');
    const connection = await pool.request().query(
      'SELECT ORIGINAL_LOGIN() AS login_name, DB_NAME() AS database_name, ' +
      "CONVERT(varchar(20), CONNECTIONPROPERTY('auth_scheme')) AS auth_scheme;"
    );
    const identity = connection.recordset[0] ?? {};
    console.log('[PASS] Connected:', {
      authenticationMode: config.authMode,
      sqlLogin: identity.login_name,
      database: identity.database_name,
      negotiatedScheme: identity.auth_scheme ?? '(unavailable)'
    });
    if (['kerberos', 'kerberos-password'].includes(config.authMode)
      && String(identity.auth_scheme).toUpperCase() !== 'KERBEROS') {
      console.error('[FAIL] The SQL connection did not negotiate Kerberos. Check FQDN, SPN and KDC.');
      process.exitCode = 1;
    }
    for (const check of tableChecks) {
      try {
        await pool.request().query(check.sql);
        console.log('[PASS] SELECT permission/columns: ' + check.name);
      } catch (error) {
        console.error('[FAIL] ' + check.name + ': ' + error.message);
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error('[FAIL] QAF database connection:', error.message);
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnection();
  }
}
