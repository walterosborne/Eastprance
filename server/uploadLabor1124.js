// From the repository root: node server/uploadLabor1124.js [path/to/upload.env]
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';

const file = process.argv[2] || ['upload.env', 'Upload.env'].find(existsSync);
if (!file) throw new Error('Supply the path to upload.env.');
const loaded = dotenv.config({ path: file, override: true });
if (loaded.error) throw loaded.error;
const { refreshLaborSnapshot } = await import('./laborSnapshotRefresh.js');
const { closeDatabaseConnection } = await import('./sqlConnection.js');
try {
  console.log(await refreshLaborSnapshot({ force: true }));
} finally {
  await closeDatabaseConnection();
}
