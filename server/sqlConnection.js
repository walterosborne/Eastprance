import sql from 'mssql';
import { ensureQafKerberosCredentials } from './qafKerberosCredentials.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
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

function getDbmConnectionConfigFromEnv() {
  const configuredRequestTimeout = Number(
    getFirstDefinedEnvValue('dbmrequesttimeout', 'DBMREQUESTTIMEOUT')
  );

  return {
    server: getFirstDefinedEnvValue('dbmserver', 'DBMSERVER'),
    database: getFirstDefinedEnvValue('dbmdatabase', 'DBMDATABASE'),
    user: getFirstDefinedEnvValue('dbmuser', 'DBMUSER'),
    password: getFirstDefinedEnvValue('dbmpassword', 'DBMPASSWORD'),
    requestTimeout: Number.isFinite(configuredRequestTimeout) && configuredRequestTimeout > 0
      ? configuredRequestTimeout
      : 120000,
    source: 'dbm-env'
  };
}

function getQafConnectionConfigFromEnv() {
  const configuredRequestTimeout = Number(getFirstDefinedEnvValue('qafrequesttimeout', 'QAFREQUESTTIMEOUT'));
  const domain = getFirstDefinedEnvValue('qafdomain', 'QAFDOMAIN');
  // Specifying a domain opts into NTLM; without one, preserve SQL authentication.
  const authMode = (getFirstDefinedEnvValue('qafauth', 'QAFAUTH') || (domain ? 'ntlm' : 'sql'))
    .trim().toLowerCase();
  if (!['sql', 'ntlm', 'kerberos', 'kerberos-password'].includes(authMode)) {
    throw new Error('Unsupported QAF authentication mode. Use sql, ntlm, kerberos, or kerberos-password.');
  }
  const user = getFirstDefinedEnvValue('qafuser', 'QAFUSER');
  const realm = getFirstDefinedEnvValue('qafrealm', 'QAFREALM');
  const kerberosPrincipal = getFirstDefinedEnvValue('qafprincipal', 'QAFPRINCIPAL')
    || (user && user.includes('@')
      ? user
      : user && realm ? `${user}@${realm.toUpperCase()}` : undefined);

  return {
    server: getFirstDefinedEnvValue('qafserver', 'QAFSERVER'),
    database: getFirstDefinedEnvValue('qafdatabase', 'QAFDATABASE') || 'Quality Data Mart',
    user,
    password: getFirstDefinedEnvValue('qafpassword', 'QAFPASSWORD'),
    domain: authMode === 'ntlm' ? domain : undefined,
    kerberosPrincipal: authMode === 'kerberos-password' ? kerberosPrincipal : undefined,
    authMode,
    requestTimeout: Number.isFinite(configuredRequestTimeout) && configuredRequestTimeout > 0
      ? configuredRequestTimeout : 120000
  };
}

function isFullyQualifiedSqlServer(server) {
  // SQL Server supports host,port and host\\instance. Validate the hostname,
  // not the instance/port portion, so Kerberos cannot silently fall back to NTLM.
  const hostname = String(server ?? '').split(/[\\,]/, 1)[0];
  return /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(hostname);
}

function getMissingConnectionFields(config, prefix = '') {
  const missingFields = [];

  if (!config.server) {
    missingFields.push(`${prefix}server`);
  }

  if (!config.database) {
    missingFields.push(`${prefix}database`);
  }

  if (!config.user) {
    missingFields.push(`${prefix}user`);
  }

  if (!config.password) {
    missingFields.push(`${prefix}password`);
  }

  return missingFields;
}

export function getConnectionConfig(connectionName = 'default') {
  const defaultConfig = getPrimaryConnectionConfigFromEnv();

  if (connectionName === 'qaf') {
    const qafConfig = getQafConnectionConfigFromEnv();
    return {
      connectionName: 'qaf',
      config: qafConfig,
      missing: [
        ...(['kerberos', 'kerberos-password'].includes(qafConfig.authMode)
          ? ['server', 'database'].filter(field => !qafConfig[field]).map(field => `qaf${field}`)
          : getMissingConnectionFields(qafConfig, 'qaf')),
        ...(qafConfig.authMode === 'ntlm' && !qafConfig.domain ? ['qafdomain'] : []),
        ...(qafConfig.authMode === 'kerberos-password' && !qafConfig.password ? ['qafpassword'] : []),
        ...(qafConfig.authMode === 'kerberos-password' && !qafConfig.kerberosPrincipal
          ? ['qafprincipal (or qafuser@REALM, or qafuser + qafrealm)'] : []),
        ...(qafConfig.authMode === 'kerberos-password' && qafConfig.kerberosPrincipal
          && !/^[^\s@\\]+@[^\s@\\]+$/.test(qafConfig.kerberosPrincipal)
          ? ['qafprincipal must be user@KERBEROS.REALM'] : []),
        ...(['kerberos', 'kerberos-password'].includes(qafConfig.authMode)
          && qafConfig.server && !isFullyQualifiedSqlServer(qafConfig.server)
          ? ['qafserver must be a fully qualified DNS hostname, not a short name or IP'] : [])
      ],
      source: 'qaf-env'
    };
  }

  if (connectionName === 'dbm') {
    const dbmConfig = getDbmConnectionConfigFromEnv();
    const missing = getMissingConnectionFields(dbmConfig, 'dbm');

    return {
      connectionName: 'dbm',
      config: {
        server: dbmConfig.server,
        database: dbmConfig.database,
        user: dbmConfig.user,
        password: dbmConfig.password,
        requestTimeout: dbmConfig.requestTimeout
      },
      missing,
      source: dbmConfig.source
    };
  }

  if (connectionName !== 'roster') {
    const missing = getMissingConnectionFields(defaultConfig);

    return {
      connectionName: 'default',
      config: defaultConfig,
      missing,
      source: 'env'
    };
  }

  const rosterConfig = getRosterConnectionConfigFromEnv();
  const missing = getMissingConnectionFields(rosterConfig, 'roster_');

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
    config.user,
    config.authMode ?? 'sql',
    config.domain ?? '',
    config.kerberosPrincipal ?? '',
    config.requestTimeout ?? ''
  ].join('|');
}

function formatOdbcValue(value) {
  // ODBC brace-quoted values safely contain spaces, semicolons, and closing braces.
  return `{${String(value).replace(/}/g, '}}')}}`;
}

function getKerberosOdbcConfig(config) {
  // Windows uses the process identity. On Linux, kerberos-password first obtains
  // a ticket for the configured YY principal, while kerberos uses an existing
  // runtime-managed ticket cache. ODBC itself never receives a raw password.
  const connectionString = [
    'Driver={ODBC Driver 18 for SQL Server}',
    `Server=${formatOdbcValue(config.server)}`,
    `Database=${formatOdbcValue(config.database)}`,
    'Trusted_Connection=yes',
    'Encrypt=yes',
    // Preserve TLS policy of existing Tedious connections. Prefer a trusted
    // SQL Server certificate and TrustServerCertificate=no when available.
    'TrustServerCertificate=yes'
  ].join(';') + ';';

  return {
    server: config.server,
    database: config.database,
    connectionString,
    requestTimeout: config.requestTimeout,
    options: { trustedConnection: true, useUTC: true }
  };
}

export async function getPool(config, poolName = 'default') {
  if (config.authMode === 'kerberos-password') {
    await ensureQafKerberosCredentials(config);
  }
  const poolKey = getPoolKey(config, poolName);
  const existingPoolPromise = poolPromises.get(poolKey);

  if (!existingPoolPromise) {
    const stopTimer = createTimer();

    logDebug('sql', 'Creating SQL connection pool.', {
      poolName,
      server: config.server,
      database: config.database
    });

    const credentials = config.authMode === 'ntlm'
      ? {
          authentication: {
            type: 'ntlm',
            options: {
              domain: config.domain,
              userName: config.user,
              password: config.password
            }
          }
        }
      : { user: config.user, password: config.password };

    // The native ODBC driver supports Kerberos/Windows integrated authentication.
    // All other SQL connections continue using the existing Tedious driver.
    const driver = ['kerberos', 'kerberos-password'].includes(config.authMode)
      ? require('mssql/msnodesqlv8')
      : sql;
    const connectionPool = new driver.ConnectionPool(
      ['kerberos', 'kerberos-password'].includes(config.authMode)
        ? getKerberosOdbcConfig(config)
        : {
            server: config.server,
            database: config.database,
            ...credentials,
            requestTimeout: config.requestTimeout,
            options: {
              encrypt: true,
              trustServerCertificate: true
            }
          }
    );

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
