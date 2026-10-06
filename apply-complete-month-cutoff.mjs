import fs from 'node:fs/promises';

const appPath = new URL('./client/src/App.jsx', import.meta.url);
let appSource = await fs.readFile(appPath, 'utf8');

const oldBlock = `const SCORECARD_START_STAMP = Date.UTC(2025, 0, 1);\nconst scorecardCurrentDate = new Date();\nconst SCORECARD_END_STAMP = Date.UTC(\n  scorecardCurrentDate.getUTCFullYear(),\n  scorecardCurrentDate.getUTCMonth(),\n  1\n);`;
const newBlock = `const SCORECARD_START_STAMP = Date.UTC(2025, 0, 1);\nconst scorecardCurrentDate = new Date();\n// Charts and the global date range only include fully completed calendar months.\nconst SCORECARD_END_STAMP = Date.UTC(\n  scorecardCurrentDate.getUTCFullYear(),\n  scorecardCurrentDate.getUTCMonth() - 1,\n  1\n);`;

if (!appSource.includes(oldBlock)) {
  throw new Error('Unable to find the scorecard end-stamp block in App.jsx.');
}

appSource = appSource.replace(oldBlock, newBlock);
await fs.writeFile(appPath, appSource);
