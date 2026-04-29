import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getWildcardApiHost,
  resolveApiHostConfig,
  shouldFallbackToWildcardHost
} from '../shared/apiHost.mjs';
import { readLaborUtilizationData } from './laborUtilizationRepository.js';
import { readOtdData } from './otdRepository.js';
import { closePaymentsConnection, readPayments } from './paymentsRepository.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../client/dist');

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({
    message: 'Express backend is running.',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/payments', async (_request, response) => {
  try {
    const payments = await readPayments();
    response.json(payments);
  } catch (error) {
    response.status(500).json({
      message: 'Unable to read payment data.',
      error: error.message
    });
  }
});

app.get('/api/otd', async (_request, response) => {
  try {
    const otdData = await readOtdData();
    response.json(otdData);
  } catch (error) {
    response.status(500).json({
      message: 'Unable to read OTD data.',
      error: error.message
    });
  }
});

app.get('/api/labor-utilization', async (_request, response) => {
  try {
    const laborUtilizationData = await readLaborUtilizationData();
    response.json(laborUtilizationData);
  } catch (error) {
    response.status(500).json({
      message: 'Unable to read labor utilization data.',
      error: error.message
    });
  }
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

const { port, preferredHost, bindHost, connectHost, usingFallback, reason } =
  await resolveApiHostConfig();
const wildcardHost = getWildcardApiHost();

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
  if (usingFallback) {
    console.warn(`${reason} Falling back to ${wildcardHost}.`);
  }

  try {
    return {
      server: await listen(bindHost),
      boundHost: bindHost
    };
  } catch (error) {
    if (bindHost !== wildcardHost && shouldFallbackToWildcardHost(error)) {
      console.warn(
        `Unable to bind to hostname "${preferredHost}" (${error.code}). Falling back to ${wildcardHost}.`
      );

      try {
        return {
          server: await listen(wildcardHost),
          boundHost: wildcardHost
        };
      } catch (fallbackError) {
        handleStartupError(fallbackError);
      }
    }

    handleStartupError(error);
  }
}

const { server, boundHost } = await startServer();
const announcedHost = boundHost === wildcardHost ? connectHost : preferredHost;
const boundWithFallback = boundHost === wildcardHost;

console.log(
  `Server listening on http://${announcedHost}:${port}${boundWithFallback ? ` (bound to ${wildcardHost})` : ''}`
);

async function shutdown() {
  try {
    await closePaymentsConnection();
  } catch (error) {
    console.error('Error while closing the payment connection.', error);
  }

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
