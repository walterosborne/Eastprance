// From the repository root: node server/uploadLabor1124.js [path/to/upload.env]
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';

const file = process.argv[2] || ['upload.env', 'Upload.env'].find(existsSync);
if (!file) throw new Error('Supply the path to upload.env.');
const loaded = dotenv.config({ path: file, override: true });
if (loaded.error) throw loaded.error;
const { extractJoinedLaborRows, laborSnapshot } = await import('./laborUtilizationNewRepository.js');
const { executeDatabricksQuery } = await import('./databricksQuery.js');
const rows = await extractJoinedLaborRows();
if (!rows.length) throw new Error('Empty labor extract. Refresh stopped.');
const stage = laborSnapshot + '_stage_' + randomUUID().replaceAll('-', '');
const columns = ['year','month','division','business_unit','cost_center','facility','facility_state','labor_category','entered_hours'];
const run = (query, parameters) => executeDatabricksQuery({ scope: 'labor-upload', tableName: stage, query, parameters });
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
  await run(`CREATE OR REPLACE TABLE ${laborSnapshot} USING DELTA AS SELECT * FROM ${stage}`);
  console.log('Published', rows.length, 'rows to', laborSnapshot);
} finally {
  await run(`DROP TABLE IF EXISTS ${stage}`);
}
