import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { OpenClawService } from '../dist/services/openclaw.service.js';
import { ConfigService } from '../dist/services/config.service.js';
import { ProcessService } from '../dist/services/process.service.js';
import { LogService, redact } from '../dist/services/log.service.js';
import { HealthService } from '../dist/services/health.service.js';
import { systemRoutes } from '../dist/routes/system.routes.js';
import { ApiError } from '../dist/types/api.js';
import { createPoller, errorPresentation, runtimeLabel } from '../src/public/js/control-center-state.js';

async function fixture(t, policy = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'control-center-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const configPath = path.join(dir, 'openclaw.json');
  await fs.writeFile(configPath, JSON.stringify({ gateway: { port: 6123, auth: { token: 'fixture-gateway-private' } }, agents: { defaults: { model: { primary: 'provider/model' } } } }));
  const state = { running: false, reachable: false, pid: 2468, port: 18789, unknown: false, failure: null, result: { ok: true }, onAction: null, calls: [], configDelay: 0, versionMissing: false };
  const cli = { async run(args, env, timeout, signal) {
    state.calls.push(args);
    if (args[0] === '--version') {
      if (state.versionMissing) throw new ApiError('OPENCLAW_NOT_INSTALLED', 'OpenClaw was not found.', 503);
      return 'OpenClaw 2026.11.1';
    }
    if (args[0] === 'config') {
      if (state.configDelay) await new Promise(resolve => setTimeout(resolve, state.configDelay));
      return JSON.stringify({ path: configPath });
    }
    if (args[0] === 'logs') return JSON.stringify({ message: 'fixture-gateway-private', credential: 'fixture-log-secret' });
    if (args[1] === 'status') return JSON.stringify({ service: { loaded: true, runtime: { status: state.unknown ? 'unknown' : state.running ? 'running' : 'stopped', pid: state.pid } }, gateway: { port: state.port }, rpc: { ok: state.reachable } });
    if (state.failure) throw state.failure;
    if (state.onAction) await state.onAction(signal);
    state.running = args[1] !== 'stop'; state.reachable = state.running;
    return JSON.stringify(state.result);
  } };
  const config = new ConfigService(cli);
  const service = new OpenClawService(cli, config, new LogService(), policy);
  return { state, service, configPath, cli };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('control center projects CLI/config/runtime fields without stale PID or config port races', async t => {
  const f = await fixture(t); f.state.configDelay = 10;
  const stopped = await f.service.status();
  assert.equal(stopped.pid, null); assert.equal(stopped.gatewayPort, 18789);
  assert.equal(stopped.configPath, f.configPath); assert.equal(stopped.currentModel, 'provider/model');
  assert.equal(stopped.version, '2026.11.1'); assert.ok(stopped.message); assert.ok(Date.parse(stopped.checkedAt));
  f.state.running = true; f.state.reachable = true;
  const running = await f.service.status(true);
  assert.equal(running.pid, 2468); assert.equal(running.reachable, true); assert.equal(runtimeLabel(running), 'Running');
  f.state.port = 99999;
  assert.equal((await f.service.status(true)).gatewayPort, 6123);
});
test('runtime clears busy after CLI errors, timeout errors and invalid success output', async t => {
  for (const code of ['OPENCLAW_COMMAND_FAILED', 'OPENCLAW_TIMEOUT', 'OPENCLAW_PERMISSION_DENIED']) {
    const f = await fixture(t); f.state.failure = new ApiError(code, 'Fixture command failed.', 502);
    await assert.rejects(f.service.runtime('start'), { code });
    assert.equal((await f.service.status()).operation, null);
    f.state.failure = null;
    assert.equal((await f.service.runtime('start')).confirmed, true);
    assert.equal((await f.service.runtime('restart')).confirmed, true);
    assert.equal((await f.service.runtime('stop')).confirmed, true);
  }
  const f = await fixture(t); f.state.result = { ok: false };
  await assert.rejects(f.service.runtime('restart'), { code: 'OPENCLAW_RUNTIME_FAILED' });
  assert.equal((await f.service.status()).operation, null);
  f.state.result = { ok: true }; assert.equal((await f.service.runtime('stop')).confirmed, true);
});
test('whole-action deadline cancels a real CLI child and releases busy before retry', async t => {
  const f = await fixture(t, { actionTimeoutMs: 150 });
  f.state.onAction = signal => new ProcessService(process.execPath).run(['-e', 'setInterval(()=>{},1000)'], {}, 10000, signal);
  const start = Date.now();
  await assert.rejects(f.service.runtime('start'), { code: 'OPENCLAW_TIMEOUT' });
  assert.ok(Date.now() - start < 5000);
  assert.equal((await f.service.status()).operation, null);
  f.state.onAction = null;
  assert.equal((await f.service.runtime('start')).confirmed, true);
});
test('a second tab sees active operation metadata; duplicate action is rejected and health recovers', async t => {
  const f = await fixture(t); let finish;
  f.state.onAction = () => new Promise(resolve => { finish = resolve; });
  const action = f.service.runtime('start');
  while (!finish) await tick();
  const health = new HealthService(f.service, { async health() { return { reachable: false }; } });
  const app = express(); app.use('/api/system', systemRoutes(health));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/system/health`;
  const during = await (await fetch(url)).json();
  assert.equal(during.bridge.status, 'online'); assert.equal(during.openclaw.operation.action, 'start');
  assert.equal(during.openclaw.operation.timeoutMs, 90000);
  await assert.rejects(f.service.runtime('restart'), { code: 'OPENCLAW_BUSY' });
  finish(); await action;
  const after = await (await fetch(url)).json();
  assert.equal(after.openclaw.operation, null); assert.equal(after.openclaw.running, true); assert.equal(after.openclaw.pid, 2468);
  assert.ok(!JSON.stringify(after).includes('fixture-gateway-private'));
});
test('missing CLI and failed detection release the runtime lock', async t => {
  const f = await fixture(t); f.state.versionMissing = true;
  await assert.rejects(f.service.runtime('start'), { code: 'OPENCLAW_NOT_INSTALLED' });
  f.state.versionMissing = false; assert.equal((await f.service.runtime('start')).confirmed, true);
});
test('unconfirmed restart reports actual stopped state without remaining busy', async t => {
  const f = await fixture(t, { confirmationAttempts: 0 });
  const run = f.cli.run;
  f.cli.run = async (...args) => {
    const output = await run(...args);
    if (args[0][1] === 'restart') { f.state.running = false; f.state.reachable = false; }
    return output;
  };
  const result = await f.service.runtime('restart');
  assert.equal(result.confirmed, false); assert.equal(result.status.running, false);
  assert.equal((await f.service.status()).operation, null);
});
test('runtime log source, limit and credentials stay safe; failure reports Bridge fallback', async t => {
  const f = await fixture(t);
  const logs = await f.service.getLogs(1);
  assert.equal(logs.source, 'openclaw'); assert.equal(logs.lineLimit, 1); assert.equal(logs.lines.length, 1);
  assert.ok(!JSON.stringify(logs).includes('fixture-gateway-private')); assert.ok(!JSON.stringify(logs).includes('fixture-log-secret'));
  const run = f.cli.run; f.cli.run = (...args) => args[0][0] === 'logs' ? Promise.reject(new ApiError('OPENCLAW_TIMEOUT', 'Fixture timeout', 504)) : run(...args);
  const fallback = await f.service.getLogs(100);
  assert.equal(fallback.source, 'bridge'); assert.equal(fallback.code, 'OPENCLAW_TIMEOUT'); assert.ok(fallback.message);
});
test('log masking handles nested credentials, Basic auth, URL auth, PEM and JSON escaping', () => {
  const config = { credentials: { opaque: 'fixture-opaque-secret' }, apiKey: 'fixture"escaped\\key' };
  const input = JSON.stringify({ message: 'fixture-opaque-secret fixture"escaped\\key', credential: 'unknown-secret' })
    + '\nBasic YWxhZGRpbjpzZWNyZXQ=\nhttp://user:password@localhost\n-----BEGIN PRIVATE KEY-----\nfixturepem\n-----END PRIVATE KEY-----';
  const masked = redact(input, config);
  for (const secret of ['fixture-opaque-secret', 'fixture\\"escaped', 'unknown-secret', 'YWxhZGRpbjpzZWNyZXQ=', 'user:password', 'fixturepem']) assert.ok(!masked.includes(secret), secret);
});
function scheduler() {
  let sequence = 0; const jobs = new Map();
  return { jobs, setTimer(fn, delay) { const id = ++sequence; jobs.set(id, { fn, delay }); return id; }, clearTimer(id) { jobs.delete(id); }, fire() { const [id, job] = jobs.entries().next().value; jobs.delete(id); job.fn(); } };
}
test('poller coalesces slow responses, slows hidden tabs and resumes immediately', async () => {
  const timers = scheduler(); let hidden = false; let calls = 0; let finish;
  const poller = createPoller(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, { ...timers, isHidden: () => hidden });
  const first = poller.start(); await tick(); assert.equal(poller.refresh(), first); assert.equal(calls, 1);
  finish(); await first; assert.equal([...timers.jobs.values()][0].delay, 7000);
  hidden = true; poller.visibilityChanged(); assert.equal([...timers.jobs.values()][0].delay, 45000); assert.equal(calls, 1);
  hidden = false; poller.visibilityChanged(); await tick(); assert.equal(calls, 2);
  const pending = poller.refresh(); poller.stop(); finish(); await pending; assert.equal(timers.jobs.size, 0);
});
test('poller recovers after failure and explicit post-action refresh waits for older response', async () => {
  const timers = scheduler(); let calls = 0; let resolveOld; const errors = [];
  const poller = createPoller(() => { calls++; if (calls === 1) throw new Error('offline'); if (calls === 2) return new Promise(resolve => { resolveOld = resolve; }); }, { ...timers, onError: error => errors.push(error.message) });
  await poller.start(); assert.deepEqual(errors, ['offline']); assert.equal(timers.jobs.size, 1);
  timers.fire(); await tick(); const newer = poller.refreshAfterCurrent(); assert.equal(calls, 2);
  resolveOld(); await newer; assert.equal(calls, 3); assert.equal(timers.jobs.size, 1); poller.stop();
});
test('error UX presents guidance separately from technical codes', () => {
  for (const code of ['OPENCLAW_COMMAND_FAILED', 'OPENCLAW_BUSY', 'OPENCLAW_TIMEOUT', 'PORT_IN_USE']) {
    const error = errorPresentation({ code }); assert.equal(error.code, code); assert.ok(!error.message.includes(code)); assert.ok(error.message.length > 30);
  }
});

test('an in-flight pre-action status response cannot repopulate the post-action cache', async t => {
  const f = await fixture(t); f.state.configDelay = 30;
  const older = f.service.status(); await tick();
  const action = await f.service.runtime('start'); await older;
  assert.equal(action.confirmed, true);
  assert.equal((await f.service.status()).running, true);
});
test('no-op start and stop leave no active operation in their response', async t => {
  const f = await fixture(t);
  assert.equal((await f.service.runtime('stop')).status.operation, null);
  await f.service.runtime('start');
  const repeated = await f.service.runtime('start');
  assert.equal(repeated.changed, false); assert.equal(repeated.status.operation, null);
});
test('pre-aborted CLI requests do not start another process', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(new ProcessService('/nonexistent-command').run(['--version'], {}, 10000, controller.signal), { code: 'OPENCLAW_TIMEOUT' });
});
test('invalid Gateway status output is reported without pretending OpenClaw is missing', async t => {
  const f = await fixture(t); const run = f.cli.run;
  f.cli.run = (...args) => args[0][1] === 'status' ? Promise.resolve('null') : run(...args);
  const status = await f.service.status();
  assert.equal(status.installed, true); assert.equal(status.code, 'CLI_OUTPUT_INVALID'); assert.equal(status.running, null);
});
