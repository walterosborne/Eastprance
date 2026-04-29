const DEFAULT_API_PORT = 3002;
const LOCALHOST = 'localhost';

export function getApiPort() {
  return Number(process.env.PORT || process.env.API_PORT || DEFAULT_API_PORT);
}

export function getPreferredApiHost() {
  return LOCALHOST;
}

export async function resolveApiHostConfig() {
  const port = getApiPort();

  return {
    port,
    preferredHost: LOCALHOST,
    bindHost: LOCALHOST,
    connectHost: LOCALHOST,
    usingFallback: false,
    reason: null
  };
}
