import sql from 'mssql';

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
      poolPromise = null;
      throw error;
    });
  }

  return poolPromise;
}

export async function closeDatabaseConnection() {
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
