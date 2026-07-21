const DEFAULT_API_PORT = 3002;
const LOCALHOST = 'localhost';
const ANY_HOST = '0.0.0.0';

export function getApiPort() {
  return Number(process.env.API_PORT || process.env.PORT || DEFAULT_API_PORT);
}

export function getPreferredApiHost() {
  return process.env.API_HOST || (process.env.NODE_ENV === 'production' ? ANY_HOST : LOCALHOST);
}

export async function resolveApiHostConfig() {
  const port = getApiPort();
  const bindHost = getPreferredApiHost();
  const connectHost = bindHost === ANY_HOST ? LOCALHOST : bindHost;

  return {
    port,
    preferredHost: bindHost,
    bindHost,
    connectHost,
    usingFallback: false,
    reason: null
  };
}
