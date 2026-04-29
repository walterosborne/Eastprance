import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolveApiHostConfig } from '../shared/apiHost.mjs';

export default defineConfig(async () => {
  const { port: apiPort, connectHost } = await resolveApiHostConfig();

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://${connectHost}:${apiPort}`,
          changeOrigin: true
        }
      }
    }
  };
});
