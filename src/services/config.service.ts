import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSON5 from 'json5';
import { ApiError, jsonOutput } from '../types/api.js';
import type { Connection } from '../types/omniroute.js';
import { ProcessService } from './process.service.js';

export class ConfigService {
  constructor(private cli: ProcessService) {}
  async getPath(): Promise<string> {
    const result = jsonOutput(await this.cli.run(['config', 'file', '--json']));
    if (typeof result.path !== 'string' || !path.isAbsolute(result.path)) throw new ApiError('CONFIG_PATH_INVALID', 'OpenClaw did not return an absolute config path.', 502);
    return result.path;
  }
  async read(configPath: string): Promise<{ raw: string; data: any }> {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const data = JSON5.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      return { raw, data };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') throw new ApiError('CONFIG_MISSING', 'OpenClaw config is missing. Run openclaw onboard first.', 404);
      if (code === 'EACCES' || code === 'EPERM') throw new ApiError('CONFIG_PERMISSION_DENIED', 'Cannot read OpenClaw config. Check file permissions.', 403);
      throw new ApiError('CONFIG_INVALID', 'OpenClaw config is not a valid JSON/JSON5 object.', 422);
    }
  }
  async update(connection: Connection, model: string) {
    if (process.env.OPENCLAW_CONFIG_READONLY === '1' || process.env.OPENCLAW_NIX_MODE === '1')
      throw new ApiError('CONFIG_READ_ONLY', 'OpenClaw config is managed as read-only.', 403);
    const configPath = await this.getPath();
    const lockPath = configPath + '.bridge.lock';
    let lock;
    try { lock = await fs.open(lockPath, 'wx', 0o600); }
    catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      throw code === 'EEXIST'
        ? new ApiError('CONFIG_BUSY', 'Another config write is in progress. Check for a pending Bridge operation.', 409)
        : code === 'ENOENT'
        ? new ApiError('CONFIG_MISSING', 'OpenClaw config directory is missing. Run openclaw onboard first.', 404)
        : new ApiError('CONFIG_PERMISSION_DENIED', 'Cannot create config write lock. Check file permissions.', 403);
    }
    const candidate = configPath + '.' + randomUUID() + '.tmp';
    let backupPath: string | null = null; let wrote = false; let original = ''; let next = '';
    try {
      const stat = await fs.lstat(configPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new ApiError('CONFIG_UNSUPPORTED', 'Configuration must be a regular file; symlinks are not rewritten.', 422);
      const snapshot = await this.read(configPath); original = snapshot.raw;
      if (hasInclude(snapshot.data)) throw new ApiError('CONFIG_INCLUDES_UNSUPPORTED', 'Config uses $include. Use OpenClaw config tooling to update included files.', 422);
      const config = snapshot.data;
      config.models ??= {}; config.models.providers ??= {};
      const existing = config.models.providers.omniroute ?? {};
      const models = Array.isArray(existing.models) ? existing.models : [];
      config.models.providers.omniroute = { ...existing, baseUrl: connection.baseUrl, apiKey: connection.apiKey,
        api: 'openai-completions', auth: 'api-key', models: models.some((m: any) => m.id === model) ? models : [...models, { id: model, name: model }] };
      config.agents ??= {}; config.agents.defaults ??= {};
      const previous = config.agents.defaults.model;
      const reference = `omniroute/${model}`;
      config.agents.defaults.model = { ...(previous && typeof previous === 'object' ? previous : {}), primary: reference };
      if (config.agents.defaults.models) config.agents.defaults.models[reference] ??= {};
      next = JSON.stringify(config, null, 2) + '\n';
      await fs.writeFile(candidate, next, { flag: 'wx', mode: 0o600 });
      await this.validate(candidate);
      if (await fs.readFile(configPath, 'utf8') !== original) throw new ApiError('CONFIG_CHANGED', 'Config changed externally. Refresh and apply again.', 409);
      backupPath = configPath + '.' + randomUUID() + '.bak';
      await fs.writeFile(backupPath, original, { flag: 'wx', mode: 0o600 });
      await fs.rename(candidate, configPath); wrote = true;
      await this.validate(configPath);
      return { configPath, backupPath, currentModel: reference, restartRequired: true };
    } catch (error) {
      if (wrote) {
        if (await fs.readFile(configPath, 'utf8') !== next) throw new ApiError('CONFIG_ROLLBACK_CONFLICT', 'Config changed during validation. Restore the protected backup using OpenClaw before retrying.', 409);
        await fs.writeFile(candidate, original, { mode: 0o600 }); await fs.rename(candidate, configPath);
      }
      if (error instanceof ApiError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      throw new ApiError(code === 'EACCES' || code === 'EPERM' ? 'CONFIG_PERMISSION_DENIED' : code === 'ENOENT' ? 'CONFIG_MISSING' : 'CONFIG_WRITE_FAILED',
        'Cannot update OpenClaw config. Check config existence, structure and file permissions.', 422);
    } finally {
      await fs.rm(candidate, { force: true }).catch(() => {});
      await lock.close(); await fs.rm(lockPath, { force: true });
    }
  }
  private async validate(configPath: string) {
    try {
      const output = jsonOutput(await this.cli.run(['config', 'validate', '--json'], { OPENCLAW_CONFIG_PATH: configPath }, 30000));
      if (output.valid !== true) throw new Error();
    } catch { throw new ApiError('CONFIG_VALIDATION_FAILED', 'OpenClaw rejected the configuration. The previous config is preserved; inspect openclaw config validate locally.', 422); }
  }
}
function hasInclude(value: unknown): boolean {
  return !!value && typeof value === 'object' && Object.entries(value).some(([key, child]) => key === '$include' || hasInclude(child));
}
