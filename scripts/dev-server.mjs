import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
});

await server.listen();
server.printUrls();

process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});

setInterval(() => undefined, 2147483647);
