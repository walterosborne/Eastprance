import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import {
  buildHeadersDebugPayload,
  renderHeadersDebugPage
} from './headerDiagnostics.js';
import { resolveApiHostConfig } from '../shared/apiHost.mjs';
import { readControllableCostsData } from './controllableCostsRepository.js';
import { readCurrentUser } from './currentUserRepository.js';
import {
  readDashboardPresetsOverview,
  saveDashboardPreset
} from './dashboardPresetsRepository.js';
import { readLaborUtilizationData } from './laborUtilizationRepository.js';
import { readOtdData } from './otdRepository.js';
import {
  getSafetyMetricPayload,
  readSafetyEventMetricsData,
  readSafetyNmfrData
} from './sifRepository.js';
import { closeDatabaseConnection } from './sqlConnection.js';
import {
  getCachedSqlDataset,
  registerSqlDatasetCache,
  startSqlDatasetCacheScheduler,
  stopSqlDatasetCacheScheduler,
  warmAllSqlDatasetCaches
} from './sqlDatasetCache.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../client/dist');
let requestCounter = 0;

registerSqlDatasetCache('controllable-costs', readControllableCostsData);
registerSqlDatasetCache('otd', readOtdData);
registerSqlDatasetCache('labor', readLaborUtilizationData);
registerSqlDatasetCache('safety-incidents', readSafetyEventMetricsData);
registerSqlDatasetCache('safety-nmfr', readSafetyNmfrData);

app.use(cors());
app.use(express.json());
app.use((request, response, next) => {
  if (!request.path.startsWith('/api')) {
    next();
    return;
  }

  const requestId = ++requestCounter;
  const stopTimer = createTimer();

  request.requestId = requestId;

  logDebug('api', `#${requestId} ${request.method} ${request.path} started.`);

  response.on('finish', () => {
    logDebug('api', `#${requestId} ${request.method} ${request.path} completed.`, {
      statusCode: response.statusCode,
      duration: formatDuration(stopTimer())
    });
  });

  next();
});

async function sendDatasetResponse(request, response, scope, loadDataset, failureMessage) {
  const stopTimer = createTimer();

  logDebug(scope, `Handling request #${request.requestId ?? 'n/a'}.`);

  try {
    const payload = await loadDataset();

    logDebug(scope, `Request #${request.requestId ?? 'n/a'} loaded dataset.`, {
      source: payload.source,
      rowCount: payload.rowCount,
      tableName: payload.tableName,
      fileName: payload.fileName,
      fallbackReason: payload.fallbackReason,
      duration: formatDuration(stopTimer())
    });

    response.json(payload);
  } catch (error) {
    logError(scope, `Request #${request.requestId ?? 'n/a'} failed.`, error, {
      duration: formatDuration(stopTimer())
    });

    response.status(500).json({
      message: failureMessage,
      error: error.message
    });
  }
}

app.get('/api/health', (_request, response) => {
  response.json({
    message: 'Express backend is running.',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/current-user', async (request, response) => {
  const stopTimer = createTimer();

  logDebug('current-user', `Handling request #${request.requestId ?? 'n/a'}.`);

  try {
    const currentUser = await readCurrentUser(request);

    response.json({
      currentUser
    });

    logDebug('current-user', `Request #${request.requestId ?? 'n/a'} resolved current user.`, {
      myId: currentUser.my_id,
      source: currentUser.source,
      duration: formatDuration(stopTimer())
    });
  } catch (error) {
    logError('current-user', `Request #${request.requestId ?? 'n/a'} failed.`, error, {
      duration: formatDuration(stopTimer())
    });

    response.status(500).json({
      message: 'Unable to resolve the current user.',
      error: error.message
    });
  }
});

app.get('/api/dashboard-presets', async (request, response) => {
  const stopTimer = createTimer();

  logDebug('presets', `Handling request #${request.requestId ?? 'n/a'}.`);

  try {
    const currentUser = await readCurrentUser(request);
    const presetsOverview = await readDashboardPresetsOverview(currentUser);

    response.json({
      currentUser,
      ...presetsOverview
    });

    logDebug('presets', `Request #${request.requestId ?? 'n/a'} loaded presets overview.`, {
      myId: currentUser.my_id,
      presetCount: presetsOverview.presets.length,
      storageAvailable: presetsOverview.storageAvailable,
      duration: formatDuration(stopTimer())
    });
  } catch (error) {
    logError('presets', `Request #${request.requestId ?? 'n/a'} failed.`, error, {
      duration: formatDuration(stopTimer())
    });

    response.status(500).json({
      message: 'Unable to load dashboard presets.',
      error: error.message
    });
  }
});

app.put('/api/dashboard-presets/:slot', async (request, response) => {
  const stopTimer = createTimer();

  logDebug('presets', `Handling request #${request.requestId ?? 'n/a'} save request.`, {
    slot: request.params.slot
  });

  try {
    const currentUser = await readCurrentUser(request);
    const { name, state } = request.body ?? {};
    const result = await saveDashboardPreset(currentUser, request.params.slot, name, state);

    response.json({
      currentUser,
      storageAvailable: true,
      storageMessage: '',
      preset: result.preset,
      presets: result.presets
    });

    logDebug('presets', `Request #${request.requestId ?? 'n/a'} saved dashboard preset.`, {
      myId: currentUser.my_id,
      slot: request.params.slot,
      presetCount: result.presets.length,
      duration: formatDuration(stopTimer())
    });
  } catch (error) {
    logError('presets', `Request #${request.requestId ?? 'n/a'} save failed.`, error, {
      duration: formatDuration(stopTimer())
    });

    response.status(500).json({
      message: 'Unable to save dashboard preset.',
      error: error.message
    });
  }
});

app.get(['/headers', '/api/headers'], (request, response) => {
  const payload = buildHeadersDebugPayload(request);
  const wantsJson = request.path.startsWith('/api/')
    || String(request.query.format || '').toLowerCase() === 'json'
    || String(request.get('accept') || '').includes('application/json');

  if (wantsJson) {
    response.type('application/json').send(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  response.type('text/html').send(renderHeadersDebugPage(payload));
});

app.get('/api/otd', async (request, response) => {
  await sendDatasetResponse(
    request,
    response,
    'otd',
    () => getCachedSqlDataset('otd'),
    'Unable to read OTD data.'
  );
});

app.get('/api/controllable-costs', async (request, response) => {
  await sendDatasetResponse(
    request,
    response,
    'controllable-costs',
    () => getCachedSqlDataset('controllable-costs'),
    'Unable to read controllable costs data.'
  );
});

app.get('/api/sif-incidents', async (request, response) => {
  await sendDatasetResponse(
    request,
    response,
    'sif',
    async () => getSafetyMetricPayload(await getCachedSqlDataset('safety-incidents'), 'sif'),
    'Unable to read SIF data.'
  );
});

app.get('/api/potential-sif-incidents', async (request, response) => {
  await sendDatasetResponse(
    request,
    response,
    'potential-sif',
    async () =>
      getSafetyMetricPayload(await getCachedSqlDataset('safety-incidents'), 'potentialSif'),
    'Unable to read potential SIF data.'
  );
});

app.get('/api/nmfr', async (request, response) => {
  await sendDatasetResponse(
    request,
    response,
    'nmfr',
    async () => getSafetyMetricPayload(await getCachedSqlDataset('safety-nmfr'), 'nmfr'),
    'Unable to read NMFR data.'
  );
});

app.get('/api/labor-utilization', async (request, response) => {
  await sendDatasetResponse(
    request,
    response,
    'labor',
    () => getCachedSqlDataset('labor'),
    'Unable to read labor utilization data.'
  );
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDistPath));

  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api')) {
      next();
      return;
    }

    response.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

const { port, bindHost, connectHost } = await resolveApiHostConfig();

function handleStartupError(error) {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. Run \`API_PORT=<open-port> npm run dev\` or stop the process using that port.`
    );
    process.exit(1);
  }

  throw error;
}

function listen(host) {
  return new Promise((resolve, reject) => {
    const candidateServer = app.listen(port, host);

    const onError = (error) => {
      candidateServer.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      candidateServer.off('error', onError);
      resolve(candidateServer);
    };

    candidateServer.once('error', onError);
    candidateServer.once('listening', onListening);
  });
}

async function startServer() {
  try {
    return await listen(bindHost);
  } catch (error) {
    handleStartupError(error);
  }
}

const server = await startServer();

console.log(`Server listening on http://${connectHost}:${port}`);

startSqlDatasetCacheScheduler();
void warmAllSqlDatasetCaches('server startup warm');

async function shutdown() {
  try {
    stopSqlDatasetCacheScheduler();
    await closeDatabaseConnection();
  } catch (error) {
    console.error('Error while closing the database connection.', error);
  }

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
