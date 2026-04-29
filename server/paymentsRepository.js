import { DUMMY_TABLE_NAME, getDummyTableRows } from './dummyTable.js';
import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
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
  const stopTimer = createTimer();
  const rows = getDummyTableRows().map(normalizePaymentRow);

  logDebug('payments', 'Loaded payment fallback rows.', {
    source: 'dummy',
    tableName: DUMMY_TABLE_NAME,
    rowCount: rows.length,
    reason,
    duration: formatDuration(stopTimer())
  });

  return {
    source: 'dummy',
    tableName: DUMMY_TABLE_NAME,
    rowCount: rows.length,
    fallbackReason: reason,
    rows
  };
}

export async function readPayments() {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig();

  logDebug('payments', 'Starting payment data load.', {
    hasConnectionConfig: missing.length === 0,
    tableName: DUMMY_TABLE_NAME
  });

  if (missing.length > 0) {
    logDebug('payments', 'Payment data load is missing SQL configuration; using fallback.', {
      missing
    });

    return getFallbackResponse(
      `Missing database environment variables: ${missing.join(', ')}`
    );
  }

  try {
    const pool = await getPool(config);
    const tableName = formatSqlIdentifier(DUMMY_TABLE_NAME);

    logDebug('payments', 'Executing payment SQL query.', {
      tableName
    });

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

    logDebug('payments', 'Payment SQL query completed.', {
      source: 'mssql',
      tableName: DUMMY_TABLE_NAME,
      rowCount: rows.length,
      duration: formatDuration(stopTimer())
    });

    return {
      source: 'mssql',
      tableName: DUMMY_TABLE_NAME,
      rowCount: rows.length,
      rows
    };
  } catch (error) {
    logError('payments', 'Payment SQL query failed; using fallback data.', error, {
      tableName: DUMMY_TABLE_NAME,
      duration: formatDuration(stopTimer())
    });

    return getFallbackResponse(`Database read failed: ${error.message}`);
  }
}

export async function closePaymentsConnection() {
  await closeDatabaseConnection();
}
