import { build } from 'vite';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const workingDirectory = process.cwd();
const outputDirectory = resolve(workingDirectory, 'dist/balance-audit');
const outputPath = resolve(outputDirectory, 'balance-audit.mjs');

await build({
  configFile: false,
  root: workingDirectory,
  logLevel: 'silent',
  build: {
    ssr: resolve(workingDirectory, 'scripts/balance-audit.ts'),
    outDir: outputDirectory,
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'balance-audit.mjs',
      },
    },
  },
});

await import(`${pathToFileURL(outputPath).href}?run=${Date.now()}`);
