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
- `ROSTER_SECRET_DIR`
- `ROSTER_SERVER`
- `ROSTER_SCHEMA`
- `ROSTER_DATABASE`
- `ROSTER_USER`
- `ROSTER_PASSWORD`
- `KEYCLOAK_ISSUER_URL`
- `KEYCLOAK_INTROSPECTION_URL`
- `KEYCLOAK_CLIENT_ID`
- `KEYCLOAK_CLIENT_SECRET`
- `ALLOW_HARDCODED_IDENTITY_FALLBACK`

`schema` is optional and defaults to `dbo`, but you should set it if your SQL objects live in a non-default schema.

`RosterExtractFarm` can now come from a separate database connection. The preferred setup is:

- keep the main app SQL connection on the existing env vars
- mount a second secret as files
- point `ROSTER_SECRET_DIR` at that mounted directory

Inside that roster secret, use these key names:

- `server`
- `schema`
- `database`
- `user`
- `password`

That lets the roster secret use the same variable/key names as the main DB secret without colliding in the container env.

For user identification, the backend now supports two runtime patterns:

- a bearer token that the backend can introspect against Keycloak
- forwarded identity headers from the ingress / auth layer

If Keycloak tokens are being passed through, set:

- `KEYCLOAK_CLIENT_ID`
- `KEYCLOAK_CLIENT_SECRET`
- either `KEYCLOAK_INTROSPECTION_URL` or `KEYCLOAK_ISSUER_URL`

The app reads `employeeid` from the resolved identity and then attempts roster lookup against both `RosterExtractFarm.NetworkID` and `RosterExtractFarm.MyID`.

`ALLOW_HARDCODED_IDENTITY_FALLBACK` should usually be `false` in deployed environments once auth is wired correctly.

You can provide those through an OpenShift secret or deployment env vars.

Example deployment env wiring:

```yaml
envFrom:
  - secretRef:
      name: Supply

env:
  - name: ROSTER_SECRET_DIR
    value: /opt/app-root/secrets/roster

volumeMounts:
  - name: roster-secret
    mountPath: /opt/app-root/secrets/roster
    readOnly: true

volumes:
  - name: roster-secret
    secret:
      secretName: YourRosterSecretName
```

The app accepts uppercase variants if your deployment tooling injects those instead.

## Port

The container defaults to:

- `PORT=8080`

OpenShift can route to that directly.

## Data note

`data/sif_data.json` must be present in the repo because SIF / Potential SIF / NMFR are loaded from JSON, not SQL.

The Excel fallback files are optional for deployment. They are only needed if you want local-file fallback for OTD, labor, or controllable costs in the deployed environment.

## ODBC note

This app uses the Node `mssql` package and does not require `msodbcsql18` just to connect to SQL Server. If you later add a package that depends on the system ODBC driver, then you can extend the Dockerfile with the repo and driver install steps.
