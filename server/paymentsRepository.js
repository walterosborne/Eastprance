import sql from 'mssql';
import { DUMMY_TABLE_NAME, getDummyTableRows } from './dummyTable.js';

let poolPromise = null;

function getConnectionConfig() {
  const config = {
    server: process.env.server,
    database: process.env.database,
    user: process.env.user,
    password: process.env.password
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return { config, missing };
}

function normalizePaymentRow(row) {
  return {
    payment_type: row.payment_type,
    payment_summary_type: row.payment_summary_type,
    expected_cash_amt: Number(row.expected_cash_amt),
    ANNUAL_AMT: Number(row.ANNUAL_AMT),
    CHARGE_AMT_Basis: row.CHARGE_AMT_Basis,
    START_DATE: new Date(row.START_DATE).toISOString(),
    END_DATE: new Date(row.END_DATE).toISOString()
  };
}

function getFallbackResponse(reason) {
  const rows = getDummyTableRows().map(normalizePaymentRow);

  return {
    source: 'dummy',
    tableName: DUMMY_TABLE_NAME,
    rowCount: rows.length,
    fallbackReason: reason,
    rows
  };
}

async function getPool(config) {
  if (!poolPromise) {
    poolPromise = sql.connect({
      server: config.server,
      database: config.database,
      user: config.user,
      password: config.password,
      options: {
        encrypt: true,
        trustServerCertificate: true
      }
    }).catch((error) => {
      poolPromise = null;
      throw error;
    });
  }

  return poolPromise;
}

export async function readPayments() {
  const { config, missing } = getConnectionConfig();

  if (missing.length > 0) {
    return getFallbackResponse(
      `Missing database environment variables: ${missing.join(', ')}`
    );
  }

  try {
    const pool = await getPool(config);
    const result = await pool.request().query(`
      SELECT
        [payment_type],
        [payment_summary_type],
        [expected_cash_amt],
        [ANNUAL_AMT],
        [CHARGE_AMT_Basis],
        [START_DATE],
        [END_DATE]
      FROM [dbo].[${DUMMY_TABLE_NAME}]
      ORDER BY [START_DATE] ASC;
    `);

    const rows = result.recordset.map(normalizePaymentRow);

    return {
      source: 'mssql',
      tableName: DUMMY_TABLE_NAME,
      rowCount: rows.length,
      rows
    };
  } catch (error) {
    return getFallbackResponse(`Database read failed: ${error.message}`);
  }
}

export async function closePaymentsConnection() {
  if (!poolPromise) {
    return;
  }

  try {
    const pool = await poolPromise;
    await pool.close();
  } finally {
    poolPromise = null;
  }
}
