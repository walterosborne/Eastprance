import sql from 'mssql';
import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';

let poolPromise = null;

export function getConnectionConfig() {
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

export function formatSqlIdentifier(identifier) {
  const normalizedIdentifier = String(identifier).includes('.')
    ? String(identifier)
    : `dbo.${identifier}`;

  return normalizedIdentifier
    .split('.')
    .map((segment) => `[${segment.replace(/]/g, ']]')}]`)
    .join('.');
}

export async function getPool(config) {
  if (!poolPromise) {
    const stopTimer = createTimer();

    logDebug('sql', 'Creating SQL connection pool.', {
      server: config.server,
      database: config.database
    });

    const connectionPool = new sql.ConnectionPool({
      server: config.server,
      database: config.database,
      user: config.user,
      password: config.password,
      options: {
        encrypt: true,
        trustServerCertificate: true
      }
    });

    poolPromise = connectionPool.connect().catch((error) => {
      logError('sql', 'SQL connection pool failed to connect.', error, {
        server: config.server,
        database: config.database,
        duration: formatDuration(stopTimer())
      });
      poolPromise = null;
      throw error;
    });

    poolPromise.then(() => {
      logDebug('sql', 'SQL connection pool connected.', {
        server: config.server,
        database: config.database,
        duration: formatDuration(stopTimer())
      });
    });
  } else {
    logDebug('sql', 'Reusing existing SQL connection pool.');
  }

  return poolPromise;
}

export async function closeDatabaseConnection() {
  if (!poolPromise) {
    logDebug('sql', 'No SQL connection pool to close.');
    return;
  }

  const stopTimer = createTimer();

  try {
    const pool = await poolPromise;
    await pool.close();
    logDebug('sql', 'SQL connection pool closed.', {
      duration: formatDuration(stopTimer())
    });
  } finally {
    poolPromise = null;
  }
}
