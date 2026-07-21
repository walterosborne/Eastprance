import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getApiPort, getPreferredApiHost } from '../shared/apiHost.mjs';

const serverDotenvPath = path.resolve(__dirname, '../server/.env');

if (fs.existsSync(serverDotenvPath)) {
  dotenv.config({
    path: serverDotenvPath,
    override: true
  });
}

export default defineConfig(() => {
  const apiPort = getApiPort();
  const apiHost = getPreferredApiHost();

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/headers': {
          target: `http://${apiHost}:${apiPort}`,
          changeOrigin: true
        },
        '/api': {
          target: `http://${apiHost}:${apiPort}`,
          changeOrigin: true
        }
      }
    }
  };
});
