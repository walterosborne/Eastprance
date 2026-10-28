# OpenShift Notes

This app is set up to deploy with a Docker build strategy.

## What was added

- `Dockerfile copy`
  - contains the first part of the container definition
- `Dockerfile`
  - contains the second part of the container definition
  - builds the React client
  - serves the built client from the Express server
  - binds the app on `PORT` with a default of `8080`
  - is safe for OpenShift's arbitrary UID model
- `.dockerignore`
  - keeps the build context smaller
- `shared/apiHost.mjs`
  - binds to `0.0.0.0` in production so the container is reachable
- `.gitignore`
  - allows `data/sif_data.json` to be committed, since that dataset is not coming from SQL

## Dockerfile layout

The container setup is currently split across:

- `Dockerfile copy`
- `Dockerfile`

Keep both files in sync with whatever build process you use in OpenShift.

## Customer Escapes — Quality Data Mart YY account

**Normal developer workflow:** Keep VS Code, Node and the rest of your computer
signed in under your own account. The QAF connection must use an approved
YY service account and **does not need you to sign in to Windows as YY**.

### OpenShift: password-backed Kerberos for YY

The QAF-only mode `kerberos-password` runs `kinit` with the YY service
account and its password (provided securely on stdin, never as a CLI argument).
It maintains a private Kerberos ticket cache and reacquires a ticket every
30 minutes. The Microsoft SQL Server ODBC driver uses that ticket for the
Customer Escapes connection. The other SQL data sources are unchanged.

Put these keys in an **approved OpenShift Secret** and expose them as
environment variables on the *QMI Node application container* (not just
OAuth2 Proxy):

```dotenv
qafserver=YOUR_SQL_SERVER_FQDN
qafdatabase=Quality Data Mart
qafauth=kerberos-password
qafuser=YOUR_YY_USERNAME
qafrealm=YOUR_AD_KERBEROS_REALM_FQDN
qafpassword=YOUR_YY_PASSWORD
```

`qafrealm` is the actual Kerberos realm (normally the uppercase AD DNS
domain), not necessarily the short `USERDOMAIN` shown by `whoami`.
Optionally set `qafprincipal=YY_USERNAME@REALM.EXAMPLE` instead of
the `qafuser` + `qafrealm` combination if your KDC requires a
different principal form. `qafdomain` is used only for NTLM.
Do **not** put YY credentials in GitHub or client-side `VITE_*` settings.

**System prerequisites remain necessary:** the runtime Linux image must
contain Microsoft ODBC Driver 18 for SQL Server, unixODBC, MIT Kerberos
`kinit` and system libraries; the container must have an appropriate
`krb5.conf` (or `KRB5_CONFIG`); DNS, SPN, clock and network access to
both the SQL Server and Active Directory KDC must work. A legitimate
service-account password and successful Windows sign-in do not by
themselves establish these conditions. Use this password-based workflow
only if permitted by company policy. If a keytab or workload identity
is required, use the existing `qafauth=kerberos` mode with a
platform-provisioned ticket cache instead.

**Testing:** `npm run test:qaf --workspace server` makes a read-only
connection attempt and reports the resulting SQL login and auth scheme.
When the full dashboard is deployed, verify that
`/api/customer-escapes` reports `source: "mssql"`, not the Excel fallback.
No production access is claimed until the real connection is tested.

### Windows YY account access check (no VS Code account switch)

Before investigating OpenShift, use the standalone read-only PowerShell test:
[`scripts/Test-CustomerEscapesWindowsAuth.ps1`](scripts/Test-CustomerEscapesWindowsAuth.ps1).
Detailed instructions are in
[`scripts/README-CustomerEscapesWindowsAuth.md`](scripts/README-CustomerEscapesWindowsAuth.md).

On a workstation using your normal Windows session, launch a **separate**
PowerShell process with the YY account's network credentials:

```cmd
runas /netonly /user:DOMAIN\YY_USERNAME "powershell.exe -NoProfile"
```

Enter the YY password only at Windows' password prompt. In the new
PowerShell window, navigate to the root of the QMI repo and execute:

```powershell
.\scripts\Test-CustomerEscapesWindowsAuth.ps1 -Server "YOUR_SQL_SERVER_FQDN"
```

It uses Windows integrated authentication and prints the **SQL login**
returned by `ORIGINAL_LOGIN()`, the negotiated `KERBEROS` or `NTLM`
scheme, and PASS/FAIL for the three source tables. It does not run Node
or the dashboard, and does not print customer data or store YY passwords.
The rest of your computer, including VS Code, remains under your own
account. If `runas` is blocked, ask IT to run an approved short-lived
scheduled task as YY instead of bypassing corporate restrictions.

### Other authentication modes

`qafauth=ntlm` uses `qafdomain`, `qafuser` and `qafpassword`;
`qafauth=sql` uses SQL credentials. Omitting `qafauth` keeps
the previous default (NTLM if domain present, SQL otherwise).
`qafauth=kerberos` uses an existing integrated identity/ticket.
The account still requires SELECT access to the source QAF tables.

## Important runtime env vars

The server currently reads these SQL settings:

- `server`
- `schema`
- `database`
- `user`
- `password`
- `ROSTER_SERVER`
- `ROSTER_SCHEMA`
- `ROSTER_DATABASE`
- `ROSTER_USER`
- `ROSTER_PASSWORD`
- `ENTRA_APPLICATION_ID`
- `ENTRA_OBJECT_ID`
- `ENTRA_DIRECTORY_ID`
- `ENTRA_CLIENT_SECRET`
- `OAUTH2_PROXY_COOKIE_SECRET`
- `OAUTH2_PROXY_REDIRECT_URL`
- `OAUTH2_PROXY_TRUSTED_PROXY_IPS`
- `ALLOW_HARDCODED_IDENTITY_FALLBACK`

`schema` is optional and defaults to `dbo`, but you should set it if your SQL objects live in a non-default schema.

`RosterExtractFarm` can now come from a separate database connection using these env vars:

- `ROSTER_SERVER`
- `ROSTER_SCHEMA`
- `ROSTER_DATABASE`
- `ROSTER_USER`
- `ROSTER_PASSWORD`

If those are not set, roster falls back to the main SQL connection.

For user identification, Microsoft Entra ID in Azure US Government authenticates users through an OAuth2 Proxy
sidecar. The OpenShift Route and Service send browser traffic to OAuth2 Proxy on port `4180`;
OAuth2 Proxy then forwards authenticated requests to Express on `127.0.0.1:8080`.
Do not expose the Express container port directly: the backend trusts identity headers injected
by OAuth2 Proxy, so all browser traffic must enter through the proxy-facing Service port.

The proxy forwards its delegated Microsoft Graph access token to Express without exposing it to the
browser. Express uses that token only for the Azure US Government Graph `/me` endpoint, requesting
`id`, `displayName`, `mail`, `userPrincipalName`, `employeeId`, and
`onPremisesSamAccountName`. Roster lookup tries the on-premises SAM account name, employee ID, and
forwarded identity fallbacks in order; each candidate is checked against both
`RosterExtractFarm.NetworkID` and `RosterExtractFarm.MyID`.

The three Entra registration identifiers have different jobs:

- `applicationid` is the Application (client) ID and becomes the OAuth client ID.
- `directoryid` is the Directory (tenant) ID and selects the single-tenant issuer.
- `objectid` is the app-registration Object ID. It is loaded as deployment metadata but is not used by the OAuth protocol.

The secret must also contain `clientsecret`, which is the client-secret **value**, not its
Secret ID; `cookiesecret`, which OAuth2 Proxy uses to protect its session cookie;
`redirecturl`, which is the public Route followed by `/oauth2/callback`; and
`trustedproxyips`, which is the comma-separated list of OpenShift router CIDRs.

The proxy uses the Azure US Government issuer at `login.microsoftonline.us`. Do not replace it
with the commercial-cloud `login.microsoftonline.com` endpoint. The configured scopes are
`openid email profile offline_access User.Read`; `offline_access` supports session refresh, and
`User.Read` supports the Entra user profile. Do not add group-reading scopes unless the deployment
actually enables an AD group allowlist and the Entra administrator grants the required consent.

`ALLOW_HARDCODED_IDENTITY_FALLBACK` must be `false` in the deployed application container.

You can provide those through an OpenShift secret or deployment env vars.

Example deployment env wiring:

```yaml
envFrom:
  - secretRef:
      name: Supply
  - secretRef:
      name: RosterSupply
```

The app accepts uppercase variants if your deployment tooling injects those instead.

## Microsoft Entra ID and OAuth2 Proxy

The files under `openshift/` provide the auth sidecar configuration:

- `oauth2-proxy-sidecar-patch.yaml` adds and configures OAuth2 Proxy `v7.15.2` in the existing app pod.
- `qmiscorecard-service-patch.yaml` changes the Service target from Express to OAuth2 Proxy.

### 1. Configure the Entra app registration

Add this as a **Web** redirect URI, replacing the hostname with the actual OpenShift Route:

```text
https://your-qmiscorecard-route.example.com/oauth2/callback
```

Delegated Microsoft Graph `User.Read` consent is required. No implicit grant or hybrid flow is
needed because OAuth2 Proxy uses the authorization-code flow with PKCE. The backend does not use
client credentials or application permissions for Graph; `/me` always represents the signed-in
user.

### 2. Create the runtime secret

Create the secret in the same project as the Deployment. Generate a new cookie secret rather
than reusing the Entra client secret.

```bash
oc create secret generic qmiscorecard-entra \
  --from-literal=applicationid='APPLICATION-CLIENT-ID' \
  --from-literal=objectid='APP-REGISTRATION-OBJECT-ID' \
  --from-literal=directoryid='DIRECTORY-TENANT-ID' \
  --from-literal=clientsecret='CLIENT-SECRET-VALUE' \
  --from-literal=cookiesecret="$(openssl rand -base64 32 | tr -- '+/' '-_')" \
  --from-literal=redirecturl='https://YOUR-QMI-ROUTE/oauth2/callback' \
  --from-literal=trustedproxyips='ROUTER_CIDR_1,ROUTER_CIDR_2'
```

If the secret already exists, update it through the OpenShift console or recreate/apply it with
all seven keys. The sidecar deliberately treats `redirecturl` and `trustedproxyips` as required so
it cannot start with a callback for the wrong Route or blindly trust forwarded headers.

### 3. Add the sidecar

Replace `DEPLOYMENT_NAME` with the current app Deployment name:

```bash
oc patch deployment/DEPLOYMENT_NAME \
  --type=strategic \
  --patch-file openshift/oauth2-proxy-sidecar-patch.yaml
```

If the cluster cannot pull `quay.io/oauth2-proxy/oauth2-proxy:v7.15.2`, mirror that exact
image into the internal registry and update the patch's `image` field.

Ask the OpenShift platform team for the router source IPs or CIDR ranges and store them in the
secret's comma-separated `trustedproxyips` key. Do not copy CIDRs from another project and do not
use `0.0.0.0/0`; the trusted list determines which callers may supply the `X-Forwarded-*` headers
used to construct secure redirects.

### 4. Send Service traffic through the proxy

The supplied patch assumes the Service exposes port `8080`. If its current `port` differs,
edit that value first, but keep `targetPort: oauth2-proxy`.

```bash
oc patch service/SERVICE_NAME \
  --type=strategic \
  --patch-file openshift/qmiscorecard-service-patch.yaml
```

The existing Route should continue pointing at that Service. OAuth2 Proxy must have
`OAUTH2_PROXY_PASS_ACCESS_TOKEN=true`; both supplied proxy manifests set it. After rollout,
`/headers` should report `Forwarded Access Token Present: Yes` and `Graph /me Succeeded: Yes`, then
show which Graph value and roster column produced the final NetworkID and MyID. The token itself is
always redacted. If the proxy is configured as external auth instead of the direct upstream used
here, the equivalent `x_auth_request_*` headers are accepted by the backend.

Confirm the public Route actually enters OAuth2 Proxy:

```bash
oc get service/SERVICE_NAME -o jsonpath='{.spec.ports[*].targetPort}{"\n"}'
oc logs deployment/DEPLOYMENT_NAME -c oauth2-proxy --tail=100
oc logs deployment/DEPLOYMENT_NAME -c APP_CONTAINER_NAME --tail=100
oc logs deployment/DEPLOYMENT_NAME --all-containers=true --prefix=true --tail=200
```

The first command must print `oauth2-proxy`. Through the public Route, `/oauth2/userinfo` should
return the authenticated session email. `/headers` should report that an access token is present,
whether Graph `/me` succeeded, the selected non-secret Graph profile fields, and the final roster
match. If the app loads without an Entra redirect while no proxy session cookie exists, the Route or
Service is still bypassing OAuth2 Proxy.

The sidecar emits standard, authentication, and request logs with an `X-Request-Id` correlation ID.
When current-user or preset resolution runs, the app also writes an `Identity transport diagnostics`
entry. Check these fields first:

- Open `/api/health` and confirm `authDiagnostics.version` is
  `entra-graph-2026-08-19.1`. If it is absent, the Deployment is still running an older image.
- Search the app-container logs for `[entra-debug]`. Those records are one-line JSON so OpenShift
  cannot hide their fields in a collapsed multiline object.

- `socket.remoteAddress` should be `127.0.0.1` or `::ffff:127.0.0.1` for the sidecar architecture.
  Any router or pod-network address means the request reached Express without using the sidecar.
- `sessionTransport.accessTokenPresent` and `sessionTransport.forwardedAccessTokenPresent` should
  both be `true`. Their values are never logged.
- `graph.succeeded` on `/api/headers` should be `true`; if not, inspect only its status and
  sanitized error message.
- `sessionTransport.oauth2ProxyCookiePresent` shows whether the expected proxy session cookie
  reached the upstream without logging its value.
- `configuration` confirms that the Entra identifiers and fallback mode were loaded without printing
  any secret values.

## Port

The container defaults to:

- `PORT=8080`

Express listens on that port inside the pod. With Entra authentication enabled, do not route
the Service directly to `8080`; route it to the OAuth2 Proxy `oauth2-proxy` port instead.

## Data note

`data/sif_data.json` must be present in the repo because SIF / Potential SIF / NMFR are loaded from JSON, not SQL.

The Excel fallback files are optional for deployment. They are only needed if you want local-file fallback for OTD, labor, or controllable costs in the deployed environment.

## ODBC note

This app uses the Node `mssql` package and does not require `msodbcsql18` just to connect to SQL Server. If you later add a package that depends on the system ODBC driver, then you can extend the Dockerfile with the repo and driver install steps.
