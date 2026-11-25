import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { executeDatabricksQuery } from './databricksQuery.js';
import { getConnectionConfig, getPool } from './sqlConnection.js';
import { extractJoinedLaborRows, laborSnapshot } from './laborUtilizationNewRepository.js';
import { getNextRefreshDate } from './sqlDatasetCache.js';

const run = (query, parameters) => executeDatabricksQuery({
  scope: 'labor-upload', tableName: laborSnapshot, query, parameters
});

async function readSignature(pool) {
  const { recordset: [source] } = await pool.request().query(`
    SELECT CONVERT(varchar(33), CAST(MAX(created_date) AS datetime2(7)), 126) AS updated,
           CONVERT(varchar(20), COUNT_BIG(*)) AS row_count
    FROM rpt.actuals_load_resource_management`);
  if (!/^\d+$/.test(source.row_count) ||
      (source.updated !== null && !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?$/.test(source.updated))) {
    throw new Error('Invalid DBM labor update signature.');
  }
  return { date: source.updated, count: source.row_count };
}

async function publishedSignature() {
  const split = laborSnapshot.lastIndexOf('.');
  const schema = laborSnapshot.slice(0, split);
  const name = laborSnapshot.slice(split + 1);
  const tables = await run(`SHOW TABLES IN ${schema} LIKE '${name}'`);
  if (!tables.some(table => table.tableName === name)) return null;
  const properties = await run(`SHOW TBLPROPERTIES ${laborSnapshot}`);
  const values = new Map(properties.map(row => [row.key, row.value]));
  if (!values.has('qmi.laborDate') || !values.has('qmi.laborRows')) return null;
  const date = values.get('qmi.laborDate');
  return { date: date === 'null' ? null : date, count: values.get('qmi.laborRows') };
}

function sameSignature(left, right) {
  return right != null && left.date === right.date && left.count === right.count;
}

async function checkAndPublish(pool, force) {
  const before = await readSignature(pool);
  if (!force && sameSignature(before, await publishedSignature())) return 'Labor source unchanged.';
  const rows = await extractJoinedLaborRows();
  if (!rows.length) throw new Error('Empty labor extract. Refresh stopped.');
  const stage = laborSnapshot + '_stage_' + randomUUID().replaceAll('-', '');
  const columns = ['year','month','division','business_unit','cost_center','facility','facility_state','labor_category','entered_hours'];
  await run(`CREATE TABLE ${stage} (extract_row BIGINT, year INT, month INT, division STRING,
    business_unit STRING, cost_center STRING, facility STRING, facility_state STRING,
    labor_category STRING, entered_hours DECIMAL(20,2)) USING DELTA`);
  try {
    for (let offset = 0; offset < rows.length; offset += 500) {
      const batch = rows.slice(offset, offset + 500).map((r,i) => ({ ...r, extract_row: offset + i }));
      const schema = 'array<struct<extract_row:bigint,year:int,month:int,division:string,business_unit:string,cost_center:string,facility:string,facility_state:string,labor_category:string,entered_hours:decimal(20,2)>>';
      await run(`INSERT INTO ${stage} SELECT row.extract_row, ${columns.map(c => 'row.' + c).join(', ')}
        FROM (SELECT explode(from_json(:batch, '${schema}')) AS row)`,
        [{ name: 'batch', type: 'STRING', value: JSON.stringify(batch) }]);
    }
    const [check] = await run(`SELECT COUNT(*) AS n, SUM(entered_hours) AS hours FROM ${stage}`);
    const cents = rows.reduce((sum,r) => sum + Math.round(r.entered_hours * 100), 0);
    if (Number(check.n) !== rows.length || Math.round(Number(check.hours) * 100) !== cents)
      throw new Error('Labor snapshot reconciliation failed.');
    if (!sameSignature(before, await readSignature(pool))) {
      throw new Error('DBM labor changed during the extract. Previous snapshot retained.');
    }
    // Keep the exact SQL Server timestamp in Delta metadata (sub-microsecond precision).
    await run(`CREATE OR REPLACE TABLE ${laborSnapshot} USING DELTA
      TBLPROPERTIES ('qmi.laborDate' = '${before.date ?? "null"}', 'qmi.laborRows' = '${before.count}')
      AS SELECT *, CAST(${before.date === null ? 'NULL' : "'" + before.date + "'"} AS TIMESTAMP) AS labor_update_date,
        CAST('${before.count}' AS BIGINT) AS labor_row_count, current_timestamp() AS last_updated FROM ${stage}`);
    return `Published ${rows.length} labor rows to ${laborSnapshot}.`;
  } finally {
    await run(`DROP TABLE IF EXISTS ${stage}`);
  }
}

export async function refreshLaborSnapshot({ force = false } = {}) {
  const { config, missing } = getConnectionConfig('dbm');
  if (missing.length) throw new Error('Missing DBM settings: ' + missing.join(', '));
  const pool = await getPool(config, 'dbm');
  // The transaction owns only the named lock. Source reads use their own connection.
  const lock = new sql.Transaction(pool);
  await lock.begin();
  try {
    const { recordset: [result] } = await new sql.Request(lock).query(`
      DECLARE @rc int;
      EXEC @rc = sys.sp_getapplock @Resource = 'QMI.templabor1124.refresh',
        @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 0;
      SELECT @rc AS result`);
    if (result.result === -1) return 'Another labor refresh is running.';
    if (result.result < 0) throw new Error('Unable to acquire labor refresh lock: ' + result.result);
    return await checkAndPublish(pool, force);
  } finally {
    await lock.rollback();
  }
}

export function startLaborRefreshScheduler() {
  let timer;
  let stopped = false;
  function schedule() {
    if (stopped) return;
    const next = getNextRefreshDate(new Date(), 'America/New_York', 3, 0);
    timer = setTimeout(async () => {
      try {
        console.info('[labor-refresh]', await refreshLaborSnapshot());
      } catch (error) {
        console.error('[labor-refresh] Daily refresh failed:', error.message);
      } finally {
        schedule();
      }
    }, Math.max(1, next.getTime() - Date.now()));
    timer.unref();
  }
  schedule();
  return () => { stopped = true; clearTimeout(timer); };
}
