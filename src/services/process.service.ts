import spawn from 'cross-spawn';
import { execFile } from 'node:child_process';
import { bridgeConfig } from '../config/bridge.config.js';
import { ApiError } from '../types/api.js';

// Only trusted server-side arguments reach this adapter. No credential is passed in argv.
export class ProcessService {
  constructor(private command = bridgeConfig.openclawCommand) {}
  run(args: string[], env: NodeJS.ProcessEnv = {}, timeout = bridgeConfig.cliTimeout): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, args, {
        env: { ...process.env, NO_COLOR: '1', ...env }, windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = ''; let diagnostic = ''; let bytes = 0; let finished = false;
      const finish = (error?: ApiError) => {
        if (finished) return; finished = true; clearTimeout(timer);
        if (error) reject(error); else resolve(output.trim());
      };
      const terminate = () => {
        if (process.platform === 'win32' && child.pid) execFile('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
        else child.kill();
      };
      const timer = setTimeout(() => {
        terminate(); finish(new ApiError('OPENCLAW_TIMEOUT', 'OpenClaw command timed out; refresh status before retrying.', 504));
      }, timeout);
      for (const stream of [child.stdout, child.stderr]) stream?.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 512000) { terminate(); finish(new ApiError('CLI_OUTPUT_LIMIT', 'OpenClaw output exceeded the allowed size.', 502)); }
        else if (stream === child.stdout) output += chunk.toString();
        else diagnostic += chunk.toString();
      });
      child.once('error', (error: NodeJS.ErrnoException) => finish(new ApiError(
        error.code === 'ENOENT' ? 'OPENCLAW_NOT_INSTALLED' : 'OPENCLAW_COMMAND_FAILED',
        error.code === 'ENOENT' ? 'OpenClaw command was not found. Install OpenClaw or set OPENCLAW_COMMAND.' : 'Cannot execute OpenClaw. Check command permissions.', 503)));
      child.once('close', code => {
        if (code === 0) return finish();
        const details = output + '\n' + diagnostic;
        const failure = /EADDRINUSE|address already in use|port.*already.*use/i.test(details)
          ? new ApiError('PORT_IN_USE', 'OpenClaw Gateway port is already in use.', 409)
          : /service.*not.*install|service.*not.*loaded|missing-install/i.test(details)
          ? new ApiError('OPENCLAW_SERVICE_NOT_INSTALLED', 'OpenClaw Gateway service is not installed. Run openclaw gateway install.', 409)
          : /EACCES|EPERM|permission denied|access is denied/i.test(details)
          ? new ApiError('OPENCLAW_PERMISSION_DENIED', 'OpenClaw does not have permission to perform this action.', 403)
          : /unknown command|unknown option/i.test(details)
          ? new ApiError('OPENCLAW_CLI_UNSUPPORTED', 'This OpenClaw version does not support the required CLI command.', 422)
          : new ApiError('OPENCLAW_COMMAND_FAILED', 'OpenClaw command failed. Check service installation, config, permissions and port availability in OpenClaw.', 502);
        finish(failure);
      });
    });
  }
}
