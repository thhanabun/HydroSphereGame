import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
  },
});
