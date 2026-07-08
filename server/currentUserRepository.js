import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import {
  formatSqlIdentifier,
  getConnectionConfig,
  getPool
} from './sqlConnection.js';
import {
  HARDCODED_NETWORK_ID,
  getRequestNetworkId
} from './requestIdentity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_ROSTER_FILE_PATH = path.resolve(__dirname, '../data/local_roster.json');
const ROSTER_TABLE_CANDIDATES = ['RosterExtractFarm'];

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeRosterRow(row) {
  return {
    my_id: normalizeText(row.my_id ?? row.MyID ?? row.myid ?? row['My ID']),
    network_id: normalizeText(
      row.network_id ?? row.NetworkID ?? row.networkid ?? row['Network ID']
    ),
    name: normalizeText(
      row.name
      ?? row.FullName
      ?? row.fullname
      ?? row.RosterName
      ?? row.rostername
      ?? row['Employee Name']
    )
  };
}

async function readLocalRosterRows() {
  try {
    const fileContents = await fs.readFile(LOCAL_ROSTER_FILE_PATH, 'utf8');
    const parsedValue = JSON.parse(fileContents);
    const rows = Array.isArray(parsedValue) ? parsedValue : parsedValue?.rows;

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .map(normalizeRosterRow)
      .filter((row) => row.my_id && row.network_id && row.name);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function findLocalRosterUser(networkId) {
  const rows = await readLocalRosterRows();

  if (!rows) {
    return null;
  }

  return (
    rows.find(
      (row) => row.network_id.toLowerCase() === networkId.toLowerCase()
    ) ?? null
  );
}

function isMissingRosterTableError(error) {
  return /invalid object name/i.test(String(error?.message ?? ''));
}

async function findSqlRosterUser(networkId) {
  const { config, missing } = getConnectionConfig();

  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  const pool = await getPool(config);

  for (const tableName of ROSTER_TABLE_CANDIDATES) {
    try {
      const result = await pool
        .request()
        .input('networkId', networkId)
        .query(`
          SELECT TOP 1
            [MyID] AS [MyID],
            [NetworkID] AS [NetworkID],
            [FullName] AS [FullName]
          FROM ${formatSqlIdentifier(tableName)}
          WHERE [NetworkID] = @networkId
          ORDER BY [MyID] ASC;
        `);
      const row = result.recordset[0];

      if (row) {
        return {
          tableName,
          row: normalizeRosterRow(row)
        };
      }
    } catch (error) {
      if (isMissingRosterTableError(error)) {
        logDebug('current-user', 'Roster table was not found; trying next candidate.', {
          tableName
        });
        continue;
      }

      throw error;
    }
  }

  return null;
}

export async function readCurrentUser(request) {
  const stopTimer = createTimer();
  const networkId = getRequestNetworkId(request, HARDCODED_NETWORK_ID);

  logDebug('current-user', 'Resolving current user.', {
    networkId,
    isHardcodedFallback: networkId === HARDCODED_NETWORK_ID
  });

  try {
    const localUser = await findLocalRosterUser(networkId);

    if (localUser) {
      const payload = {
        source: 'local-json',
        network_id: networkId,
        my_id: localUser.my_id,
        name: localUser.name,
        fileName: path.basename(LOCAL_ROSTER_FILE_PATH)
      };

      logDebug('current-user', 'Resolved current user from local roster file.', {
        networkId,
        myId: payload.my_id,
        fileName: payload.fileName,
        duration: formatDuration(stopTimer())
      });

      return payload;
    }

    const sqlResult = await findSqlRosterUser(networkId);

    if (sqlResult?.row) {
      const payload = {
        source: 'mssql',
        network_id: networkId,
        my_id: sqlResult.row.my_id,
        name: sqlResult.row.name,
        tableName: sqlResult.tableName
      };

      logDebug('current-user', 'Resolved current user from SQL roster table.', {
        networkId,
        myId: payload.my_id,
        tableName: payload.tableName,
        duration: formatDuration(stopTimer())
      });

      return payload;
    }

    throw new Error(`Unable to find roster row for network ID ${networkId}.`);
  } catch (error) {
    logError('current-user', 'Failed to resolve current user.', error, {
      networkId,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}
