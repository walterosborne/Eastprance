# Node can use the system trust bundle after update-ca-trust finishes.
ENV NODE_EXTRA_CA_CERTS=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem

# Optional Quality Data Mart Kerberos support. The work build supplies a
# UBI9 Node base image before this Dockerfile fragment. Opt-in to avoid
# affecting installations which do not use the QAF Kerberos data source.
# Microsoft ODBC Driver 18 requires corporate approval and reachable RPM repos.
ARG INSTALL_QAF_KERBEROS_DEPS=false
USER 0
RUN if [ "$INSTALL_QAF_KERBEROS_DEPS" = "true" ]; then \
      curl -fsSL https://packages.microsoft.com/config/rhel/9/prod.repo \
        -o /etc/yum.repos.d/microsoft-prod.repo \
      && ACCEPT_EULA=Y dnf install -y msodbcsql18 unixODBC krb5-workstation \
      && dnf clean all; \
    fi
USER 1001

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

# The default mssql driver needs no ODBC packages; QAF Kerberos does when enabled.
CMD ["node", "server/start.js"]
