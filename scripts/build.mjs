import { build } from 'vite';

await build({
  configFile: false,
  base: process.env.VITE_BASE_PATH ?? '/',
  build: {
    chunkSizeWarningLimit: 700,
  },
});
