export const HARDCODED_NETWORK_ID = 'N35589';

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
    entra_tenant_id: ''
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
      authorizationHeaderPresent: Boolean(getAuthorizationScheme(request)),
      authorizationScheme: getAuthorizationScheme(request) || null,
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
    throw new Error('OAuth2 Proxy supplied an Entra tenant that does not match ENTRA_DIRECTORY_ID.');
  }

  if (
    config.applicationId
    && actualApplicationId
    && config.applicationId.toLowerCase() !== actualApplicationId
  ) {
    throw new Error('OAuth2 Proxy supplied an audience that does not match ENTRA_APPLICATION_ID.');
  }
}

function getHeaderBackedIdentity(authCandidates = {}) {
  const employeeId = normalizePotentialNetworkId(getLikelyAuthUser(authCandidates));

  if (!employeeId) {
    return null;
  }

  assertExpectedEntraRegistration(authCandidates);

  return {
    source: 'entra-oauth2-proxy',
    employee_id: employeeId,
    network_id: employeeId,
    email: normalizeText(
      authCandidates.x_forwarded_email
      || authCandidates.x_auth_request_email
    ),
    name: normalizeText(authCandidates.x_forwarded_name),
    preferred_username: normalizeText(
      authCandidates.x_forwarded_preferred_username
      || authCandidates.x_forwarded_user
      || authCandidates.x_auth_request_preferred_username
      || authCandidates.x_auth_request_user
    ),
    entra_user_object_id: normalizeText(authCandidates.x_entra_user_object_id),
    entra_tenant_id: normalizeText(authCandidates.x_entra_tenant_id)
  };
}

export function getDerivedNetworkIdFromRequest(request) {
  return normalizePotentialNetworkId(getLikelyAuthUser(getAuthCandidateHeaders(request)));
}

export async function resolveRequestIdentity(
  request,
  fallbackNetworkId = HARDCODED_NETWORK_ID
) {
  const headerIdentity = getHeaderBackedIdentity(getAuthCandidateHeaders(request));

  if (headerIdentity?.employee_id) {
    return headerIdentity;
  }

  if (shouldAllowHardcodedIdentityFallback()) {
    return buildHardcodedFallbackIdentity(fallbackNetworkId);
  }

  throw new Error(
    'No Microsoft Entra identity was forwarded by OAuth2 Proxy, and hardcoded fallback is disabled.'
  );
}

export function getRequestNetworkId(
  request,
  fallbackNetworkId = HARDCODED_NETWORK_ID
) {
  return getDerivedNetworkIdFromRequest(request) || fallbackNetworkId;
}
