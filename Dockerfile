# Node can use the system trust bundle after update-ca-trust finishes.
ENV NODE_EXTRA_CA_CERTS=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem

WORKDIR /opt/app-root/src

# Install workspace dependencies before copying the full source tree.
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

# OpenShift runs with an arbitrary UID, so keep the app tree group-writable.
RUN mkdir -p /opt/app-root/src/client /opt/app-root/src/server /opt/app-root/src/data \
    && chgrp -R 0 /opt/app-root/src \
    && chmod -R g=u /opt/app-root/src

USER 1001

RUN npm ci

COPY --chown=1001:0 client ./client
COPY --chown=1001:0 server ./server
COPY --chown=1001:0 shared ./shared
COPY --chown=1001:0 data ./data

RUN npm run build --workspace client

# The client is now compiled into client/dist; trim dev-only packages.
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# This app uses the Node mssql driver, so no system ODBC driver install is required.
CMD ["node", "server/start.js"]
