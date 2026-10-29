import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import sql from 'mssql';
import { bindSqlPoolRequestDriver } from './sqlPoolRequestDriver.js';

const require = createRequire(import.meta.url);
// Loading this module changes node-mssql's global default Request driver.
const qafSql = require('mssql/msnodesqlv8');

// No SQL connections are opened; these dummy pools verify driver isolation.
const legacyPool = new sql.ConnectionPool({
  server: 'localhost', database: 'unused', user: 'test', password: 'test'
});
const qafPool = new qafSql.ConnectionPool({
  server: 'localhost', database: 'unused',
  connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=localhost;Trusted_Connection=yes;',
  options: { trustedConnection: true }
});

bindSqlPoolRequestDriver(legacyPool, sql);
bindSqlPoolRequestDriver(qafPool, qafSql);

assert.ok(legacyPool.request() instanceof sql.Request,
  'Legacy card requests must use the Tedious driver');
assert.ok(qafPool.request() instanceof qafSql.Request,
  'Customer Escapes requests must use the native ODBC driver');
assert.ok(legacyPool.request({ requestTimeout: 1234 }) instanceof sql.Request);
assert.ok(qafPool.request({ requestTimeout: 1234 }) instanceof qafSql.Request);

console.log('[PASS] Default/roster/DBM SQL requests remain Tedious.');
console.log('[PASS] QAF Customer Escapes requests remain native ODBC.');
console.log('[PASS] Loading both drivers does not mix their request classes.');
