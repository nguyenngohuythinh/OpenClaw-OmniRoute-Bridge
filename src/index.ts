import { createApp } from './server.js';
import { bridgeConfig } from './config/bridge.config.js';
if (!Number.isInteger(bridgeConfig.port) || bridgeConfig.port < 1 || bridgeConfig.port > 65535) throw new Error('PORT must be between 1 and 65535.');
const server = createApp().listen(bridgeConfig.port, bridgeConfig.host, () => {
  console.log(`Dashboard running at http://localhost:${bridgeConfig.port}`);
});
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? 'Bridge port is already in use. Set PORT or close the existing Bridge.' : 'Bridge cannot start. Check local port permissions.');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  server.close(); server.closeIdleConnections();
});
