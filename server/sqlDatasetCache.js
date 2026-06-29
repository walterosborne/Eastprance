import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';

const DAILY_REFRESH_TIMEZONE = process.env.SQL_DATASET_CACHE_TIMEZONE || 'America/New_York';
const DAILY_REFRESH_HOUR = Number(process.env.SQL_DATASET_CACHE_REFRESH_HOUR || 5);
const DAILY_REFRESH_MINUTE = Number(process.env.SQL_DATASET_CACHE_REFRESH_MINUTE || 0);

const datasetEntries = new Map();
let refreshTimer = null;

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = Object.create(null);

  formatter.formatToParts(date).forEach(({ type, value }) => {
    if (type !== 'literal') {
      parts[type] = Number(value);
    }
  });

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function getComparableUtcValue({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function convertZonedTimeToUtc(parts, timeZone) {
  let candidate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0)
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidateParts = getTimeZoneParts(candidate, timeZone);
    const differenceMs =
      getComparableUtcValue(parts) - getComparableUtcValue(candidateParts);

    if (differenceMs === 0) {
      return candidate;
    }

    candidate = new Date(candidate.getTime() + differenceMs);
  }

  return candidate;
}

function getNextLocalDayParts(parts, timeZone) {
  const middayUtc = convertZonedTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 12,
      minute: 0,
      second: 0
    },
    timeZone
  );
  const nextMiddayUtc = new Date(middayUtc.getTime() + 24 * 60 * 60 * 1000);
  const nextDayParts = getTimeZoneParts(nextMiddayUtc, timeZone);

  return {
    year: nextDayParts.year,
    month: nextDayParts.month,
    day: nextDayParts.day
  };
}

function getNextRefreshDate(now = new Date()) {
  const todayParts = getTimeZoneParts(now, DAILY_REFRESH_TIMEZONE);
  let targetDateParts = {
    year: todayParts.year,
    month: todayParts.month,
    day: todayParts.day
  };
  let nextRefreshDate = convertZonedTimeToUtc(
    {
      ...targetDateParts,
      hour: DAILY_REFRESH_HOUR,
      minute: DAILY_REFRESH_MINUTE,
      second: 0
    },
    DAILY_REFRESH_TIMEZONE
  );

  if (nextRefreshDate <= now) {
    targetDateParts = getNextLocalDayParts(targetDateParts, DAILY_REFRESH_TIMEZONE);
    nextRefreshDate = convertZonedTimeToUtc(
      {
        ...targetDateParts,
        hour: DAILY_REFRESH_HOUR,
        minute: DAILY_REFRESH_MINUTE,
        second: 0
      },
      DAILY_REFRESH_TIMEZONE
    );
  }

  return nextRefreshDate;
}

function getDatasetEntry(scope) {
  const entry = datasetEntries.get(scope);

  if (!entry) {
    throw new Error(`SQL dataset cache "${scope}" is not registered.`);
  }

  return entry;
}

async function refreshDataset(scope, reason) {
  const entry = getDatasetEntry(scope);

  if (entry.refreshPromise) {
    return entry.refreshPromise;
  }

  const stopTimer = createTimer();

  logDebug('cache', `Refreshing ${scope} dataset cache.`, {
    reason
  });

  entry.refreshPromise = (async () => {
    try {
      const payload = await entry.loader();

      entry.payload = payload;
      entry.loadedAt = new Date();

      logDebug('cache', `${scope} dataset cache refreshed.`, {
        reason,
        source: payload.source,
        rowCount: payload.rowCount,
        loadedAt: entry.loadedAt.toISOString(),
        duration: formatDuration(stopTimer())
      });

      return payload;
    } catch (error) {
      logError('cache', `${scope} dataset cache refresh failed.`, error, {
        reason,
        hasExistingPayload: Boolean(entry.payload),
        duration: formatDuration(stopTimer())
      });

      if (entry.payload) {
        return entry.payload;
      }

      throw error;
    } finally {
      entry.refreshPromise = null;
    }
  })();

  return entry.refreshPromise;
}

export function registerSqlDatasetCache(scope, loader) {
  datasetEntries.set(scope, {
    loader,
    payload: null,
    loadedAt: null,
    refreshPromise: null
  });
}

export async function getCachedSqlDataset(scope) {
  const entry = getDatasetEntry(scope);

  if (entry.payload) {
    logDebug('cache', `Serving cached ${scope} dataset.`, {
      loadedAt: entry.loadedAt?.toISOString(),
      rowCount: entry.payload.rowCount,
      source: entry.payload.source
    });

    return entry.payload;
  }

  return refreshDataset(scope, 'first request');
}

export async function warmAllSqlDatasetCaches(reason) {
  const scopes = [...datasetEntries.keys()];

  await Promise.allSettled(scopes.map((scope) => refreshDataset(scope, reason)));
}

function scheduleNextDailyRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  const nextRefreshDate = getNextRefreshDate();
  const delayMs = Math.max(nextRefreshDate.getTime() - Date.now(), 1000);

  logDebug('cache', 'Scheduling next SQL dataset cache refresh.', {
    nextRefreshAt: nextRefreshDate.toISOString(),
    timeZone: DAILY_REFRESH_TIMEZONE,
    delay: formatDuration(delayMs)
  });

  refreshTimer = setTimeout(async () => {
    logDebug('cache', 'Starting scheduled SQL dataset cache refresh.', {
      timeZone: DAILY_REFRESH_TIMEZONE
    });

    await warmAllSqlDatasetCaches('daily 5 AM refresh');
    scheduleNextDailyRefresh();
  }, delayMs);

  if (typeof refreshTimer.unref === 'function') {
    refreshTimer.unref();
  }
}

export function startSqlDatasetCacheScheduler() {
  scheduleNextDailyRefresh();
}

export function stopSqlDatasetCacheScheduler() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
