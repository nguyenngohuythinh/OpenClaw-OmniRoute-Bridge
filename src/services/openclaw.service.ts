import { ProcessService } from './process.service.js';
import { ConfigService } from './config.service.js';
import { LogService, redact, collectSecrets } from './log.service.js';
import { ApiError, jsonOutput } from '../types/api.js';
import type { OpenClawStatus, RuntimeAction, RuntimeOperation, RuntimePolicy } from '../types/openclaw.js';
import type { Connection } from '../types/omniroute.js';

const defaultPolicy: RuntimePolicy = { actionTimeoutMs: 90000, commandTimeoutMs: 45000, confirmationAttempts: 2, confirmationDelayMs: 500 };
const positiveInt = (value: unknown): number | null => typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
const port = (value: unknown): number | null => { const parsed = positiveInt(value); return parsed && parsed <= 65535 ? parsed : null; };
const safeError = (error: unknown) => error instanceof ApiError ? error : new ApiError('OPENCLAW_COMMAND_FAILED', 'Cannot read OpenClaw status. Check the CLI, service and config.', 502);
const deadline = (signal?: AbortSignal) => { if (signal?.aborted) throw new ApiError('OPENCLAW_TIMEOUT', 'OpenClaw action exceeded its time limit. Refresh status before retrying.', 504); };

export class OpenClawService {
  private cached: { expires: number; status: OpenClawStatus } | undefined;
  private pending: Promise<OpenClawStatus> | undefined;
  private generation = 0;
  private operation: RuntimeOperation | null = null;
  private secrets = new Set<string>();
  private policy: RuntimePolicy;
  constructor(private cli: ProcessService, public config: ConfigService, private logs: LogService, policy: Partial<RuntimePolicy> = {}) {
    this.policy = { ...defaultPolicy, ...policy };
  }
  status(fresh = false, signal?: AbortSignal): Promise<OpenClawStatus> {
    // A runtime deadline owns its reads; cancelling it must not cancel another tab's poll.
    if (signal) return this.detect(signal).then(status => ({ ...status, operation: this.operation }));
    if (!fresh && this.cached && this.cached.expires > Date.now()) return Promise.resolve({ ...this.cached.status, operation: this.operation });
    if (!this.pending) {
      const generation = this.generation;
      const pending = this.detect().then(status => {
        if (generation === this.generation) this.cached = { expires: Date.now() + 5000, status };
        return status;
      }).finally(() => { if (this.pending === pending) this.pending = undefined; });
      this.pending = pending;
    }
    return this.pending.then(status => ({ ...status, operation: this.operation }));
  }
  private invalidate() { this.generation++; this.cached = undefined; this.pending = undefined; }
  private remember(config: unknown) { for (const secret of collectSecrets(config)) this.secrets.add(secret); }
  private async detect(signal?: AbortSignal): Promise<OpenClawStatus> {
    deadline(signal);
    const status: OpenClawStatus = { installed: false, commandExists: false, running: null, reachable: false,
      pid: null, version: null, configPath: null, configExists: false, currentModel: null, gatewayPort: null,
      code: 'OPENCLAW_NOT_INSTALLED', message: 'OpenClaw is not installed.', checkedAt: new Date().toISOString(), operation: null };
    try {
      const version = await this.cli.run(['--version'], {}, undefined, signal);
      status.installed = true; status.commandExists = true;
      status.version = version.match(/\b\d+\.\d+\.\d+[\w.+-]*/)?.[0] ?? null;
    } catch (error) {
      deadline(signal);
      const failure = safeError(error); status.code = failure.code; status.message = failure.message;
      status.commandExists = status.code !== 'OPENCLAW_NOT_INSTALLED'; return status;
    }
    let configFailure: ApiError | undefined; let configPort: number | null = null;
    // Project the CLI's selected config and runtime separately, then combine deterministically.
    const [, gateway] = await Promise.all([
      (async () => {
        try {
          status.configPath = await this.config.getPath(signal);
          const { data } = await this.config.read(status.configPath, signal); status.configExists = true; this.remember(data);
          const model = data.agents?.defaults?.model;
          status.currentModel = typeof model === 'string' ? model : typeof model?.primary === 'string' ? model.primary : null;
          configPort = port(data.gateway?.port);
        } catch (error) { configFailure = safeError(error); }
      })(),
      (async () => {
        try {
          const data = jsonOutput(await this.cli.run(['gateway', 'status', '--json', '--timeout', '3000'], {}, undefined, signal));
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError('CLI_OUTPUT_INVALID', 'OpenClaw returned an invalid Gateway status object.', 502);
          return data;
        }
        catch (error) { const failure = safeError(error); status.code = failure.code; status.message = failure.message; return null; }
      })(),
    ]);
    deadline(signal);
    status.gatewayPort = port(gateway?.gateway?.port) ?? configPort;
    if (gateway) {
      const runtime = gateway.service?.runtime;
      status.reachable = gateway.rpc?.ok === true;
      status.running = status.reachable || runtime?.status === 'running' ? true
        : ['stopped', 'not-installed'].includes(runtime?.status) || gateway.service?.loaded === false ? false : null;
      // A stopped service can report a previous PID. Do not present it as a live process.
      status.pid = runtime?.status === 'running' ? positiveInt(runtime?.pid) : null;
      status.code = status.reachable ? 'OPENCLAW_READY' : status.running ? 'OPENCLAW_GATEWAY_UNREACHABLE'
        : gateway.port?.status === 'busy' ? 'PORT_IN_USE' : status.running === false ? 'OPENCLAW_STOPPED' : 'OPENCLAW_STATUS_UNKNOWN';
      status.message = status.reachable ? 'OpenClaw Gateway is reachable.' : status.running ? 'OpenClaw is running but Gateway RPC cannot be reached. Check Gateway authentication and port.'
        : status.code === 'PORT_IN_USE' ? 'The Gateway port is occupied by another listener.' : status.running === false ? 'OpenClaw is stopped.' : 'OpenClaw runtime status could not be confirmed.';
    }
    if (configFailure) { status.code = configFailure.code; status.message = configFailure.message; }
    status.checkedAt = new Date().toISOString(); return status;
  }
  private async exclusive<T>(action: RuntimeAction | 'configure', task: () => Promise<T>): Promise<T> {
    if (this.operation) throw new ApiError('OPENCLAW_BUSY', 'Another configuration or runtime operation is in progress. Wait for its status to update.', 409);
    this.operation = { action, startedAt: new Date().toISOString(), timeoutMs: action === 'configure' ? 240000 : this.policy.actionTimeoutMs };
    this.invalidate();
    try { return await task(); } finally { this.operation = null; this.invalidate(); }
  }
  private async withDeadline(action: RuntimeAction) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.policy.actionTimeoutMs);
    try { return await this.lifecycle(action, controller.signal); } finally { clearTimeout(timer); }
  }
  private async lifecycle(action: RuntimeAction, signal: AbortSignal) {
    const before = await this.status(true, signal); deadline(signal);
    if (!before.installed) throw new ApiError(before.code, before.message, 503);
    if (action === 'start' && before.running) return { changed: false, confirmed: before.reachable, status: { ...before, operation: null } };
    if (action === 'stop' && before.running === false) return { changed: false, confirmed: true, status: { ...before, operation: null } };
    if (action === 'start' && before.running === null) throw new ApiError('OPENCLAW_STATUS_UNKNOWN', 'Cannot confirm runtime status; check OpenClaw before starting another instance.', 409);
    if (action === 'start' && before.code === 'PORT_IN_USE') throw new ApiError('PORT_IN_USE', before.message, 409);
    this.logs.add(`OpenClaw ${action} requested`);
    try {
      const result = jsonOutput(await this.cli.run(['gateway', action, '--json', ...(action === 'stop' ? ['--force'] : [])], {}, this.policy.commandTimeoutMs, signal));
      deadline(signal);
      if (result?.ok !== true) throw new ApiError('OPENCLAW_RUNTIME_FAILED', 'OpenClaw did not confirm the runtime command. Check service installation and permissions.', 502);
      let after = await this.status(true, signal);
      for (let attempt = 0; attempt < this.policy.confirmationAttempts && (action === 'stop' ? after.running !== false : !after.reachable); attempt++) {
        await new Promise<void>(resolve => { const timer = setTimeout(done, this.policy.confirmationDelayMs); function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); } signal.addEventListener('abort', done, { once: true }); if (signal.aborted) done(); });
        deadline(signal); after = await this.status(true, signal);
      }
      const complete = action === 'stop' ? after.running === false : after.reachable;
      this.logs.add(`OpenClaw ${action}: ${complete ? 'confirmed' : 'not confirmed'}`);
      return { changed: true, confirmed: complete, status: { ...after, operation: null } };
    } catch (error) {
      const failure = error instanceof ApiError ? error : new ApiError('OPENCLAW_RUNTIME_FAILED', 'OpenClaw runtime command failed. Check service installation, config, permissions and port conflicts.', 502);
      this.logs.add(`OpenClaw ${action} failed (${failure.code})`); throw failure;
    }
  }
  runtime(action: RuntimeAction) { return this.exclusive(action, () => this.withDeadline(action)); }
  configure(connection: Connection, model: string, restart: boolean) {
    return this.exclusive('configure', async () => {
      this.secrets.add(connection.apiKey);
      const applied = await this.config.update(connection, model);
      this.logs.add('OpenClaw configuration validated and backed up');
      if (!restart) return applied;
      try { const runtime = await this.withDeadline('restart'); return { ...applied, restartRequired: !runtime.confirmed, runtime }; }
      catch (error) { return { ...applied, restartRequired: true, restartError: (error as ApiError).code }; }
    });
  }
  async getLogs(lines: number) {
    const metadata = { updatedAt: new Date().toISOString(), lineLimit: lines };
    let config: unknown;
    try { config = (await this.config.read(await this.config.getPath())).data; this.remember(config); }
    catch { return { ...metadata, lines: this.logs.tail(lines), source: 'bridge', code: 'CONFIG_UNAVAILABLE', message: 'Cannot read OpenClaw config. Showing Bridge operation logs.' }; }
    try {
      const text = await this.cli.run(['logs', '--limit', String(lines), '--max-bytes', '100000', '--json'], {}, 15000);
      return { ...metadata, lines: redact(text, { config, environment: process.env }, [...this.secrets]).split('\n').slice(-lines), source: 'openclaw' };
    } catch (error) { const failure = safeError(error); return { ...metadata, lines: this.logs.tail(lines), source: 'bridge', code: failure.code, message: 'OpenClaw logs are unavailable. Showing Bridge operation logs.' }; }
  }
}
