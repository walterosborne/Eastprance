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

The proxy uses the Entra email claim as its primary user identifier and forwards the standard
`X-Forwarded-User`, `X-Forwarded-Preferred-Username`, and `X-Forwarded-Email` headers. It also
enables the equivalent `X-Auth-Request-*` response headers for compatibility with an external-auth
proxy layout. The backend normalizes the first available identity, removes the email domain when
present, and attempts roster lookup against both `RosterExtractFarm.NetworkID` and
`RosterExtractFarm.MyID`.

The three Entra registration identifiers have different jobs:

- `applicationid` is the Application (client) ID and becomes the OAuth client ID.
- `directoryid` is the Directory (tenant) ID and selects the single-tenant issuer.
- `objectid` is the app-registration Object ID. It is loaded as deployment metadata but is not used by the OAuth protocol.

The secret must also contain `clientsecret`, which is the client-secret **value**, not its
Secret ID, and `cookiesecret`, which OAuth2 Proxy uses to protect its session cookie.

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

The ID token should include `name` and `email`; `preferred_username`, `oid`, `tid`, and
`employeeid` are useful but optional for this application. The backend derives the network ID from
the email before querying the roster. No implicit grant or hybrid flow is needed because OAuth2
Proxy uses the authorization-code flow with PKCE.

### 2. Create the runtime secret

Create the secret in the same project as the Deployment. Generate a new cookie secret rather
than reusing the Entra client secret.

```bash
oc create secret generic qmiscorecard-entra \
  --from-literal=applicationid='APPLICATION-CLIENT-ID' \
  --from-literal=objectid='APP-REGISTRATION-OBJECT-ID' \
  --from-literal=directoryid='DIRECTORY-TENANT-ID' \
  --from-literal=clientsecret='CLIENT-SECRET-VALUE' \
  --from-literal=cookiesecret="$(openssl rand -base64 32 | tr -- '+/' '-_')"
```

### 3. Add the sidecar

Replace `DEPLOYMENT_NAME` with the current app Deployment name:

```bash
oc patch deployment/DEPLOYMENT_NAME \
  --type=strategic \
  --patch-file openshift/oauth2-proxy-sidecar-patch.yaml
```

If the cluster cannot pull `quay.io/oauth2-proxy/oauth2-proxy:v7.15.2`, mirror that exact
image into the internal registry and update the patch's `image` field.

Ask the OpenShift platform team for the router source IPs or CIDR ranges, then add them to
the sidecar as a comma-separated `OAUTH2_PROXY_TRUSTED_PROXY_IPS` value. Do not use
`0.0.0.0/0`; the trusted list determines which callers may supply the `X-Forwarded-*`
headers used to construct secure redirects.

```yaml
- name: OAUTH2_PROXY_TRUSTED_PROXY_IPS
  value: ROUTER_CIDR_1,ROUTER_CIDR_2
```

### 4. Send Service traffic through the proxy

The supplied patch assumes the Service exposes port `8080`. If its current `port` differs,
edit that value first, but keep `targetPort: oauth2-proxy`.

```bash
oc patch service/SERVICE_NAME \
  --type=strategic \
  --patch-file openshift/qmiscorecard-service-patch.yaml
```

The existing Route should continue pointing at that Service. After rollout, `/headers` should
show at least `x_forwarded_user` and `x_forwarded_email`. Depending on the Entra token, it may also
show `x_forwarded_preferred_username`. If the proxy is configured as external auth instead of the
direct upstream used here, the equivalent `x_auth_request_*` headers are accepted by the backend.

Confirm the public Route actually enters OAuth2 Proxy:

```bash
oc get service/SERVICE_NAME -o jsonpath='{.spec.ports[*].targetPort}{"\n"}'
oc logs deployment/DEPLOYMENT_NAME -c oauth2-proxy --tail=100
```

The first command must print `oauth2-proxy`. Through the public Route, `/oauth2/userinfo` should
return the authenticated session email and `/headers` should report at least one populated identity
field. If the app loads without an Entra redirect while no proxy session cookie exists, the Route or
Service is still bypassing OAuth2 Proxy.

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
