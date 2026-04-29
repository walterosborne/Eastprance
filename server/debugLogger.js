function buildPrefix(scope) {
  return `[${new Date().toISOString()}] [${scope}]`;
}

export function createTimer() {
  const start = process.hrtime.bigint();

  return () => Number(process.hrtime.bigint() - start) / 1e6;
}

export function formatDuration(durationMs) {
  return `${durationMs.toFixed(1)}ms`;
}

export function logDebug(scope, message, metadata) {
  if (metadata) {
    console.log(`${buildPrefix(scope)} ${message}`, metadata);
    return;
  }

  console.log(`${buildPrefix(scope)} ${message}`);
}

export function logError(scope, message, error, metadata) {
  const payload = {
    ...(metadata || {}),
    error: {
      message: error?.message,
      code: error?.code,
      name: error?.name
    }
  };

  console.error(`${buildPrefix(scope)} ${message}`, payload);
}
