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
  ['x_ms_client_principal_name', 'X-MS-CLIENT-PRINCIPAL-NAME'],
  ['x_ms_client_principal_id', 'X-MS-CLIENT-PRINCIPAL-ID'],
  ['x_original_host', 'X-Original-Host'],
  ['x_original_url', 'X-Original-Url'],
  ['x_forwarded_host', 'X-Forwarded-Host'],
  ['x_forwarded_proto', 'X-Forwarded-Proto'],
  ['x_forwarded_for', 'X-Forwarded-For'],
  ['x_https', 'X-Https']
];

export function getHeaderValue(request, name) {
  return request.get(name) ?? null;
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

export function getLikelyAuthUser(authCandidates = {}) {
  return (
    authCandidates.x_auth_header
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

export function getDerivedNetworkIdFromRequest(request) {
  const authCandidates = getAuthCandidateHeaders(request);

  return normalizePotentialNetworkId(getLikelyAuthUser(authCandidates));
}

export function getRequestNetworkId(
  request,
  fallbackNetworkId = HARDCODED_NETWORK_ID
) {
  return getDerivedNetworkIdFromRequest(request) || fallbackNetworkId;
}
