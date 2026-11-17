import { OpenClawService } from './openclaw.service.js';
import { OmniRouteService, normalizeBaseUrl } from './omniroute.service.js';
import { bridgeConfig } from '../config/bridge.config.js';
import type { Connection } from '../types/omniroute.js';
export class HealthService {
  private connection: Connection | null = null;
  constructor(private openclaw: OpenClawService, private omni: OmniRouteService) {}
  remember(connection: Connection) { this.connection = connection; }
  async health() {
    const openclaw = await this.openclaw.status();
    let connection = this.connection;
    if (!connection && openclaw.configPath) {
      try {
        const { data } = await this.openclaw.config.read(openclaw.configPath);
        const provider = data.models?.providers?.omniroute;
        if (typeof provider?.baseUrl === 'string' && typeof provider?.apiKey === 'string')
          connection = { baseUrl: normalizeBaseUrl(provider.baseUrl), apiKey: provider.apiKey };
      } catch { /* Unreadable config must not hide Bridge health. */ }
    }
    connection ??= { baseUrl: normalizeBaseUrl(bridgeConfig.omniBaseUrl), apiKey: process.env.OMNIROUTE_API_KEY || '' };
    return { bridge: { status: 'online', version: bridgeConfig.version }, openclaw, omniroute: await this.omni.health(connection) };
  }
}
