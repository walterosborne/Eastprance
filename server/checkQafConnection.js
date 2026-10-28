import { loadEnvironment } from './loadEnvironment.js';

await loadEnvironment();
const { getConnectionConfig, getPool, closeDatabaseConnection } = await import('./sqlConnection.js');

const { config, missing } = getConnectionConfig('qaf');
if (missing.length) {
  console.error('Missing Quality Data Mart settings:', missing.join(', '));
  process.exitCode = 1;
} else {
  try {
    const pool = await getPool(config, 'qaf');
    const result = await pool.request().query(`
      SELECT
        ORIGINAL_LOGIN() AS login_name,
        SYSTEM_USER AS system_user,
        (SELECT auth_scheme FROM sys.dm_exec_connections WHERE session_id = @@SPID) AS auth_scheme;
    `);
    console.log('Quality Data Mart connection successful:', {
      authMode: config.authMode,
      ...result.recordset[0]
    });
  } catch (error) {
    console.error('Quality Data Mart connection failed:', {
      authMode: config.authMode,
      code: error.code ?? 'UNKNOWN',
      message: error.message
    });
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnection();
  }
}
