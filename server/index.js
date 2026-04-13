import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readOtdData } from './otdRepository.js';
import { closePaymentsConnection, readPayments } from './paymentsRepository.js';

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 3002);
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

const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. Run \`API_PORT=<open-port> npm run dev\` or stop the process using that port.`
    );
    process.exit(1);
  }

  throw error;
});

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
