import {
  HARDCODED_NETWORK_ID,
  getAuthCandidateHeaders,
  getBearerToken,
  getHeaderValue,
  getLikelyAuthUser,
  getRequestIdentityDiagnostics,
  normalizePotentialNetworkId
} from './requestIdentity.js';
import { readCurrentUser } from './currentUserRepository.js';

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-auth-request-access-token',
  'x-forwarded-access-token'
]);

function redactHeaderValue(name, value) {
  return SENSITIVE_HEADER_NAMES.has(String(name).toLowerCase()) && value
    ? '<redacted>'
    : value;
}

function redactHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, redactHeaderValue(name, value)])
  );
}

function redactRawHeaders(rawHeaders = []) {
  return rawHeaders.map((value, index) => (
    index % 2 === 1
      ? redactHeaderValue(rawHeaders[index - 1], value)
      : value
  ));
}

function getAuthorizationDebug(request, headerName = 'Authorization') {
  const value = getHeaderValue(request, headerName);

  if (!value) {
    return {
      present: false,
      scheme: null,
      preview: null
    };
  }

  const normalizedValue = String(value).trim();
  const scheme = normalizedValue.split(/\s+/, 1)[0] || null;

  return {
    present: true,
    scheme,
    preview: scheme ? `${scheme} <redacted>` : '<redacted>'
  };
}

function buildAuthTransportDebug(request, authCandidates) {
  const identityFieldNames = [
    'x_forwarded_user',
    'x_forwarded_preferred_username',
    'x_forwarded_employeeid',
    'x_forwarded_name',
    'x_forwarded_email',
    'x_auth_request_user',
    'x_auth_request_preferred_username',
    'x_auth_request_email',
    'x_entra_user_object_id',
    'x_entra_tenant_id',
    'x_entra_application_id'
  ];
  const populatedIdentityFields = identityFieldNames.filter((fieldName) => Boolean(authCandidates[fieldName]));
  const authorization = getAuthorizationDebug(request, 'Authorization');
  const proxyAuthorization = getAuthorizationDebug(request, 'Proxy-Authorization');

  return {
    forwardedAccessTokenPresent: Boolean(getBearerToken(request)),
    backendSeesAuthorizationHeader: authorization.present,
    authorizationScheme: authorization.scheme,
    authorizationPreview: authorization.preview,
    backendSeesProxyAuthorizationHeader: proxyAuthorization.present,
    proxyAuthorizationScheme: proxyAuthorization.scheme,
    populatedIdentityFields,
    backendSeesForwardedIdentity: populatedIdentityFields.length > 0,
    note: 'OAuth2 Proxy authenticates the Entra session and forwards the identity headers shown here.'
  };
}

export async function buildHeadersDebugPayload(request) {
  const authCandidates = getAuthCandidateHeaders(request);
  const likelyAuthUser = getLikelyAuthUser(authCandidates);
  let currentUser = null;
  let resolvedIdentity = null;
  let identityResolutionError = null;

  try {
    currentUser = await readCurrentUser(request);
  } catch (error) {
    resolvedIdentity = error.resolvedIdentity ?? null;
    identityResolutionError = {
      statusCode: error.graphDiagnostics?.statusCode ?? error.statusCode ?? null,
      message: error.graphDiagnostics?.errorMessage || error.message
    };
  }

  const graphIdentity = currentUser?.identity_source === 'entra-graph'
    ? currentUser
    : resolvedIdentity?.source === 'entra-graph'
      ? resolvedIdentity
      : null;
  const graphSucceeded = Boolean(graphIdentity);
  const graphDiagnostics = {
    accessTokenPresent: Boolean(getBearerToken(request)),
    succeeded: graphSucceeded,
    statusCode: graphSucceeded
      ? graphIdentity?.graph_status_code ?? 200
      : identityResolutionError?.statusCode,
    errorMessage: graphSucceeded ? '' : identityResolutionError?.message || '',
    displayName: graphIdentity?.displayName || '',
    userPrincipalName: graphIdentity?.userPrincipalName || '',
    employeeId: graphIdentity?.employeeId || '',
    onPremisesSamAccountName: graphIdentity?.onPremisesSamAccountName || '',
    entraUserObjectId: graphIdentity?.entra_user_object_id || ''
  };
  const rosterResolution = {
    chosenCandidate: currentUser?.matched_identifier || '',
    matchedIdentifierSource: currentUser?.matched_identifier_source || '',
    matchedBy: currentUser?.matchedBy || '',
    networkId: currentUser?.network_id || '',
    myId: currentUser?.my_id || '',
    name: currentUser?.name || ''
  };

  return {
    generatedAt: new Date().toISOString(),
    process: {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd()
    },
    request: {
      method: request.method,
      originalUrl: request.originalUrl,
      path: request.path,
      protocol: request.protocol,
      secure: request.secure,
      hostname: request.hostname,
      ip: request.ip,
      ips: request.ips,
      httpVersion: request.httpVersion
    },
    socket: {
      localAddress: request.socket?.localAddress ?? null,
      localPort: request.socket?.localPort ?? null,
      remoteAddress: request.socket?.remoteAddress ?? null,
      remotePort: request.socket?.remotePort ?? null
    },
    authTransport: buildAuthTransportDebug(request, authCandidates),
    graph: graphDiagnostics,
    rosterResolution,
    identityDiagnostics: getRequestIdentityDiagnostics(request),
    authCandidates,
    networkIdPreview: {
      normalizedCandidates: Object.fromEntries(
        Object.entries(authCandidates).map(([name, value]) => [name, normalizePotentialNetworkId(value)])
      ),
      derivedFromCandidates: normalizePotentialNetworkId(likelyAuthUser),
      hardcodedFallback: HARDCODED_NETWORK_ID
    },
    headers: redactHeaders(request.headers),
    rawHeaders: redactRawHeaders(request.rawHeaders)
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatJson(value) {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function renderSummaryCard(label, value) {
  return `
    <div class="summary-card">
      <div class="summary-label">${escapeHtml(label)}</div>
      <div class="summary-value">${escapeHtml(value ?? 'None')}</div>
    </div>
  `;
}

function renderDetailsBlock(title, value, isOpen = false) {
  return `
    <details class="details-block"${isOpen ? ' open' : ''}>
      <summary>${escapeHtml(title)}</summary>
      <pre>${formatJson(value)}</pre>
    </details>
  `;
}

export function renderHeadersDebugPage(payload) {
  const likelyAuthUser = getLikelyAuthUser(payload.authCandidates);
  const authType = payload.graph?.succeeded || payload.authTransport?.backendSeesForwardedIdentity
    ? 'Microsoft Entra ID via OAuth2 Proxy'
    : 'Unknown';
  const populatedIdentityFields = Array.isArray(payload.authTransport?.populatedIdentityFields)
    && payload.authTransport.populatedIdentityFields.length > 0
    ? payload.authTransport.populatedIdentityFields.join(', ')
    : 'None';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Header Diagnostics</title>
    <style>
      :root {
        color-scheme: dark;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 24px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        background: #111827;
        color: #e5e7eb;
      }

      a {
        color: #93c5fd;
      }

      .shell {
        max-width: 1280px;
        margin: 0 auto;
        display: grid;
        gap: 20px;
      }

      .hero,
      .panel,
      .details-block {
        border: 1px solid #374151;
        border-radius: 14px;
        background: #1f2937;
      }

      .hero {
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }

      .hero h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }

      .hero p {
        margin: 0;
        line-height: 1.5;
        color: #cbd5e1;
      }

      .actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid #4b5563;
        background: #28223c;
        color: #f9fafb;
        text-decoration: none;
        font-weight: 600;
      }

      .panel {
        padding: 18px 20px;
      }

      .auth-grid,
      .summary-grid {
        display: grid;
        gap: 14px;
      }

      .auth-grid {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }

      .summary-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .auth-row,
      .summary-card {
        border: 1px solid #374151;
        border-radius: 12px;
        background: #111827;
        padding: 14px 16px;
      }

      .auth-label,
      .summary-label {
        display: block;
        margin-bottom: 8px;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #9ca3af;
      }

      .auth-value,
      .summary-value {
        word-break: break-word;
        font-size: 15px;
      }

      .sections {
        display: grid;
        gap: 14px;
      }

      .details-block {
        padding: 0;
        overflow: hidden;
      }

      .details-block summary {
        cursor: pointer;
        list-style: none;
        padding: 16px 18px;
        font-weight: 700;
        background: #1f2937;
      }

      .details-block summary::-webkit-details-marker {
        display: none;
      }

      .details-block pre {
        margin: 0;
        padding: 0 18px 18px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        color: #d1d5db;
      }

      @media (max-width: 800px) {
        body {
          padding: 16px;
        }

        .hero {
          flex-direction: column;
        }

        .actions {
          width: 100%;
          justify-content: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div>
          <h1>Header Diagnostics</h1>
          <p>This page shows the exact request headers and common auth-related forwarded values the backend receives.</p>
        </div>
        <div class="actions">
          <a class="button" href="/headers">Refresh</a>
          <a class="button" href="/api/headers?format=json">View JSON</a>
        </div>
      </section>

      <section class="panel auth-grid">
        <div class="auth-row">
          <span class="auth-label">Likely Auth User</span>
          <div class="auth-value">${escapeHtml(likelyAuthUser || 'Not present')}</div>
        </div>
        <div class="auth-row">
          <span class="auth-label">Auth Type</span>
          <div class="auth-value">${escapeHtml(authType)}</div>
        </div>
      </section>

      <section class="summary-grid">
        ${renderSummaryCard('Generated At', payload.generatedAt)}
        ${renderSummaryCard('Request Path', payload.request?.originalUrl)}
        ${renderSummaryCard('Forwarded Access Token Present', payload.authTransport?.forwardedAccessTokenPresent ? 'Yes' : 'No')}
        ${renderSummaryCard('Graph /me Succeeded', payload.graph?.succeeded ? 'Yes' : 'No')}
        ${renderSummaryCard('Graph Status', payload.graph?.statusCode || 'None')}
        ${renderSummaryCard('Graph Display Name', payload.graph?.displayName || 'None')}
        ${renderSummaryCard('Graph User Principal Name', payload.graph?.userPrincipalName || 'None')}
        ${renderSummaryCard('Graph Employee ID', payload.graph?.employeeId || 'None')}
        ${renderSummaryCard('Graph On-Prem SAM Account', payload.graph?.onPremisesSamAccountName || 'None')}
        ${renderSummaryCard('Roster Lookup Candidate', payload.rosterResolution?.chosenCandidate || 'None')}
        ${renderSummaryCard('Candidate Source', payload.rosterResolution?.matchedIdentifierSource || 'None')}
        ${renderSummaryCard('Matched Roster Column', payload.rosterResolution?.matchedBy || 'None')}
        ${renderSummaryCard('Resulting Network ID', payload.rosterResolution?.networkId || 'None')}
        ${renderSummaryCard('Resulting MyID', payload.rosterResolution?.myId || 'None')}
        ${renderSummaryCard('Forwarded Identity Fields', populatedIdentityFields)}
      </section>

      <section class="sections">
        ${renderDetailsBlock('Microsoft Graph /me', payload.graph, true)}
        ${renderDetailsBlock('Roster Resolution', payload.rosterResolution, true)}
        ${renderDetailsBlock('Auth Transport', payload.authTransport, true)}
        ${renderDetailsBlock('Auth Candidates', payload.authCandidates, true)}
        ${renderDetailsBlock('Network ID Preview', payload.networkIdPreview, true)}
        ${renderDetailsBlock('Request Details', payload.request)}
        ${renderDetailsBlock('Socket Details', payload.socket)}
        ${renderDetailsBlock('All Request Headers', payload.headers, true)}
        ${renderDetailsBlock('Raw Headers', payload.rawHeaders)}
        ${renderDetailsBlock('Full Payload', payload)}
      </section>
    </main>
  </body>
</html>
`;
}
