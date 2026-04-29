import { DUMMY_TABLE_NAME, getDummyTableRows } from './dummyTable.js';
import {
  closeDatabaseConnection,
  formatSqlIdentifier,
  getConnectionConfig,
  getPool
} from './sqlConnection.js';

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

export async function readPayments() {
  const { config, missing } = getConnectionConfig();

  if (missing.length > 0) {
    return getFallbackResponse(
      `Missing database environment variables: ${missing.join(', ')}`
    );
  }

  try {
    const pool = await getPool(config);
    const tableName = formatSqlIdentifier(DUMMY_TABLE_NAME);
    const result = await pool.request().query(`
      SELECT
        [payment_type],
        [payment_summary_type],
        [expected_cash_amt],
        [ANNUAL_AMT],
        [CHARGE_AMT_Basis],
        [START_DATE],
        [END_DATE]
      FROM ${tableName}
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
  await closeDatabaseConnection();
}
