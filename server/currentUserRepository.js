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
  resolveRequestIdentity
} from './requestIdentity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_ROSTER_FILE_PATH = path.resolve(__dirname, '../data/local_roster.json');
const ROSTER_TABLE_CANDIDATES = ['RosterExtractFarm'];

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeIdentifier(value) {
  return normalizeText(value).toLowerCase();
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
    ),
    matched_by: normalizeText(row.matched_by ?? row.MatchedBy)
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

function getRosterMatchField(row, employeeIdentifier) {
  const normalizedIdentifier = normalizeIdentifier(employeeIdentifier);

  if (!normalizedIdentifier) {
    return '';
  }

  if (normalizeIdentifier(row.network_id) === normalizedIdentifier) {
    return 'NetworkID';
  }

  if (normalizeIdentifier(row.my_id) === normalizedIdentifier) {
    return 'MyID';
  }

  return '';
}

async function findLocalRosterUser(employeeIdentifier) {
  const rows = await readLocalRosterRows();

  if (!rows) {
    return null;
  }

  const matchedRow = rows.find((row) => Boolean(getRosterMatchField(row, employeeIdentifier)));

  if (!matchedRow) {
    return null;
  }

  return {
    ...matchedRow,
    matched_by: getRosterMatchField(matchedRow, employeeIdentifier)
  };
}

function isMissingRosterTableError(error) {
  return /invalid object name/i.test(String(error?.message ?? ''));
}

async function findSqlRosterUser(employeeIdentifier) {
  const { config, missing } = getConnectionConfig();

  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  const pool = await getPool(config);

  for (const tableName of ROSTER_TABLE_CANDIDATES) {
    try {
      const result = await pool
        .request()
        .input('employeeIdentifier', employeeIdentifier)
        .query(`
          SELECT TOP 1
            [MyID] AS [MyID],
            [NetworkID] AS [NetworkID],
            [FullName] AS [FullName],
            CASE
              WHEN [NetworkID] = @employeeIdentifier THEN 'NetworkID'
              WHEN [MyID] = @employeeIdentifier THEN 'MyID'
              ELSE ''
            END AS [MatchedBy]
          FROM ${formatSqlIdentifier(tableName)}
          WHERE [NetworkID] = @employeeIdentifier
            OR [MyID] = @employeeIdentifier
          ORDER BY
            CASE
              WHEN [NetworkID] = @employeeIdentifier THEN 0
              WHEN [MyID] = @employeeIdentifier THEN 1
              ELSE 2
            END,
            [MyID] ASC;
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
  let employeeIdentifier = '';
  let identitySource = '';

  try {
    const identity = await resolveRequestIdentity(request, HARDCODED_NETWORK_ID);
    employeeIdentifier = normalizeText(
      identity.employee_id || identity.network_id || HARDCODED_NETWORK_ID
    );
    identitySource = identity.source;

    logDebug('current-user', 'Resolving current user.', {
      employeeIdentifier,
      identitySource,
      preferredUsername: identity.preferred_username,
      email: identity.email,
      isHardcodedFallback: identitySource === 'hardcoded-fallback'
    });

    const localUser = await findLocalRosterUser(employeeIdentifier);

    if (localUser) {
      const payload = {
        source: 'local-json',
        identity_source: identity.source,
        employee_id: employeeIdentifier,
        network_id: localUser.network_id,
        my_id: localUser.my_id,
        name: localUser.name || identity.name,
        email: identity.email,
        preferred_username: identity.preferred_username,
        matchedBy: localUser.matched_by,
        fileName: path.basename(LOCAL_ROSTER_FILE_PATH)
      };

      logDebug('current-user', 'Resolved current user from local roster file.', {
        employeeIdentifier,
        myId: payload.my_id,
        matchedBy: payload.matchedBy,
        fileName: payload.fileName,
        duration: formatDuration(stopTimer())
      });

      return payload;
    }

    const sqlResult = await findSqlRosterUser(employeeIdentifier);

    if (sqlResult?.row) {
      const payload = {
        source: 'mssql',
        identity_source: identity.source,
        employee_id: employeeIdentifier,
        network_id: sqlResult.row.network_id,
        my_id: sqlResult.row.my_id,
        name: sqlResult.row.name,
        email: identity.email,
        preferred_username: identity.preferred_username,
        matchedBy: sqlResult.row.matched_by,
        tableName: sqlResult.tableName
      };

      logDebug('current-user', 'Resolved current user from SQL roster table.', {
        employeeIdentifier,
        myId: payload.my_id,
        matchedBy: payload.matchedBy,
        tableName: payload.tableName,
        duration: formatDuration(stopTimer())
      });

      return payload;
    }

    throw new Error(
      `Unable to find roster row for employee identifier ${employeeIdentifier}.`
    );
  } catch (error) {
    logError('current-user', 'Failed to resolve current user.', error, {
      employeeIdentifier,
      identitySource,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}
