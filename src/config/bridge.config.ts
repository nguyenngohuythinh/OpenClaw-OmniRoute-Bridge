import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const bridgeConfig = {
  host: '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  version: JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string,
  openclawCommand: process.env.OPENCLAW_COMMAND || (process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw'),
  omniBaseUrl: process.env.OMNIROUTE_BASE_URL || 'http://127.0.0.1:20128',
  requestTimeout: 8000,
  cliTimeout: 15000,
  modelCacheMs: 30000,
};
