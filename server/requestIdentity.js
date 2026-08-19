export const HARDCODED_NETWORK_ID = 'N35589';
export const IDENTITY_DIAGNOSTICS_VERSION = 'entra-graph-2026-08-19.1';
export const MICROSOFT_GRAPH_ME_URL =
  'https://graph.microsoft.us/v1.0/me?$select=id,displayName,mail,userPrincipalName,employeeId,onPremisesSamAccountName';

const MICROSOFT_GRAPH_PROFILE_PROPERTIES = [
  'id',
  'displayName',
  'mail',
  'userPrincipalName',
  'employeeId',
  'onPremisesSamAccountName'
];

const AUTH_CANDIDATE_FIELDS = [
  ['x_forwarded_employeeid', 'X-Forwarded-EmployeeId'],
  ['x_forwarded_user', 'X-Forwarded-User'],
  ['x_forwarded_preferred_username', 'X-Forwarded-Preferred-Username'],
  ['x_forwarded_name', 'X-Forwarded-Name'],
  ['x_forwarded_email', 'X-Forwarded-Email'],
  ['x_auth_request_user', 'X-Auth-Request-User'],
  ['x_auth_request_preferred_username', 'X-Auth-Request-Preferred-Username'],
  ['x_auth_request_email', 'X-Auth-Request-Email'],
  ['x_entra_user_object_id', 'X-Entra-User-Object-Id'],
  ['x_entra_tenant_id', 'X-Entra-Tenant-Id'],
  ['x_entra_application_id', 'X-Entra-Application-Id'],
  ['x_original_host', 'X-Original-Host'],
  ['x_original_url', 'X-Original-Url'],
  ['x_forwarded_host', 'X-Forwarded-Host'],
  ['x_forwarded_proto', 'X-Forwarded-Proto'],
  ['x_forwarded_for', 'X-Forwarded-For']
];

const IDENTITY_CANDIDATE_KEYS = [
  'x_forwarded_employeeid',
  'x_forwarded_user',
  'x_forwarded_preferred_username',
  'x_forwarded_name',
  'x_forwarded_email',
  'x_auth_request_user',
  'x_auth_request_preferred_username',
  'x_auth_request_email',
  'x_entra_user_object_id',
  'x_entra_tenant_id',
  'x_entra_application_id'
];

function getFirstDefinedEnvValue(...keys) {
  for (const key of keys) {
    const value = process.env[key];

    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeBooleanEnvValue(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function shouldAllowHardcodedIdentityFallback() {
  return normalizeBooleanEnvValue(
    getFirstDefinedEnvValue(
      'allow_hardcoded_identity_fallback',
      'ALLOW_HARDCODED_IDENTITY_FALLBACK'
    ),
    process.env.NODE_ENV !== 'production'
  );
}

function getAuthorizationScheme(request) {
  const authorization = normalizeText(getHeaderValue(request, 'Authorization'));

  return authorization ? authorization.split(/\s+/, 1)[0] : '';
}

function getCookieNames(request) {
  const cookieHeader = normalizeText(getHeaderValue(request, 'Cookie'));

  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(';')
    .map((cookie) => cookie.split('=', 1)[0].trim())
    .filter(Boolean);
}

function buildHardcodedFallbackIdentity(fallbackNetworkId = HARDCODED_NETWORK_ID) {
  return {
    source: 'hardcoded-fallback',
    employee_id: fallbackNetworkId,
    network_id: fallbackNetworkId,
    email: '',
    name: '',
    preferred_username: '',
    entra_user_object_id: '',
    entra_tenant_id: '',
    displayName: '',
    userPrincipalName: '',
    employeeId: '',
    onPremisesSamAccountName: '',
    identifier_candidates: [{
      source: 'hardcoded-fallback',
      value: fallbackNetworkId
    }]
  };
}

export function getEntraApplicationConfig() {
  return {
    applicationId: normalizeText(getFirstDefinedEnvValue('applicationid', 'ENTRA_APPLICATION_ID')),
    objectId: normalizeText(getFirstDefinedEnvValue('objectid', 'ENTRA_OBJECT_ID')),
    directoryId: normalizeText(getFirstDefinedEnvValue('directoryid', 'ENTRA_DIRECTORY_ID'))
  };
}

export function getHeaderValue(request, name) {
  return request.get(name) ?? request.headers?.[String(name).toLowerCase()] ?? null;
}

export function getBearerToken(request) {
  const authorization = normalizeText(getHeaderValue(request, 'Authorization'));
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);

  if (bearerMatch?.[1]) {
    return bearerMatch[1].trim();
  }

  const forwardedToken = normalizeText(
    getHeaderValue(request, 'X-Forwarded-Access-Token')
    || getHeaderValue(request, 'X-Auth-Request-Access-Token')
  );

  return forwardedToken.replace(/^Bearer\s+/i, '').trim();
}

export function normalizePotentialNetworkId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  let normalized = String(value).trim();

  if (!normalized) {
    return null;
  }

  if (normalized.includes(',')) {
    normalized = normalized.split(',')[0].trim();
  }

  if (normalized.includes(';')) {
    normalized = normalized.split(';')[0].trim();
  }

  if (normalized.includes('\\')) {
    normalized = normalized.split('\\').pop().trim();
  }

  if (normalized.includes('@')) {
    normalized = normalized.split('@')[0].trim();
  }

  return normalized || null;
}

export function getAuthCandidateHeaders(request) {
  return Object.fromEntries(
    AUTH_CANDIDATE_FIELDS.map(([key, headerName]) => [key, getHeaderValue(request, headerName)])
  );
}

export function getRequestIdentityDiagnostics(request) {
  const authCandidates = getAuthCandidateHeaders(request);
  const identityCandidates = Object.fromEntries(
    IDENTITY_CANDIDATE_KEYS.map((key) => [key, normalizeText(authCandidates[key])])
  );
  const populatedIdentityFields = IDENTITY_CANDIDATE_KEYS.filter(
    (key) => Boolean(identityCandidates[key])
  );
  const config = getEntraApplicationConfig();
  const cookieNames = getCookieNames(request);
  const likelyAuthUser = getLikelyAuthUser(authCandidates);

  return {
    requestId: request.requestId ?? null,
    request: {
      method: request.method,
      path: request.originalUrl ?? request.url ?? request.path,
      host: normalizeText(getHeaderValue(request, 'Host')),
      forwardedHost: normalizeText(getHeaderValue(request, 'X-Forwarded-Host')),
      forwardedProto: normalizeText(getHeaderValue(request, 'X-Forwarded-Proto')),
      forwardedPort: normalizeText(getHeaderValue(request, 'X-Forwarded-Port')),
      forwardedUri: normalizeText(getHeaderValue(request, 'X-Forwarded-Uri')),
      originalUrl: normalizeText(getHeaderValue(request, 'X-Original-Url'))
    },
    socket: {
      localAddress: request.socket?.localAddress ?? null,
      localPort: request.socket?.localPort ?? null,
      remoteAddress: request.socket?.remoteAddress ?? null,
      remotePort: request.socket?.remotePort ?? null,
      expectedSidecarSource: '127.0.0.1 or ::ffff:127.0.0.1'
    },
    identity: {
      populatedIdentityFields,
      candidates: identityCandidates,
      likelyAuthUser: normalizeText(likelyAuthUser),
      normalizedEmployeeIdentifier: normalizePotentialNetworkId(likelyAuthUser)
    },
    sessionTransport: {
      cookieHeaderPresent: cookieNames.length > 0,
      cookieNames,
      oauth2ProxyCookiePresent: cookieNames.includes('__Host-qmiscorecard'),
      accessTokenPresent: Boolean(getBearerToken(request)),
      authorizationHeaderPresent: Boolean(getAuthorizationScheme(request)),
      authorizationScheme: getAuthorizationScheme(request) || null,
      forwardedAccessTokenPresent: Boolean(
        normalizeText(getHeaderValue(request, 'X-Forwarded-Access-Token'))
        || normalizeText(getHeaderValue(request, 'X-Auth-Request-Access-Token'))
      ),
      forwardedForPresent: Boolean(authCandidates.x_forwarded_for),
      realIpHeaderPresent: Boolean(getHeaderValue(request, 'X-Real-Ip')),
      requestIdHeader: normalizeText(getHeaderValue(request, 'X-Request-Id'))
    },
    configuration: {
      entraApplicationIdConfigured: Boolean(config.applicationId),
      entraObjectIdConfigured: Boolean(config.objectId),
      entraDirectoryIdConfigured: Boolean(config.directoryId),
      hardcodedFallbackAllowed: shouldAllowHardcodedIdentityFallback(),
      nodeEnvironment: process.env.NODE_ENV || ''
    }
  };
}

function isLoopbackAddress(value) {
  const normalizedValue = normalizeText(value).toLowerCase();
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(normalizedValue);
}

export function getRequestIdentityLogSummary(request) {
  const diagnostics = getRequestIdentityDiagnostics(request);
  const { candidates } = diagnostics.identity;

  return {
    diagnosticsVersion: IDENTITY_DIAGNOSTICS_VERSION,
    requestId: diagnostics.requestId,
    method: diagnostics.request.method,
    path: diagnostics.request.path,
    host: diagnostics.request.host,
    forwardedHost: diagnostics.request.forwardedHost,
    forwardedProto: diagnostics.request.forwardedProto,
    forwardedPort: diagnostics.request.forwardedPort,
    remoteAddress: diagnostics.socket.remoteAddress,
    remotePort: diagnostics.socket.remotePort,
    localAddress: diagnostics.socket.localAddress,
    localPort: diagnostics.socket.localPort,
    requestArrivedFromLoopbackSidecar: isLoopbackAddress(diagnostics.socket.remoteAddress),
    populatedIdentityFields: diagnostics.identity.populatedIdentityFields,
    forwardedEmployeeId: candidates.x_forwarded_employeeid,
    forwardedUser: candidates.x_forwarded_user,
    forwardedPreferredUsername: candidates.x_forwarded_preferred_username,
    forwardedEmail: candidates.x_forwarded_email,
    authRequestUser: candidates.x_auth_request_user,
    authRequestPreferredUsername: candidates.x_auth_request_preferred_username,
    authRequestEmail: candidates.x_auth_request_email,
    normalizedEmployeeIdentifier: diagnostics.identity.normalizedEmployeeIdentifier,
    cookieNames: diagnostics.sessionTransport.cookieNames,
    oauth2ProxyCookiePresent: diagnostics.sessionTransport.oauth2ProxyCookiePresent,
    accessTokenPresent: diagnostics.sessionTransport.accessTokenPresent,
    authorizationHeaderPresent: diagnostics.sessionTransport.authorizationHeaderPresent,
    authorizationScheme: diagnostics.sessionTransport.authorizationScheme,
    forwardedAccessTokenPresent: diagnostics.sessionTransport.forwardedAccessTokenPresent,
    forwardedForPresent: diagnostics.sessionTransport.forwardedForPresent,
    requestIdHeader: diagnostics.sessionTransport.requestIdHeader,
    entraApplicationIdConfigured: diagnostics.configuration.entraApplicationIdConfigured,
    entraObjectIdConfigured: diagnostics.configuration.entraObjectIdConfigured,
    entraDirectoryIdConfigured: diagnostics.configuration.entraDirectoryIdConfigured,
    hardcodedFallbackAllowed: diagnostics.configuration.hardcodedFallbackAllowed,
    nodeEnvironment: diagnostics.configuration.nodeEnvironment
  };
}

export function getLikelyAuthUser(authCandidates = {}) {
  return (
    authCandidates.x_forwarded_employeeid
    || authCandidates.x_forwarded_user
    || authCandidates.x_forwarded_preferred_username
    || authCandidates.x_forwarded_email
    || authCandidates.x_auth_request_user
    || authCandidates.x_auth_request_preferred_username
    || authCandidates.x_auth_request_email
    || null
  );
}

function assertExpectedEntraRegistration(authCandidates) {
  const config = getEntraApplicationConfig();
  const actualTenantId = normalizeText(authCandidates.x_entra_tenant_id).toLowerCase();
  const actualApplicationId = normalizeText(authCandidates.x_entra_application_id).toLowerCase();

  if (
    config.directoryId
    && actualTenantId
    && config.directoryId.toLowerCase() !== actualTenantId
  ) {
    throw createGraphIdentityError(
      'OAuth2 Proxy supplied an Entra tenant that does not match ENTRA_DIRECTORY_ID.',
      401
    );
  }

  if (
    config.applicationId
    && actualApplicationId
    && config.applicationId.toLowerCase() !== actualApplicationId
  ) {
    throw createGraphIdentityError(
      'OAuth2 Proxy supplied an audience that does not match ENTRA_APPLICATION_ID.',
      401
    );
  }
}

function sanitizeGraphErrorMessage(payload, statusCode, bearerToken = '') {
  const graphMessage = payload?.error?.message;
  const fallbackMessage = `Microsoft Graph request failed with status ${statusCode}.`;
  const normalizedMessage = String(graphMessage || fallbackMessage)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const redactedMessage = bearerToken
    ? normalizedMessage.split(bearerToken).join('[redacted]')
    : normalizedMessage;

  return redactedMessage.slice(0, 500) || fallbackMessage;
}

function createGraphIdentityError(message, statusCode, accessTokenPresent = true) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.graphDiagnostics = {
    accessTokenPresent,
    succeeded: false,
    statusCode,
    errorMessage: message
  };

  return error;
}

function normalizeGraphProfile(payload = {}) {
  return Object.fromEntries(
    MICROSOFT_GRAPH_PROFILE_PROPERTIES.map((propertyName) => [
      propertyName,
      normalizeText(payload?.[propertyName])
    ])
  );
}

export async function getMicrosoftGraphProfile(request, { fetchImpl = fetch } = {}) {
  const bearerToken = getBearerToken(request);

  if (!bearerToken) {
    throw createGraphIdentityError(
      'No delegated Microsoft Graph access token was forwarded by OAuth2 Proxy.',
      401,
      false
    );
  }

  let graphResponse;

  try {
    graphResponse = await fetchImpl(MICROSOFT_GRAPH_ME_URL, {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${bearerToken}`
      }
    });
  } catch (error) {
    const message = error?.name === 'TimeoutError'
      ? 'Microsoft Graph /me request timed out.'
      : 'Unable to reach Microsoft Graph /me.';

    throw createGraphIdentityError(message, 502);
  }

  let graphPayload = null;

  try {
    graphPayload = await graphResponse.json();
  } catch {
    graphPayload = null;
  }

  if (!graphResponse.ok) {
    throw createGraphIdentityError(
      sanitizeGraphErrorMessage(graphPayload, graphResponse.status, bearerToken),
      graphResponse.status
    );
  }

  return {
    profile: normalizeGraphProfile(graphPayload),
    diagnostics: {
      accessTokenPresent: true,
      succeeded: true,
      statusCode: graphResponse.status,
      errorMessage: ''
    }
  };
}

export function buildRosterIdentifierCandidates(graphProfile = {}, authCandidates = {}) {
  const candidates = [];
  const seenValues = new Set();

  const addCandidate = (source, rawValue) => {
    const value = normalizePotentialNetworkId(rawValue);
    const normalizedValue = normalizeText(value).toLowerCase();

    if (!normalizedValue || seenValues.has(normalizedValue)) {
      return;
    }

    seenValues.add(normalizedValue);
    candidates.push({ source, value });
  };

  addCandidate('onPremisesSamAccountName', graphProfile.onPremisesSamAccountName);
  addCandidate('employeeId', graphProfile.employeeId);

  const forwardedIdentityFields = [
    ['x_forwarded_employeeid', 'x_forwarded_employeeid'],
    ['x_forwarded_user', 'x_forwarded_user'],
    ['x_forwarded_preferred_username', 'x_forwarded_preferred_username'],
    ['x_forwarded_email', 'x_forwarded_email'],
    ['x_auth_request_user', 'x_auth_request_user'],
    ['x_auth_request_preferred_username', 'x_auth_request_preferred_username'],
    ['x_auth_request_email', 'x_auth_request_email']
  ];

  forwardedIdentityFields.forEach(([source, key]) => {
    addCandidate(source, authCandidates[key]);
  });

  addCandidate('userPrincipalName', graphProfile.userPrincipalName);
  addCandidate('mail', graphProfile.mail);

  return candidates;
}

function buildGraphBackedIdentity(graphProfile, authCandidates, graphDiagnostics) {
  const identifierCandidates = buildRosterIdentifierCandidates(
    graphProfile,
    authCandidates
  );
  const primaryIdentifier = identifierCandidates[0]?.value ?? '';
  const email = normalizeText(
    graphProfile.mail
    || authCandidates.x_forwarded_email
    || authCandidates.x_auth_request_email
  );
  const userPrincipalName = normalizeText(graphProfile.userPrincipalName);

  return {
    source: 'entra-graph',
    employee_id: primaryIdentifier,
    network_id: primaryIdentifier,
    email,
    name: normalizeText(graphProfile.displayName || authCandidates.x_forwarded_name),
    preferred_username: userPrincipalName || normalizeText(getLikelyAuthUser(authCandidates)),
    entra_user_object_id: normalizeText(graphProfile.id),
    entra_tenant_id: normalizeText(authCandidates.x_entra_tenant_id),
    displayName: normalizeText(graphProfile.displayName),
    userPrincipalName,
    employeeId: normalizeText(graphProfile.employeeId),
    onPremisesSamAccountName: normalizeText(graphProfile.onPremisesSamAccountName),
    graph_status_code: graphDiagnostics?.statusCode ?? null,
    identifier_candidates: identifierCandidates
  };
}

export function getDerivedNetworkIdFromRequest(request) {
  return normalizePotentialNetworkId(getLikelyAuthUser(getAuthCandidateHeaders(request)));
}

export async function resolveRequestIdentity(
  request,
  fallbackNetworkId = HARDCODED_NETWORK_ID
) {
  const authCandidates = getAuthCandidateHeaders(request);
  const bearerToken = getBearerToken(request);

  if (bearerToken) {
    assertExpectedEntraRegistration(authCandidates);

    const { profile, diagnostics } = await getMicrosoftGraphProfile(request);
    const graphIdentity = buildGraphBackedIdentity(profile, authCandidates, diagnostics);

    if (graphIdentity.identifier_candidates.length > 0) {
      return graphIdentity;
    }

    const error = createGraphIdentityError(
      'Microsoft Graph /me succeeded but returned no usable roster identifier candidates.',
      422
    );

    error.resolvedIdentity = graphIdentity;
    throw error;
  }

  if (shouldAllowHardcodedIdentityFallback()) {
    return buildHardcodedFallbackIdentity(fallbackNetworkId);
  }

  const error = createGraphIdentityError(
    'No delegated Microsoft Graph access token was forwarded by OAuth2 Proxy, and hardcoded fallback is disabled.',
    401,
    false
  );

  error.identityDiagnostics = getRequestIdentityLogSummary(request);
  throw error;
}

export function getRequestNetworkId(
  request,
  fallbackNetworkId = HARDCODED_NETWORK_ID
) {
  const derivedNetworkId = getDerivedNetworkIdFromRequest(request);

  if (derivedNetworkId) {
    return derivedNetworkId;
  }

  return shouldAllowHardcodedIdentityFallback() ? fallbackNetworkId : null;
}
