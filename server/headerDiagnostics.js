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

function getHeaderValue(request, name) {
  return request.get(name) ?? null;
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

function normalizePotentialNetworkId(value) {
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

function getAuthCandidateHeaders(request) {
  return Object.fromEntries(
    AUTH_CANDIDATE_FIELDS.map(([key, headerName]) => [key, getHeaderValue(request, headerName)])
  );
}

function getLikelyAuthUser(authCandidates = {}) {
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

function buildAuthTransportDebug(request, authCandidates) {
  const identityFieldNames = [
    'auth_user',
    'remote_user',
    'x_auth_header',
    'x_auth_user',
    'x_client_auth_user',
    'x_remote_user',
    'x_logon_user',
    'x_iis_windowsauthuserid',
    'x_iisnode_auth_user',
    'x_forwarded_user',
    'x_forwarded_preferred_username',
    'x_ms_client_principal_name',
    'x_ms_client_principal_id'
  ];
  const populatedIdentityFields = identityFieldNames.filter((fieldName) => Boolean(authCandidates[fieldName]));
  const authorization = getAuthorizationDebug(request, 'Authorization');
  const proxyAuthorization = getAuthorizationDebug(request, 'Proxy-Authorization');

  return {
    backendSeesAuthorizationHeader: authorization.present,
    authorizationScheme: authorization.scheme,
    authorizationPreview: authorization.preview,
    backendSeesProxyAuthorizationHeader: proxyAuthorization.present,
    proxyAuthorizationScheme: proxyAuthorization.scheme,
    populatedIdentityFields,
    backendSeesForwardedIdentity: populatedIdentityFields.length > 0,
    backendSeesAuthType: Boolean(authCandidates.x_auth_type || authCandidates.x_client_auth_type),
    note: 'Upstream proxies often strip Authorization before the app sees the request, so forwarded identity headers usually matter more.'
  };
}

export function buildHeadersDebugPayload(request) {
  const authCandidates = getAuthCandidateHeaders(request);
  const likelyAuthUser = getLikelyAuthUser(authCandidates);

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
    authCandidates,
    networkIdPreview: {
      normalizedCandidates: Object.fromEntries(
        Object.entries(authCandidates).map(([name, value]) => [name, normalizePotentialNetworkId(value)])
      ),
      derivedFromCandidates: normalizePotentialNetworkId(likelyAuthUser)
    },
    headers: request.headers,
    rawHeaders: request.rawHeaders
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
  const authType = payload.authCandidates?.x_auth_type
    || payload.authCandidates?.x_client_auth_type
    || 'Unknown';
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
        ${renderSummaryCard('Backend PID', payload.process?.pid)}
        ${renderSummaryCard('Authorization Header Visible', payload.authTransport?.backendSeesAuthorizationHeader ? 'Yes' : 'No')}
        ${renderSummaryCard('Forwarded Identity Fields', populatedIdentityFields)}
        ${renderSummaryCard('Derived Network ID', payload.networkIdPreview?.derivedFromCandidates)}
      </section>

      <section class="sections">
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
