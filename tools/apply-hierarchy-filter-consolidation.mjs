import fs from 'node:fs/promises';

const appPath = new URL('../client/src/App.jsx', import.meta.url);
let appSource = await fs.readFile(appPath, 'utf8');

const oldImports = `import FacilityHierarchyFilter from './FacilityHierarchyFilter';
import BusinessUnitHierarchyFilter from './BusinessUnitHierarchyFilter';
import { facilityFilterMatches } from './facilityFilterUtils';
import { businessUnitFilterMatches } from './businessUnitFilterUtils';`;
const newImports = `import {
  BusinessUnitHierarchyFilter,
  FacilityHierarchyFilter
} from './HierarchyFilters';
import {
  businessUnitFilterMatches,
  facilityFilterMatches
} from './hierarchyFilterUtils';`;

if (!appSource.includes(oldImports)) {
  throw new Error('Unable to find hierarchy filter imports in App.jsx.');
}

appSource = appSource.replace(oldImports, newImports);
await fs.writeFile(appPath, appSource);

await Promise.all([
  'FacilityHierarchyFilter.jsx',
  'BusinessUnitHierarchyFilter.jsx',
  'facilityFilterUtils.js',
  'businessUnitFilterUtils.js',
  'facilityHierarchyFilter.css'
].map(async (fileName) => {
  const fileUrl = new URL(`../client/src/${fileName}`, import.meta.url);
  await fs.rm(fileUrl, { force: true });
}));
