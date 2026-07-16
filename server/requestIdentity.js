export const HARDCODED_NETWORK_ID = 'N35589';

const AUTH_CANDIDATE_FIELDS = [
  ['auth_user', 'AUTH_USER'],
  ['remote_user', 'REMOTE_USER'],
  ['x_auth_header', 'X-Auth-Header'],
  ['x_auth_user', 'X-Auth-User'],
  ['x_client_auth_user', 'X-Client-Auth-User'],
  ['x_remote_user', 'X-Remote-User'],
  ['x_logon_user', 'X-Logon-User'],
  ['x_auth_type', 'X-Auth-Type'],
  ['x_client_auth_type', 'X-Client-Auth-Type'],
  ['x_iis_windowsauthuserid', 'X-IIS-WindowsAuthUserId'],
  ['x_iisnode_auth_user', 'X-IISNODE-AUTH_USER'],
  ['x_forwarded_user', 'X-Forwarded-User'],
  ['x_forwarded_preferred_username', 'X-Forwarded-Preferred-Username'],
  ['x_forwarded_name', 'X-Forwarded-Name'],
  ['x_forwarded_email', 'X-Forwarded-Email'],
  ['x_forwarded_employeeid', 'X-Forwarded-EmployeeId'],
  ['x_auth_request_user', 'X-Auth-Request-User'],
  ['x_auth_request_preferred_username', 'X-Auth-Request-Preferred-Username'],
  ['x_auth_request_name', 'X-Auth-Request-Name'],
  ['x_auth_request_email', 'X-Auth-Request-Email'],
  ['x_auth_request_employeeid', 'X-Auth-Request-EmployeeId'],
  ['x_employeeid', 'X-EmployeeId'],
  ['x_email', 'X-Email'],
  ['x_name', 'X-Name'],
  ['x_ms_client_principal_name', 'X-MS-CLIENT-PRINCIPAL-NAME'],
  ['x_ms_client_principal_id', 'X-MS-CLIENT-PRINCIPAL-ID'],
  ['x_forwarded_access_token', 'X-Forwarded-Access-Token'],
  ['x_auth_request_access_token', 'X-Auth-Request-Access-Token'],
  ['x_access_token', 'X-Access-Token'],
  ['x_original_host', 'X-Original-Host'],
  ['x_original_url', 'X-Original-Url'],
  ['x_forwarded_host', 'X-Forwarded-Host'],
  ['x_forwarded_proto', 'X-Forwarded-Proto'],
  ['x_forwarded_for', 'X-Forwarded-For'],
  ['x_https', 'X-Https']
];

const KEYCLOAK_EMPLOYEE_ID_CLAIMS = ['employeeid', 'employee_id', 'employeeId'];
const KEYCLOAK_NAME_CLAIMS = ['name', 'display_name', 'displayName'];
const KEYCLOAK_EMAIL_CLAIMS = ['email'];
const KEYCLOAK_USERNAME_CLAIMS = ['preferred_username', 'username', 'upn'];
const KEYCLOAK_DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;

let discoveryCache = {
  issuerUrl: '',
  fetchedAt: 0,
  metadata: null
};

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

function buildHardcodedFallbackIdentity(fallbackNetworkId = HARDCODED_NETWORK_ID) {
  return {
    source: 'hardcoded-fallback',
    employee_id: fallbackNetworkId,
    network_id: fallbackNetworkId,
    email: '',
    name: '',
    preferred_username: ''
  };
}

function getKeycloakConfig() {
  return {
    issuerUrl: getFirstDefinedEnvValue(
      'keycloak_issuer_url',
      'KEYCLOAK_ISSUER_URL',
      'oidc_issuer_url',
      'OIDC_ISSUER_URL'
    ),
    introspectionUrl: getFirstDefinedEnvValue(
      'keycloak_introspection_url',
      'KEYCLOAK_INTROSPECTION_URL',
      'oidc_introspection_url',
      'OIDC_INTROSPECTION_URL'
    ),
    clientId: getFirstDefinedEnvValue(
      'keycloak_client_id',
      'KEYCLOAK_CLIENT_ID',
      'oidc_client_id',
      'OIDC_CLIENT_ID'
    ),
    clientSecret: getFirstDefinedEnvValue(
      'keycloak_client_secret',
      'KEYCLOAK_CLIENT_SECRET',
      'oidc_client_secret',
      'OIDC_CLIENT_SECRET'
    )
  };
}

function isKeycloakConfigured(config = getKeycloakConfig()) {
  return Boolean(
    config.clientId
    && config.clientSecret
    && (config.issuerUrl || config.introspectionUrl)
  );
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

function parseBearerToken(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  const bearerMatch = normalizedValue.match(/^Bearer\s+(.+)$/i);

  if (bearerMatch?.[1]) {
    return bearerMatch[1].trim() || null;
  }

  if (normalizedValue.split('.').length === 3) {
    return normalizedValue;
  }

  return null;
}

export function getBearerToken(request) {
  const authorizationToken = parseBearerToken(getHeaderValue(request, 'Authorization'));

  if (authorizationToken) {
    return authorizationToken;
  }

  const fallbackHeaderNames = [
    'X-Forwarded-Access-Token',
    'X-Auth-Request-Access-Token',
    'X-Access-Token'
  ];

  for (const headerName of fallbackHeaderNames) {
    const headerToken = parseBearerToken(getHeaderValue(request, headerName));

    if (headerToken) {
      return headerToken;
    }
  }

  return null;
}

export function getAuthCandidateHeaders(request) {
  return Object.fromEntries(
    AUTH_CANDIDATE_FIELDS.map(([key, headerName]) => [key, getHeaderValue(request, headerName)])
  );
}

export function getLikelyAuthUser(authCandidates = {}) {
  return (
    authCandidates.x_forwarded_employeeid
    || authCandidates.x_auth_request_employeeid
    || authCandidates.x_employeeid
    || authCandidates.x_auth_request_user
    || authCandidates.x_auth_request_preferred_username
    || authCandidates.x_auth_header
    || authCandidates.x_auth_user
    || authCandidates.x_client_auth_user
    || authCandidates.x_logon_user
    || authCandidates.x_remote_user
    || authCandidates.auth_user
    || authCandidates.remote_user
    || authCandidates.x_iis_windowsauthuserid
    || authCandidates.x_iisnode_auth_user
    || authCandidates.x_forwarded_user
    || authCandidates.x_forwarded_preferred_username
    || authCandidates.x_ms_client_principal_name
    || authCandidates.x_ms_client_principal_id
    || null
  );
}

function getHeaderBackedIdentity(authCandidates = {}) {
  const employeeId = normalizePotentialNetworkId(getLikelyAuthUser(authCandidates));

  if (!employeeId) {
    return null;
  }

  return {
    source: 'forwarded-header',
    employee_id: employeeId,
    network_id: employeeId,
    email: normalizeText(
      authCandidates.x_forwarded_email
      || authCandidates.x_auth_request_email
      || authCandidates.x_email
    ),
    name: normalizeText(
      authCandidates.x_forwarded_name
      || authCandidates.x_auth_request_name
      || authCandidates.x_name
    ),
    preferred_username: normalizeText(
      authCandidates.x_forwarded_preferred_username
      || authCandidates.x_auth_request_preferred_username
      || authCandidates.x_forwarded_user
      || authCandidates.x_auth_request_user
      || authCandidates.x_auth_user
      || authCandidates.auth_user
    )
  };
}

export function getDerivedNetworkIdFromRequest(request) {
  const authCandidates = getAuthCandidateHeaders(request);
  return normalizePotentialNetworkId(getLikelyAuthUser(authCandidates));
}

async function getKeycloakDiscoveryDocument(issuerUrl) {
  const normalizedIssuerUrl = normalizeText(issuerUrl).replace(/\/+$/, '');

  if (!normalizedIssuerUrl) {
    return null;
  }

  if (
    discoveryCache.metadata
    && discoveryCache.issuerUrl === normalizedIssuerUrl
    && Date.now() - discoveryCache.fetchedAt < KEYCLOAK_DISCOVERY_CACHE_TTL_MS
  ) {
    return discoveryCache.metadata;
  }

  const discoveryUrl = `${normalizedIssuerUrl}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl);

  if (!response.ok) {
    throw new Error(`Keycloak discovery request failed with status ${response.status}.`);
  }

  const metadata = await response.json();

  discoveryCache = {
    issuerUrl: normalizedIssuerUrl,
    fetchedAt: Date.now(),
    metadata
  };

  return metadata;
}

async function getKeycloakIntrospectionUrl(config) {
  if (config.introspectionUrl) {
    return config.introspectionUrl;
  }

  if (!config.issuerUrl) {
    return null;
  }

  const metadata = await getKeycloakDiscoveryDocument(config.issuerUrl);
  return metadata?.introspection_endpoint ?? null;
}

function getFirstClaimValue(claims, claimNames) {
  for (const claimName of claimNames) {
    const value = claims?.[claimName];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
}

function normalizeKeycloakIdentityFromClaims(claims) {
  const explicitEmployeeId = normalizePotentialNetworkId(
    getFirstClaimValue(claims, KEYCLOAK_EMPLOYEE_ID_CLAIMS)
  );
  const preferredUsername = normalizeText(
    getFirstClaimValue(claims, KEYCLOAK_USERNAME_CLAIMS)
  );
  const fallbackIdentifier = normalizePotentialNetworkId(preferredUsername);
  const employeeId = explicitEmployeeId || fallbackIdentifier;

  if (!employeeId) {
    return null;
  }

  return {
    source: 'keycloak-introspection',
    employee_id: employeeId,
    network_id: employeeId,
    email: normalizeText(getFirstClaimValue(claims, KEYCLOAK_EMAIL_CLAIMS)),
    name: normalizeText(getFirstClaimValue(claims, KEYCLOAK_NAME_CLAIMS)),
    preferred_username: preferredUsername
  };
}

async function introspectKeycloakAccessToken(token, config) {
  const introspectionUrl = await getKeycloakIntrospectionUrl(config);

  if (!introspectionUrl) {
    throw new Error(
      'Keycloak introspection could not run because no introspection endpoint is configured or discoverable.'
    );
  }

  const requestBody = new URLSearchParams({
    token,
    client_id: config.clientId,
    client_secret: config.clientSecret
  });
  const response = await fetch(introspectionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: requestBody
  });

  if (!response.ok) {
    throw new Error(`Keycloak introspection request failed with status ${response.status}.`);
  }

  return response.json();
}

async function getKeycloakBackedIdentity(request) {
  const config = getKeycloakConfig();

  if (!isKeycloakConfigured(config)) {
    return null;
  }

  const token = getBearerToken(request);

  if (!token) {
    return null;
  }

  const introspectionPayload = await introspectKeycloakAccessToken(token, config);

  if (!introspectionPayload?.active) {
    throw new Error('Keycloak reported an inactive access token.');
  }

  return normalizeKeycloakIdentityFromClaims(introspectionPayload);
}

export async function resolveRequestIdentity(
  request,
  fallbackNetworkId = HARDCODED_NETWORK_ID
) {
  const keycloakConfig = getKeycloakConfig();
  const bearerToken = getBearerToken(request);

  if (bearerToken && isKeycloakConfigured(keycloakConfig)) {
    const keycloakIdentity = await getKeycloakBackedIdentity(request);

    if (keycloakIdentity?.employee_id) {
      return keycloakIdentity;
    }

    throw new Error(
      'Keycloak access token was present and active, but no usable employee identifier claim was found.'
    );
  }

  const authCandidates = getAuthCandidateHeaders(request);
  const headerIdentity = getHeaderBackedIdentity(authCandidates);

  if (headerIdentity?.employee_id) {
    return headerIdentity;
  }

  if (bearerToken && isKeycloakConfigured(keycloakConfig)) {
    throw new Error(
      'Keycloak access token was present, but the backend could not resolve a usable identity from it.'
    );
  }

  if (shouldAllowHardcodedIdentityFallback()) {
    return buildHardcodedFallbackIdentity(fallbackNetworkId);
  }

  throw new Error(
    'No forwarded identity headers or Keycloak-backed identity were available, and hardcoded fallback is disabled.'
  );
}

export function getRequestNetworkId(
  request,
  fallbackNetworkId = HARDCODED_NETWORK_ID
) {
  return getDerivedNetworkIdFromRequest(request) || fallbackNetworkId;
}
