import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOTENV_FILE_PATH = path.resolve(__dirname, '.env');

function loadDotenvFile() {
  if (!fs.existsSync(DOTENV_FILE_PATH)) {
    return {
      loaded: false,
      filePath: DOTENV_FILE_PATH
    };
  }

  const result = dotenv.config({
    path: DOTENV_FILE_PATH
  });

  if (result.error) {
    throw result.error;
  }

  return {
    loaded: true,
    filePath: DOTENV_FILE_PATH
  };
}

function logEnvironmentChoice(message, metadata = {}) {
  console.info('[env]', message, metadata);
}

export async function loadEnvironment() {
  const dotenvResult = loadDotenvFile();

  if (dotenvResult.loaded) {
    logEnvironmentChoice('Loaded environment from server/.env.', {
      filePath: dotenvResult.filePath
    });

    return {
      source: 'dotenv',
      loaded: true,
      filePath: dotenvResult.filePath
    };
  }

  logEnvironmentChoice('No server/.env found; using runtime environment variables.');

  return {
    source: 'runtime',
    loaded: false
  };
}
