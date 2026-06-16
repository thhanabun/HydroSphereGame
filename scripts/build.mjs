import { build } from 'vite';

await build({
  configFile: false,
  build: {
    chunkSizeWarningLimit: 700,
  },
});
