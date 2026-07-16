import sql from 'mssql';
import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';

const poolPromises = new Map();

function getFirstDefinedEnvValue(...keys) {
  for (const key of keys) {
    const value = process.env[key];

    if (value) {
      return value;
    }
  }

  return undefined;
}

function getPrimaryConnectionConfigFromEnv() {
  const config = {
    server: getFirstDefinedEnvValue('server', 'SERVER'),
    database: getFirstDefinedEnvValue('database', 'DATABASE'),
    user: getFirstDefinedEnvValue('user', 'USER'),
    password: getFirstDefinedEnvValue('password', 'PASSWORD'),
    schema: getFirstDefinedEnvValue(
      'schema',
      'SCHEMA',
      'sql_schema',
      'SQL_SCHEMA',
      'database_schema',
      'DATABASE_SCHEMA'
    ) || 'dbo'
  };

  return config;
}

function getRosterConnectionConfigFromEnv() {
  return {
    server: getFirstDefinedEnvValue('roster_server', 'ROSTER_SERVER'),
    database: getFirstDefinedEnvValue('roster_database', 'ROSTER_DATABASE'),
    user: getFirstDefinedEnvValue('roster_user', 'ROSTER_USER'),
    password: getFirstDefinedEnvValue('roster_password', 'ROSTER_PASSWORD'),
    schema: (
      getFirstDefinedEnvValue(
        'roster_schema',
        'ROSTER_SCHEMA',
        'roster_sql_schema',
        'ROSTER_SQL_SCHEMA',
        'roster_database_schema',
        'ROSTER_DATABASE_SCHEMA'
      ) || 'dbo'
    ),
    source: 'prefixed-env'
  };
}

export function getConnectionConfig(connectionName = 'default') {
  const defaultConfig = getPrimaryConnectionConfigFromEnv();

  if (connectionName !== 'roster') {
    const missing = Object.entries(defaultConfig)
      .filter(([key, value]) => key !== 'schema' && !value)
      .map(([key]) => key);

    return {
      connectionName: 'default',
      config: defaultConfig,
      missing,
      source: 'env'
    };
  }

  const rosterConfig = getRosterConnectionConfigFromEnv();
  const hasAnyRosterOverride = Boolean(
    rosterConfig.server
    || rosterConfig.database
    || rosterConfig.user
    || rosterConfig.password
  );

  if (!hasAnyRosterOverride) {
    const missing = Object.entries(defaultConfig)
      .filter(([key, value]) => key !== 'schema' && !value)
      .map(([key]) => key);

    return {
      connectionName: 'roster',
      config: defaultConfig,
      missing,
      source: 'default-fallback'
    };
  }

  const missing = Object.entries(rosterConfig)
    .filter(([key, value]) => !['schema', 'source'].includes(key) && !value)
    .map(([key]) => key);

  return {
    connectionName: 'roster',
    config: {
      server: rosterConfig.server,
      database: rosterConfig.database,
      user: rosterConfig.user,
      password: rosterConfig.password,
      schema: rosterConfig.schema || 'dbo'
    },
    missing,
    source: rosterConfig.source
  };
}

export function getDefaultSqlSchema(connectionConfig = null) {
  if (connectionConfig?.schema) {
    return connectionConfig.schema;
  }

  return getPrimaryConnectionConfigFromEnv().schema || 'dbo';
}

export function formatSqlIdentifier(identifier, connectionConfig = null) {
  const normalizedIdentifier = String(identifier).includes('.')
    ? String(identifier)
    : `${getDefaultSqlSchema(connectionConfig)}.${identifier}`;

  return normalizedIdentifier
    .split('.')
    .map((segment) => `[${segment.replace(/]/g, ']]')}]`)
    .join('.');
}

function getPoolKey(config, poolName = 'default') {
  return [
    poolName,
    config.server,
    config.database,
    config.user
  ].join('|');
}

export async function getPool(config, poolName = 'default') {
  const poolKey = getPoolKey(config, poolName);
  const existingPoolPromise = poolPromises.get(poolKey);

  if (!existingPoolPromise) {
    const stopTimer = createTimer();

    logDebug('sql', 'Creating SQL connection pool.', {
      poolName,
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

    const poolPromise = connectionPool.connect().catch((error) => {
      logError('sql', 'SQL connection pool failed to connect.', error, {
        poolName,
        server: config.server,
        database: config.database,
        duration: formatDuration(stopTimer())
      });
      poolPromises.delete(poolKey);
      throw error;
    });

    poolPromises.set(poolKey, poolPromise);

    poolPromise.then(() => {
      logDebug('sql', 'SQL connection pool connected.', {
        poolName,
        server: config.server,
        database: config.database,
        duration: formatDuration(stopTimer())
      });
    });
  } else {
    logDebug('sql', 'Reusing existing SQL connection pool.', {
      poolName,
      server: config.server,
      database: config.database
    });
  }

  return poolPromises.get(poolKey);
}

export async function closeDatabaseConnection() {
  if (poolPromises.size === 0) {
    logDebug('sql', 'No SQL connection pool to close.');
    return;
  }

  try {
    await Promise.all(
      [...poolPromises.entries()].map(async ([poolKey, poolPromise]) => {
        const stopTimer = createTimer();

        try {
          const pool = await poolPromise;
          await pool.close();
          logDebug('sql', 'SQL connection pool closed.', {
            poolKey,
            duration: formatDuration(stopTimer())
          });
        } finally {
          poolPromises.delete(poolKey);
        }
      })
    );
  } finally {
    poolPromises.clear();
  }
}
