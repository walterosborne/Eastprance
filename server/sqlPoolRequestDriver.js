// node-mssql 12's base ConnectionPool.request() consults a shared driver
// singleton. Importing mssql/msnodesqlv8 changes that singleton for ALL pools,
// including older Tedious pools, which then produce incompatible SQL requests.
// Pin each pool's Request class to the driver that opened its connections.
export function bindSqlPoolRequestDriver(pool, driver) {
  if (!pool || typeof driver?.Request !== 'function') {
    throw new TypeError('A SQL connection pool and matching Request driver are required.');
  }
  pool.request = function request(config) {
    return new driver.Request(this, config);
  };
  return pool;
}
