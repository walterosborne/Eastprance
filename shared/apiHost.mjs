import dns from 'dns/promises';
import os from 'os';

const DEFAULT_API_PORT = 3002;
const WILDCARD_HOST = '0.0.0.0';
const LOCALHOST = 'localhost';

function normalizeAddress(address) {
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

function getLocalAddresses() {
  const networkInterfaces = os.networkInterfaces();
  const localAddresses = new Set(['127.0.0.1', '::1']);

  Object.values(networkInterfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.address) {
        localAddresses.add(normalizeAddress(entry.address));
      }
    });
  });

  return localAddresses;
}

export function getApiPort() {
  return Number(process.env.PORT || process.env.API_PORT || DEFAULT_API_PORT);
}

export function getPreferredApiHost() {
  const configuredHost = process.env.API_HOST?.trim();

  if (configuredHost) {
    return configuredHost;
  }

  return os.hostname() || LOCALHOST;
}

export async function resolveApiHostConfig() {
  const preferredHost = getPreferredApiHost();
  const port = getApiPort();

  if (preferredHost === WILDCARD_HOST) {
    return {
      port,
      preferredHost,
      bindHost: WILDCARD_HOST,
      connectHost: LOCALHOST,
      usingFallback: true,
      reason: 'API_HOST is set to 0.0.0.0.'
    };
  }

  if (preferredHost === LOCALHOST) {
    return {
      port,
      preferredHost,
      bindHost: LOCALHOST,
      connectHost: LOCALHOST,
      usingFallback: false,
      reason: null
    };
  }

  try {
    const resolvedHosts = await dns.lookup(preferredHost, {
      all: true,
      verbatim: true
    });
    const localAddresses = getLocalAddresses();
    const resolvesToLocalInterface = resolvedHosts.some(({ address }) =>
      localAddresses.has(normalizeAddress(address))
    );

    if (resolvesToLocalInterface) {
      return {
        port,
        preferredHost,
        bindHost: preferredHost,
        connectHost: preferredHost,
        usingFallback: false,
        reason: null
      };
    }

    return {
      port,
      preferredHost,
      bindHost: WILDCARD_HOST,
      connectHost: LOCALHOST,
      usingFallback: true,
      reason: `Hostname "${preferredHost}" does not resolve to a local interface.`
    };
  } catch (error) {
    return {
      port,
      preferredHost,
      bindHost: WILDCARD_HOST,
      connectHost: LOCALHOST,
      usingFallback: true,
      reason: `Unable to resolve hostname "${preferredHost}" (${error.code || error.message}).`
    };
  }
}

export function shouldFallbackToWildcardHost(error) {
  return ['EADDRNOTAVAIL', 'ENOTFOUND'].includes(error?.code);
}

export function getWildcardApiHost() {
  return WILDCARD_HOST;
}
