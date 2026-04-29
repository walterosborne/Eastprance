import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { getApiPort, getPreferredApiHost } from '../shared/apiHost.mjs';

export default defineConfig(() => {
  const apiPort = getApiPort();
  const apiHost = getPreferredApiHost();

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://${apiHost}:${apiPort}`,
          changeOrigin: true
        }
      }
    }
  };
});
