import { loadEnvironment } from './loadEnvironment.js';

await loadEnvironment();
await import('./index.js');
