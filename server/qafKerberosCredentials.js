import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';

const TICKET_REFRESH_MS = 30 * 60 * 1000;
const KINIT_TIMEOUT_MS = 30 * 1000;

let credentialCachePath = null;
let lastTicketAt = 0;
let refreshPromise = null;
let renewalTimer = null;
let currentPrincipal = null;

async function getCredentialCachePath() {
  if (!credentialCachePath) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'qmi-qaf-kerberos-'));
    credentialCachePath = path.join(directory, 'ticket-cache');
  }
  return credentialCachePath;
}

function runKinit(principal, password, cachePath) {
  return new Promise((resolve, reject) => {
    // Never pass a password through CLI args, shell strings, or logs.
    const child = spawn('kinit', ['-c', cachePath, principal], {
      shell: false,
      stdio: ['pipe', 'ignore', 'ignore'],
      env: { ...process.env, KRB5CCNAME: `FILE:${cachePath}` }
    });
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error('Kerberos ticket acquisition timed out. Check AD/KDC connectivity.'));
    }, KINIT_TIMEOUT_MS);

    child.on('error', (error) => {
      // Explicitly avoid echoing environment secrets or raw spawned-command details.
      finish(new Error(error.code === 'ENOENT'
        ? 'kinit is unavailable. Install the Kerberos client in the runtime image.'
        : 'Unable to start kinit. Check Kerberos client configuration.'));
    });
    child.on('close', (code) => finish(code === 0 ? null :
      new Error('Could not obtain a YY Kerberos ticket. Check principal, password, realm and KDC policy.')));

    // kinit accepts the prompt response through stdin in non-interactive Linux.
    child.stdin.on('error', () => {}); // May close before write on early failure.
    child.stdin.end(`${password}\n`);
  });
}

async function refreshTicket(config, force = false) {
  if (!force && Date.now() - lastTicketAt < TICKET_REFRESH_MS) return;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const cachePath = await getCredentialCachePath();
    await runKinit(config.kerberosPrincipal, config.password, cachePath);
    process.env.KRB5CCNAME = `FILE:${cachePath}`;
    lastTicketAt = Date.now();
  })().finally(() => { refreshPromise = null; });

  return refreshPromise;
}

export async function ensureQafKerberosCredentials(config) {
  if (process.platform === 'win32') {
    throw new Error(
      'QAF kerberos-password mode requires Linux with kinit. Windows SSPI uses the process identity; ' +
      'use runas /netonly to launch only the Node server with the YY account, not VS Code.'
    );
  }
  if (!config.kerberosPrincipal || !config.password) {
    throw new Error('QAF kerberos-password requires qafuser, qafrealm, and qafpassword (or qafprincipal).');
  }
  if (currentPrincipal && currentPrincipal !== config.kerberosPrincipal) {
    throw new Error('The QAF Kerberos principal cannot be changed while this process is running.');
  }
  currentPrincipal = config.kerberosPrincipal;
  await refreshTicket(config);

  if (!renewalTimer) {
    // Tickets are deliberately re-acquired ahead of typical domain expiration.
    // Timer is best-effort; getPool also checks freshness on every connection.
    renewalTimer = setInterval(() => {
      refreshTicket(config).catch(() => {
        // Pool requests reattempt acquisition; never log secrets.
        lastTicketAt = 0;
        console.error('[qaf-kerberos] Kerberos ticket refresh failed. Check the configured account and KDC.');
      });
    }, TICKET_REFRESH_MS);
    renewalTimer.unref?.();
  }
}
