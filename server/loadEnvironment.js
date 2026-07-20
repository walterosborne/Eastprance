import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOTENV_FILE_PATH = path.resolve(__dirname, '.env');
const LOCAL_ENV_FILE_PATH = path.resolve(__dirname, 'local.env.js');

const ENV_SOURCE_MODE_AUTO = 'auto';
const ENV_SOURCE_MODE_RUNTIME = 'runtime';
const ENV_SOURCE_MODE_DOTENV = 'dotenv';
const ENV_SOURCE_MODE_LOCAL_FILE = 'local-file';

function getFirstDefinedEnvValue(...keys) {
  for (const key of keys) {
    const value = process.env[key];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function normalizeMode(rawMode) {
  const normalized = String(rawMode || ENV_SOURCE_MODE_AUTO)
    .trim()
    .toLowerCase();

  if ([
    ENV_SOURCE_MODE_AUTO,
    ENV_SOURCE_MODE_RUNTIME,
    ENV_SOURCE_MODE_DOTENV,
    ENV_SOURCE_MODE_LOCAL_FILE
  ].includes(normalized)) {
    return normalized;
  }

  if (normalized === 'env' || normalized === 'real-env') {
    return ENV_SOURCE_MODE_RUNTIME;
  }

  if (normalized === 'local' || normalized === 'file') {
    return ENV_SOURCE_MODE_LOCAL_FILE;
  }

  return ENV_SOURCE_MODE_AUTO;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function applyEnvironmentEntries(entries, { override = false } = {}) {
  for (const [key, value] of Object.entries(entries)) {
    if (!key || value === undefined || value === null) {
      continue;
    }

    if (!override && process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = typeof value === 'string' ? value : String(value);
  }
}

async function loadLocalEnvironmentFile({ override = false } = {}) {
  if (!fs.existsSync(LOCAL_ENV_FILE_PATH)) {
    return {
      loaded: false,
      source: 'local-file',
      filePath: LOCAL_ENV_FILE_PATH
    };
  }

  const moduleUrl = `${pathToFileURL(LOCAL_ENV_FILE_PATH).href}?ts=${Date.now()}`;
  const importedModule = await import(moduleUrl);
  const environment = importedModule.default ?? importedModule.environment ?? {};

  if (typeof environment !== 'object' || Array.isArray(environment)) {
    throw new Error(
      `Local environment file must export an object from ${LOCAL_ENV_FILE_PATH}.`
    );
  }

  applyEnvironmentEntries(environment, { override });

  return {
    loaded: true,
    source: 'local-file',
    filePath: LOCAL_ENV_FILE_PATH
  };
}

function loadDotenvFile({ override = false } = {}) {
  if (!fs.existsSync(DOTENV_FILE_PATH)) {
    return {
      loaded: false,
      source: 'dotenv',
      filePath: DOTENV_FILE_PATH
    };
  }

  const result = dotenv.config({
    path: DOTENV_FILE_PATH,
    override
  });

  if (result.error) {
    throw result.error;
  }

  return {
    loaded: true,
    source: 'dotenv',
    filePath: DOTENV_FILE_PATH
  };
}

function logEnvironmentChoice(message, metadata = {}) {
  console.info('[env]', message, metadata);
}

export async function loadEnvironment() {
  const mode = normalizeMode(
    getFirstDefinedEnvValue('ENV_SOURCE_MODE', 'env_source_mode')
  );
  const override = parseBoolean(
    getFirstDefinedEnvValue('ENV_FILE_OVERRIDE', 'env_file_override'),
    false
  );

  if (mode === ENV_SOURCE_MODE_RUNTIME) {
    logEnvironmentChoice('Using runtime environment variables only.', { mode });
    return {
      mode,
      source: 'runtime',
      loaded: false
    };
  }

  if (mode === ENV_SOURCE_MODE_LOCAL_FILE) {
    const result = await loadLocalEnvironmentFile({ override });

    if (!result.loaded) {
      throw new Error(
        `ENV_SOURCE_MODE=${ENV_SOURCE_MODE_LOCAL_FILE} but ${LOCAL_ENV_FILE_PATH} was not found.`
      );
    }

    logEnvironmentChoice('Loaded environment from local JS file.', {
      mode,
      override,
      filePath: result.filePath
    });

    return {
      mode,
      source: result.source,
      loaded: true,
      filePath: result.filePath
    };
  }

  if (mode === ENV_SOURCE_MODE_DOTENV) {
    const result = loadDotenvFile({ override });

    if (!result.loaded) {
      throw new Error(
        `ENV_SOURCE_MODE=${ENV_SOURCE_MODE_DOTENV} but ${DOTENV_FILE_PATH} was not found.`
      );
    }

    logEnvironmentChoice('Loaded environment from .env file.', {
      mode,
      override,
      filePath: result.filePath
    });

    return {
      mode,
      source: result.source,
      loaded: true,
      filePath: result.filePath
    };
  }

  const localFileResult = await loadLocalEnvironmentFile({ override });

  if (localFileResult.loaded) {
    logEnvironmentChoice('Loaded environment from local JS file.', {
      mode,
      override,
      filePath: localFileResult.filePath
    });

    return {
      mode,
      source: localFileResult.source,
      loaded: true,
      filePath: localFileResult.filePath
    };
  }

  const dotenvResult = loadDotenvFile({ override });

  if (dotenvResult.loaded) {
    logEnvironmentChoice('Loaded environment from .env file.', {
      mode,
      override,
      filePath: dotenvResult.filePath
    });

    return {
      mode,
      source: dotenvResult.source,
      loaded: true,
      filePath: dotenvResult.filePath
    };
  }

  logEnvironmentChoice('No local env file found; using runtime environment variables.', {
    mode
  });

  return {
    mode,
    source: 'runtime',
    loaded: false
  };
}
