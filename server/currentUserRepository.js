import fs from 'fs/promises';
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
  formatSqlIdentifier,
  getConnectionConfig,
  getPool
} from './sqlConnection.js';
import {
  HARDCODED_NETWORK_ID,
  getRequestIdentityLogSummary,
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

function getIdentityCandidates(identity = {}) {
  const candidates = Array.isArray(identity.identifier_candidates)
    ? identity.identifier_candidates
    : [];
  const normalizedCandidates = candidates
    .map((candidate) => ({
      source: normalizeText(candidate?.source),
      value: normalizeText(candidate?.value)
    }))
    .filter((candidate) => candidate.source && candidate.value);

  if (normalizedCandidates.length > 0) {
    return normalizedCandidates;
  }

  const legacyIdentifier = normalizeText(identity.employee_id || identity.network_id);

  return legacyIdentifier
    ? [{ source: identity.source || 'legacy-identity', value: legacyIdentifier }]
    : [];
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

function findLocalRosterUser(rows, employeeIdentifier) {
  const matchedRow = rows.find((row) => Boolean(getRosterMatchField(row, employeeIdentifier)));

  if (!matchedRow) {
    return null;
  }

  return {
    ...matchedRow,
    matched_by: getRosterMatchField(matchedRow, employeeIdentifier)
  };
}

function buildCurrentUserPayload(identity, candidate, rosterUser, storageDetails) {
  return {
    ...storageDetails,
    identity_source: identity.source,
    matched_identifier: candidate.value,
    matched_identifier_source: candidate.source,
    employee_id: candidate.value,
    network_id: rosterUser.network_id,
    my_id: rosterUser.my_id,
    name: rosterUser.name || identity.displayName || identity.name,
    email: identity.email,
    preferred_username: identity.preferred_username,
    displayName: identity.displayName,
    userPrincipalName: identity.userPrincipalName,
    employeeId: identity.employeeId,
    onPremisesSamAccountName: identity.onPremisesSamAccountName,
    graph_status_code: identity.graph_status_code,
    entra_user_object_id: identity.entra_user_object_id,
    entra_tenant_id: identity.entra_tenant_id,
    matchedBy: rosterUser.matched_by
  };
}

function isMissingRosterTableError(error) {
  return /invalid object name/i.test(String(error?.message ?? ''));
}

async function findSqlRosterUser(employeeIdentifier) {
  const { config, missing, source } = getConnectionConfig('roster');

  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  const pool = await getPool(config, 'roster');

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
          FROM ${formatSqlIdentifier(tableName, config)}
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
          connectionSource: source,
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
  let resolvedIdentity = null;

  logDebugJson(
    'entra-debug',
    'Identity transport summary.',
    getRequestIdentityLogSummary(request)
  );

  try {
    const identity = await resolveRequestIdentity(request, HARDCODED_NETWORK_ID);
    resolvedIdentity = identity;
    identitySource = identity.source;
    const identifierCandidates = getIdentityCandidates(identity);

    if (identifierCandidates.length === 0) {
      throw new Error('Identity resolution produced no roster identifier candidates.');
    }

    logDebug('current-user', 'Resolving current user.', {
      identitySource,
      identifierCandidateSources: identifierCandidates.map((candidate) => candidate.source),
      preferredUsername: identity.preferred_username,
      email: identity.email,
      isHardcodedFallback: identitySource === 'hardcoded-fallback'
    });

    const localRows = await readLocalRosterRows();

    if (localRows) {
      for (const candidate of identifierCandidates) {
        const localUser = findLocalRosterUser(localRows, candidate.value);

        if (!localUser) {
          continue;
        }

        employeeIdentifier = candidate.value;
        const payload = buildCurrentUserPayload(identity, candidate, localUser, {
          source: 'local-json',
          fileName: path.basename(LOCAL_ROSTER_FILE_PATH)
        });

        logDebug('current-user', 'Resolved current user from local roster file.', {
          employeeIdentifier,
          matchedIdentifierSource: payload.matched_identifier_source,
          myId: payload.my_id,
          matchedBy: payload.matchedBy,
          fileName: payload.fileName,
          duration: formatDuration(stopTimer())
        });

        return payload;
      }
    }

    for (const candidate of identifierCandidates) {
      const sqlResult = await findSqlRosterUser(candidate.value);

      if (!sqlResult?.row) {
        continue;
      }

      employeeIdentifier = candidate.value;
      const payload = buildCurrentUserPayload(identity, candidate, sqlResult.row, {
        source: 'mssql',
        tableName: sqlResult.tableName
      });

      logDebug('current-user', 'Resolved current user from SQL roster table.', {
        employeeIdentifier,
        matchedIdentifierSource: payload.matched_identifier_source,
        myId: payload.my_id,
        matchedBy: payload.matchedBy,
        connectionSource: sqlResult.connectionSource,
        tableName: payload.tableName,
        duration: formatDuration(stopTimer())
      });

      return payload;
    }

    throw new Error(
      `Unable to find a roster row for ${identifierCandidates.length} Entra identity candidate(s).`
    );
  } catch (error) {
    if (resolvedIdentity && !error.resolvedIdentity) {
      error.resolvedIdentity = resolvedIdentity;
    }

    logError('current-user', 'Failed to resolve current user.', error, {
      employeeIdentifier,
      identitySource,
      graphStatusCode: error.graphDiagnostics?.statusCode ?? null,
      graphErrorMessage: error.graphDiagnostics?.errorMessage ?? '',
      identityDiagnostics: error.identityDiagnostics ?? getRequestIdentityLogSummary(request),
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}
