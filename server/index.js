import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createTimer,
  formatDuration,
  logDebug,
  logDebugJson,
  logError
} from './debugLogger.js';
import {
  buildHeadersDebugPayload,
  renderHeadersDebugPage
} from './headerDiagnostics.js';
import {
  buildLaborDiagnosticsPayload,
  renderLaborDiagnosticsPage
} from './laborDiagnostics.js';
import {
  buildCostDiagnosticsPayload,
  renderCostDiagnosticsPage
} from './costDiagnostics.js';
import {
  readDbmDiagnostics,
  renderDbmDiagnosticsPage
} from './dbmDiagnostics.js';
import { resolveApiHostConfig } from '../shared/apiHost.mjs';
import { readControllableCostsData } from './controllableCostsRepository.js';
import { readControllableCostsHanaData } from './controllableCostsHanaRepository.js';
import {
  readControllableCostsNewData,
  readControllableCostsNewPipelineData
} from './controllableCostsNewRepository.js';
import { readCurrentUser } from './currentUserRepository.js';
import {
  readDashboardPresetsOverview,
  saveDashboardPreset
} from './dashboardPresetsRepository.js';
import { readLaborUtilizationData } from './laborUtilizationRepository.js';
import { readLaborUtilizationHanaData } from './laborUtilizationHanaRepository.js';
import { readLaborUtilizationNewData } from './laborUtilizationNewRepository.js';
import { readOtdData } from './otdRepository.js';
import {
  getSafetyMetricPayload,
  readSafetyEventMetricsData,
  readSafetyNmfrData
} from './sifRepository.js';
import { closeDatabaseConnection } from './sqlConnection.js';
import {
  AUTHENTICATION_EXPIRED_ERROR,
  IDENTITY_DIAGNOSTICS_VERSION,
  getEntraApplicationConfig,
  getMicrosoftGraphProfile,
  getRequestIdentityLogSummary
} from './requestIdentity.js';
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
const CONTROLLABLE_COSTS_HANA_DATASET_ENABLED = false;
const LABOR_HANA_DATASET_ENABLED = false;
let requestCounter = 0;

function getResponseErrorStatus(error, fallbackStatus = 500) {
  const statusCode = Number(error?.statusCode);

  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599
    ? statusCode
    : fallbackStatus;
}

function sendAuthenticationAwareError(response, error, fallbackPayload, fallbackStatus = 500) {
  if (
    error?.code === AUTHENTICATION_EXPIRED_ERROR
    && error?.reauthenticate === true
  ) {
    response.status(401).json({
      error: AUTHENTICATION_EXPIRED_ERROR,
      reauthenticate: true
    });
    return;
  }

  response.status(getResponseErrorStatus(error, fallbackStatus)).json(fallbackPayload);
}

registerSqlDatasetCache('controllable-costs', readControllableCostsData);
if (CONTROLLABLE_COSTS_HANA_DATASET_ENABLED) {
  registerSqlDatasetCache('controllable-costs-hana', readControllableCostsHanaData);
}
registerSqlDatasetCache('otd', readOtdData);
registerSqlDatasetCache('labor', readLaborUtilizationData);
if (LABOR_HANA_DATASET_ENABLED) {
  registerSqlDatasetCache('labor-hana', readLaborUtilizationHanaData);
}
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

  if (
    request.path === '/api/current-user'
    || request.path === '/api/entra-identity-debug'
    || request.path === '/api/headers'
    || request.path.startsWith('/api/dashboard-presets')
  ) {
    logDebugJson(
      'entra-debug',
      'Auth-sensitive API request received.',
      getRequestIdentityLogSummary(request)
    );
  }

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
  const entraConfig = getEntraApplicationConfig();

  response.json({
    message: 'Express backend is running.',
    timestamp: new Date().toISOString(),
    authDiagnostics: {
      version: IDENTITY_DIAGNOSTICS_VERSION,
      applicationIdConfigured: Boolean(entraConfig.applicationId),
      objectIdConfigured: Boolean(entraConfig.objectId),
      directoryIdConfigured: Boolean(entraConfig.directoryId)
    }
  });
});

// Temporary diagnostic endpoint for identifying the roster-compatible Entra claim.
app.get('/api/entra-identity-debug', async (request, response) => {
  const stopTimer = createTimer();

  try {
    const { profile } = await getMicrosoftGraphProfile(request);

    response.json(profile);
    logDebug('entra-identity-debug', `Graph identity resolved for API request #${request.requestId ?? 'n/a'}.`, {
      duration: formatDuration(stopTimer())
    });
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode)
      && error.statusCode >= 400
      && error.statusCode <= 599
      ? error.statusCode
      : 502;

    logError('entra-identity-debug', `Graph request failed for API request #${request.requestId ?? 'n/a'}.`, error, {
      statusCode,
      duration: formatDuration(stopTimer())
    });
    sendAuthenticationAwareError(
      response,
      error,
      { message: error.message },
      statusCode
    );
  }
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

    sendAuthenticationAwareError(response, error, {
      message: 'Unable to resolve the current user.',
      error: error.message,
      requestId: request.requestId ?? null,
      authDiagnosticsVersion: IDENTITY_DIAGNOSTICS_VERSION
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

    sendAuthenticationAwareError(response, error, {
      message: 'Unable to load dashboard presets.',
      error: error.message,
      requestId: request.requestId ?? null,
      authDiagnosticsVersion: IDENTITY_DIAGNOSTICS_VERSION
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

    sendAuthenticationAwareError(response, error, {
      message: 'Unable to save dashboard preset.',
      error: error.message,
      requestId: request.requestId ?? null,
      authDiagnosticsVersion: IDENTITY_DIAGNOSTICS_VERSION
    });
  }
});

app.get(['/headers', '/api/headers'], async (request, response) => {
  try {
    const payload = await buildHeadersDebugPayload(request);
    const wantsJson = request.path.startsWith('/api/')
      || String(request.query.format || '').toLowerCase() === 'json'
      || String(request.get('accept') || '').includes('application/json');

    if (wantsJson) {
      response.type('application/json').send(`${JSON.stringify(payload, null, 2)}\n`);
      return;
    }

    response.type('text/html').send(renderHeadersDebugPage(payload));
  } catch (error) {
    logError('headers', 'Unable to build header diagnostics.', error);
    response.status(500).json({
      message: 'Unable to build header diagnostics.'
    });
  }
});

app.get(['/labor-diagnostics', '/api/labor-diagnostics'], async (request, response) => {
  const stopTimer = createTimer();

  try {
    const [oldPayload, newPayload] = await Promise.all([
      getCachedSqlDataset('labor'),
      readLaborUtilizationNewData()
    ]);
    const payload = buildLaborDiagnosticsPayload(oldPayload, newPayload);
    const wantsJson = request.path.startsWith('/api/')
      || String(request.query.format || '').toLowerCase() === 'json'
      || String(request.get('accept') || '').includes('application/json');

    logDebug('labor-diagnostics', 'Labor source comparison completed.', {
      oldRowCount: payload.sources.old.rowCount,
      newRowCount: payload.sources.new.rowCount,
      commonMonthCount: payload.comparisonWindow.commonMonths.length,
      duration: formatDuration(stopTimer())
    });

    if (wantsJson) {
      response.type('application/json').send(`${JSON.stringify(payload, null, 2)}\n`);
      return;
    }

    response.type('text/html').send(renderLaborDiagnosticsPage(payload));
  } catch (error) {
    logError('labor-diagnostics', 'Unable to build labor diagnostics.', error, {
      duration: formatDuration(stopTimer())
    });
    response.status(500).json({
      message: 'Unable to build labor diagnostics.',
      error: error.message
    });
  }
});

app.get(['/cost-diagnostics', '/api/cost-diagnostics'], async (request, response) => {
  const stopTimer = createTimer();

  try {
    const [oldPayload, pipeline] = await Promise.all([
      getCachedSqlDataset('controllable-costs'),
      readControllableCostsNewPipelineData()
    ]);
    const payload = buildCostDiagnosticsPayload(pipeline, oldPayload);
    const wantsJson = request.path.startsWith('/api/')
      || String(request.query.format || '').toLowerCase() === 'json'
      || String(request.get('accept') || '').includes('application/json');

    logDebug('cost-diagnostics', 'New controllable costs pipeline diagnostics completed.', {
      sourceRowCount: payload.source.sourceRowCount,
      includedRowCount: payload.stages.included.rowCount,
      excludedRowCount: payload.stages.excluded.rowCount,
      latestRawMonth: payload.stages.raw.latestMonth,
      overlappingQuarterCount: payload.controllabilityComparison.commonQuarters.length,
      classificationMismatchCount: payload.controllabilityComparison.mismatchCount,
      duration: formatDuration(stopTimer())
    });

    if (wantsJson) {
      response.type('application/json').send(`${JSON.stringify(payload, null, 2)}\n`);
      return;
    }

    response.type('text/html').send(renderCostDiagnosticsPage(payload));
  } catch (error) {
    logError('cost-diagnostics', 'Unable to build cost diagnostics.', error, {
      duration: formatDuration(stopTimer())
    });
    response.status(500).json({
      message: 'Unable to build cost diagnostics.',
      error: error.message
    });
  }
});

app.get(['/dbm-diagnostics', '/api/dbm-diagnostics'], async (request, response) => {
  try {
    const payload = await readDbmDiagnostics();
    const wantsJson = request.path.startsWith('/api/')
      || String(request.query.format || '').toLowerCase() === 'json'
      || String(request.get('accept') || '').includes('application/json');

    if (wantsJson) {
      response.json(payload);
      return;
    }

    response.type('text/html').send(renderDbmDiagnosticsPage(payload));
  } catch (error) {
    logError('dbm-diagnostics', 'Unable to render DBM diagnostics.', error);
    response.status(500).json({
      message: 'Unable to render DBM diagnostics.'
    });
  }
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

app.get('/api/controllable-costs-new', async (request, response) => {
  await sendDatasetResponse(
    request,
    response,
    'controllable-costs-new',
    readControllableCostsNewData,
    'Unable to read the new controllable costs workbook.'
  );
});

if (CONTROLLABLE_COSTS_HANA_DATASET_ENABLED) {
  app.get('/api/controllable-costs-hana', async (request, response) => {
    await sendDatasetResponse(
      request,
      response,
      'controllable-costs-hana',
      () => getCachedSqlDataset('controllable-costs-hana'),
      'Unable to read HANA controllable costs data.'
    );
  });
}

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

app.get('/api/labor-utilization-new', async (request, response) => {
  await sendDatasetResponse(
    request,
    response,
    'labor-new',
    readLaborUtilizationNewData,
    'Unable to read the new labor utilization workbook.'
  );
});

if (LABOR_HANA_DATASET_ENABLED) {
  app.get('/api/labor-utilization-hana', async (request, response) => {
    await sendDatasetResponse(
      request,
      response,
      'labor-hana',
      () => getCachedSqlDataset('labor-hana'),
      'Unable to read HANA labor utilization data.'
    );
  });
}

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
logDebugJson('entra-debug', 'Identity diagnostics enabled.', {
  diagnosticsVersion: IDENTITY_DIAGNOSTICS_VERSION,
  nodeEnvironment: process.env.NODE_ENV || '',
  applicationIdConfigured: Boolean(getEntraApplicationConfig().applicationId),
  objectIdConfigured: Boolean(getEntraApplicationConfig().objectId),
  directoryIdConfigured: Boolean(getEntraApplicationConfig().directoryId),
  expectedProxyArchitecture: 'OAuth2 Proxy sidecar -> 127.0.0.1:8080'
});

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
