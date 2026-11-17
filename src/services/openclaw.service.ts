import { ProcessService } from './process.service.js';
import { ConfigService } from './config.service.js';
import { LogService, redact } from './log.service.js';
import { ApiError, jsonOutput } from '../types/api.js';
import type { OpenClawStatus, RuntimeAction } from '../types/openclaw.js';
import type { Connection } from '../types/omniroute.js';

export class OpenClawService {
  private cached: { expires: number; status: OpenClawStatus } | undefined;
  private pending: Promise<OpenClawStatus> | undefined;
  private busy = false;
  private secrets: string[] = [];
  constructor(private cli: ProcessService, public config: ConfigService, private logs: LogService) {}
  status(fresh = false): Promise<OpenClawStatus> {
    if (this.pending) return this.pending;
    if (!fresh && this.cached && this.cached.expires > Date.now()) return Promise.resolve(this.cached.status);
    this.pending = this.detect().then(status => { this.cached = { expires: Date.now() + 5000, status }; return status; })
      .finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async detect(): Promise<OpenClawStatus> {
    const status: OpenClawStatus = { installed: false, commandExists: false, running: null, reachable: false,
      pid: null, version: null, configPath: null, configExists: false, currentModel: null, gatewayPort: null, code: 'OPENCLAW_NOT_INSTALLED' };
    try {
      const version = await this.cli.run(['--version']);
      status.installed = true; status.commandExists = true;
      status.version = version.match(/\b\d+\.\d+\.\d+[\w.+-]*/)?.[0] ?? null;
    } catch (error) {
      status.code = (error as ApiError).code;
      status.commandExists = status.code !== 'OPENCLAW_NOT_INSTALLED';
      return status;
    }
    let configError: string | null = null;
    await Promise.all([
      (async () => {
        try {
          status.configPath = await this.config.getPath();
          const { data } = await this.config.read(status.configPath); status.configExists = true;
          const model = data.agents?.defaults?.model;
          status.currentModel = typeof model === 'string' ? model : typeof model?.primary === 'string' ? model.primary : null;
          status.gatewayPort = typeof data.gateway?.port === 'number' ? data.gateway.port : status.gatewayPort;
        } catch (error) { configError = (error as ApiError).code; }
      })(),
      (async () => {
        try {
          const data = jsonOutput(await this.cli.run(['gateway', 'status', '--json', '--timeout', '3000']));
          const runtime = data.service?.runtime;
          status.reachable = data.rpc?.ok === true;
          status.running = status.reachable || runtime?.status === 'running' ? true
            : ['stopped', 'not-installed'].includes(runtime?.status) || data.service?.loaded === false ? false : null;
          status.pid = Number.isInteger(runtime?.pid) && runtime.pid > 0 ? runtime.pid : null;
          status.gatewayPort = typeof data.gateway?.port === 'number' ? data.gateway.port : status.gatewayPort;
          status.code = status.reachable ? 'OPENCLAW_READY' : status.running ? 'OPENCLAW_GATEWAY_UNREACHABLE'
            : data.port?.status === 'busy' ? 'PORT_IN_USE' : status.running === false ? 'OPENCLAW_STOPPED' : 'OPENCLAW_STATUS_UNKNOWN';
        } catch (error) { status.code = (error as ApiError).code; }
      })(),
    ]);
    if (configError) status.code = configError;
    return status;
  }
  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.busy) throw new ApiError('OPENCLAW_BUSY', 'Another configuration or runtime operation is in progress.', 409);
    this.busy = true;
    try { return await action(); } finally { this.busy = false; this.cached = undefined; }
  }
  private async lifecycle(action: RuntimeAction) {
    const before = await this.status(true);
    if (!before.installed) throw new ApiError('OPENCLAW_NOT_INSTALLED', 'OpenClaw is not installed or the CLI is unavailable.', 503);
    if (action === 'start' && before.running) return { changed: false, status: before };
    if (action === 'stop' && before.running === false) return { changed: false, status: before };
    if (action === 'start' && before.running === null) throw new ApiError('OPENCLAW_STATUS_UNKNOWN', 'Cannot confirm runtime status; check OpenClaw before starting another instance.', 409);
    this.logs.add(`OpenClaw ${action} requested`);
    try {
      const result = jsonOutput(await this.cli.run(['gateway', action, '--json', ...(action === 'stop' ? ['--force'] : [])], {}, 45000));
      if (result.ok === false || result.status === 'error') throw new Error();
      let after = await this.status(true);
      for (let attempt = 0; attempt < 2 && (action === 'stop' ? after.running !== false : !after.reachable); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500)); after = await this.status(true);
      }
      const complete = action === 'stop' ? after.running === false : after.reachable;
      this.logs.add(`OpenClaw ${action}: ${complete ? 'confirmed' : 'not confirmed'}`);
      return { changed: true, confirmed: complete, status: after };
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'OPENCLAW_RUNTIME_FAILED';
      this.logs.add(`OpenClaw ${action} failed (${code})`);
      throw error instanceof ApiError ? error : new ApiError(code, 'OpenClaw runtime command failed. Check service installation, config, permissions and port conflicts.', 502);
    }
  }
  runtime(action: RuntimeAction) { return this.exclusive(() => this.lifecycle(action)); }
  configure(connection: Connection, model: string, restart: boolean) {
    return this.exclusive(async () => {
      this.secrets = [connection.apiKey];
      const applied = await this.config.update(connection, model);
      this.logs.add('OpenClaw configuration validated and backed up');
      if (!restart) return applied;
      try {
        const runtime = await this.lifecycle('restart');
        return { ...applied, restartRequired: !runtime.confirmed, runtime };
      } catch (error) {
        return { ...applied, restartRequired: true, restartError: (error as ApiError).code };
      }
    });
  }
  async getLogs(lines: number) {
    let config: unknown;
    try { config = (await this.config.read(await this.config.getPath())).data; }
    catch { return { lines: this.logs.tail(lines), source: 'bridge', code: 'CONFIG_UNAVAILABLE' }; }
    try {
      const text = await this.cli.run(['logs', '--limit', String(lines), '--max-bytes', '100000', '--json'], {}, 15000);
      return { lines: redact(text, { config, environment: process.env }, this.secrets).split('\n').slice(-lines), source: 'openclaw' };
    } catch (error) { return { lines: this.logs.tail(lines), source: 'bridge', code: (error as ApiError).code }; }
  }
}
