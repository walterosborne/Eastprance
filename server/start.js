import { loadEnvironment } from './loadEnvironment.js';
import { enableDatabricksExternalLinksForCostResults } from './databricksExternalLinksFetch.js';

await loadEnvironment();
enableDatabricksExternalLinksForCostResults();
await import('./index.js');
