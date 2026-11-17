import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { ProcessService } from '../dist/services/process.service.js';
import { ConfigService } from '../dist/services/config.service.js';
import { OpenClawService } from '../dist/services/openclaw.service.js';
import { OmniRouteService, normalizeBaseUrl } from '../dist/services/omniroute.service.js';
import { LogService, redact } from '../dist/services/log.service.js';
import { createApp } from '../dist/server.js';

const key = 'fixture-api-key-private';
async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-fixture-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const configPath = path.join(dir, 'openclaw.json');
  const original = `// preserve original backup bytes\n{ gateway: {mode: 'local', auth: {token: 'fixture-gateway-token'}}, models: { providers: { other: { baseUrl: 'http://localhost:1/v1', models: [] } } }, agents: {defaults: {model: {primary: 'other/model', fallbacks: ['other/fallback']}, models: {'other/model': {}}}} }`;
  await fs.writeFile(configPath, original);
  const state = { running: false, reachable: false, unknown: false, calls: [], rejectCandidate: false, rejectInstalled: false, delay: 0, externalChange: false };
  const cli = { async run(args, env = {}) {
    state.calls.push([...args]);
    if (args[0] === '--version') return 'OpenClaw 2026.11.1';
    if (args[0] === 'config' && args[1] === 'file') return JSON.stringify({ path: configPath });
    if (args[0] === 'config' && args[1] === 'validate') {
      const candidate = env.OPENCLAW_CONFIG_PATH !== configPath;
      if (state.externalChange && candidate) await fs.writeFile(configPath, '{ external: true }');
      return JSON.stringify({ valid: !(candidate ? state.rejectCandidate : state.rejectInstalled) });
    }
    if (args[0] === 'gateway' && args[1] === 'status') return JSON.stringify({
      service: { loaded: true, runtime: { status: state.unknown ? 'unknown' : state.running ? 'running' : 'stopped', ...(state.running ? {pid: 2345} : {}) } },
      gateway: { port: 18789 }, rpc: { ok: state.reachable },
      credentials: key,
    });
    if (args[0] === 'gateway') {
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      state.running = args[1] !== 'stop'; state.reachable = state.running;
      return JSON.stringify({ ok: true });
    }
    if (args[0] === 'logs') return JSON.stringify({ message: `Bearer ${key}`, token: 'fixture-gateway-token' });
    throw new Error('Unexpected fixture CLI command');
  } };
  const config = new ConfigService(cli);
  const service = new OpenClawService(cli, config, new LogService());
  return { dir, configPath, original, state, cli, config, service };
}
async function omniServer(t) {
  const state = { models: 0, auth: key, mode: 'ok' };
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== `Bearer ${state.auth}`) { res.statusCode = 401; return res.end(JSON.stringify({ error: key })); }
    if (state.mode === 'malformed') return res.end('{"data":"invalid"}');
    if (req.url === '/v1/models') { state.models++; return res.end(JSON.stringify({ data: [{ id: 'provider/model', owned_by: 'provider', secret: key }] })); }
    if (req.url === '/v1/chat/completions') return res.end(JSON.stringify({ choices: [{ message: { content: 'fixture response' } }] }));
    res.statusCode = 404; res.end('{}');
  });
  const url = await listen(t, server);
  return { url, state };
}
const connection = { baseUrl: 'http://127.0.0.1:20128/v1', apiKey: key };

test('normalizes origin and /v1 without duplicating path; rejects credential URLs', () => {
  assert.equal(normalizeBaseUrl('http://127.0.0.1:20128'), connection.baseUrl);
  assert.equal(normalizeBaseUrl(connection.baseUrl + '/'), connection.baseUrl);
  assert.throws(() => normalizeBaseUrl('http://user:secret@localhost'), { code: 'INVALID_BASE_URL' });
  assert.throws(() => normalizeBaseUrl('file:///etc/passwd'), { code: 'INVALID_BASE_URL' });
});
test('catalog cache avoids duplicate requests and distinguishes rejected credentials', async t => {
  const mock = await omniServer(t); const service = new OmniRouteService(); const conn = { baseUrl: mock.url + '/v1', apiKey: key };
  assert.deepEqual(await service.getModels(conn), [{ id: 'provider/model', owned_by: 'provider' }]);
  await service.getModels(conn); assert.equal(mock.state.models, 1);
  assert.equal((await service.health(conn)).apiKeyStatus, 'not_verified');
  await assert.rejects(service.getModels({ ...conn, apiKey: 'bad' }), { code: 'OMNIROUTE_INVALID_KEY' });
  mock.state.mode = 'malformed'; await assert.rejects(service.getModels(conn, true), { code: 'OMNIROUTE_INVALID_RESPONSE' });
});
test('config updates current schema, preserves other providers/fallbacks, creates exact backup', async t => {
  const f = await fixture(t); const result = await f.config.update(connection, 'provider/model');
  const cfg = JSON.parse(await fs.readFile(f.configPath, 'utf8'));
  assert.equal(cfg.models.providers.omniroute.api, 'openai-completions');
  assert.equal(cfg.models.providers.omniroute.models[0].id, 'provider/model');
  assert.equal(cfg.models.providers.other.baseUrl, 'http://localhost:1/v1');
  assert.equal(cfg.agents.defaults.model.primary, 'omniroute/provider/model');
  assert.deepEqual(cfg.agents.defaults.model.fallbacks, ['other/fallback']);
  assert.ok(cfg.agents.defaults.models['omniroute/provider/model']);
  assert.equal(await fs.readFile(result.backupPath, 'utf8'), f.original);
  if (process.platform !== 'win32') { assert.equal((await fs.stat(result.backupPath)).mode & 0o777, 0o600); assert.equal((await fs.stat(f.configPath)).mode & 0o777, 0o600); }
  assert.equal(f.state.calls.filter(args => args[1] === 'validate').length, 2);
  assert.ok(!(await fs.readdir(f.dir)).some(file => file.endsWith('.tmp') || file.endsWith('.lock')));
});
test('candidate validation failure leaves original file and cleans temporary secrets', async t => {
  const f = await fixture(t); f.state.rejectCandidate = true;
  await assert.rejects(f.config.update(connection, 'model'), { code: 'CONFIG_VALIDATION_FAILED' });
  assert.equal(await fs.readFile(f.configPath, 'utf8'), f.original);
  assert.deepEqual(await fs.readdir(f.dir), ['openclaw.json']);
});
test('post-write validation failure rolls back original bytes and retains backup', async t => {
  const f = await fixture(t); f.state.rejectInstalled = true;
  await assert.rejects(f.config.update(connection, 'model'), { code: 'CONFIG_VALIDATION_FAILED' });
  assert.equal(await fs.readFile(f.configPath, 'utf8'), f.original);
  assert.equal((await fs.readdir(f.dir)).filter(file => file.endsWith('.bak')).length, 1);
});
test('external config edits are not overwritten', async t => {
  const f = await fixture(t); f.state.externalChange = true;
  await assert.rejects(f.config.update(connection, 'model'), { code: 'CONFIG_CHANGED' });
  assert.equal(await fs.readFile(f.configPath, 'utf8'), '{ external: true }');
});
test('included configuration is refused without rewriting it', async t => {
  const f = await fixture(t); const input = '{ models: { $include: "models.json" } }'; await fs.writeFile(f.configPath, input);
  await assert.rejects(f.config.update(connection, 'model'), { code: 'CONFIG_INCLUDES_UNSUPPORTED' });
  assert.equal(await fs.readFile(f.configPath, 'utf8'), input);
});
test('status coalesces detection and projects no credentials', async t => {
  const f = await fixture(t);
  const statuses = await Promise.all([f.service.status(), f.service.status(), f.service.status()]);
  assert.equal(statuses[0].running, false); assert.equal(statuses[0].gatewayPort, 18789);
  assert.ok(!JSON.stringify(statuses).includes(key));
  assert.equal(f.state.calls.filter(args => args[0] === '--version').length, 1);
});
test('runtime start/stop/restart delegates to CLI; repeated start is idempotent', async t => {
  const f = await fixture(t);
  assert.equal((await f.service.runtime('start')).confirmed, true);
  assert.equal((await f.service.runtime('start')).changed, false);
  assert.equal((await f.service.runtime('restart')).status.pid, 2345);
  assert.equal((await f.service.runtime('stop')).status.running, false);
  assert.equal(f.state.calls.filter(args => args[0] === 'gateway' && args[1] === 'start').length, 1);
  assert.ok(f.state.calls.some(args => args[1] === 'stop' && args.includes('--force')));
});
test('unknown runtime status prevents starting a duplicate instance', async t => {
  const f = await fixture(t); f.state.unknown = true;
  await assert.rejects(f.service.runtime('start'), { code: 'OPENCLAW_STATUS_UNKNOWN' });
  assert.equal(f.state.calls.filter(args => args[1] === 'start').length, 0);
});
test('concurrent lifecycle operations are rejected clearly', async t => {
  const f = await fixture(t); f.state.delay = 30;
  const start = f.service.runtime('start');
  await assert.rejects(f.service.runtime('restart'), { code: 'OPENCLAW_BUSY' });
  await start;
});
test('log redaction covers config credentials, JSON escapes and bearer text', () => {
  const secret = 'fixture"escaped\\secret';
  const cfg = { gateway: { auth: { token: secret } }, models: { providers: { x: { apiKey: key } } } };
  const text = JSON.stringify({ message: secret, line: `Bearer ${key}`, password: 'unknown-value' });
  const result = redact(text, cfg);
  assert.ok(!result.includes(JSON.stringify(secret).slice(1,-1)));
  assert.ok(!result.includes(key)); assert.ok(!result.includes('unknown-value'));
});
test('legacy HTTP APIs, system health, config and logs work together', async t => {
  const f = await fixture(t); const mock = await omniServer(t);
  const url = await listen(t, createApp(f.cli));
  const post = (route, body) => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const conn = { baseUrl: mock.url, apiKey: key };
  const check = await (await post('/api/omniroute/check', conn)).json();
  assert.equal(check.connected, true); assert.equal(check.models[0].id, 'provider/model');
  const health = await (await fetch(url + '/api/system/health')).json();
  assert.equal(health.bridge.status, 'online'); assert.equal(health.openclaw.installed, true); assert.equal(health.omniroute.modelsAvailable, true);
  const prompt = await (await post('/api/omniroute/test', { ...conn, model: 'provider/model', prompt: 'test' })).json();
  assert.equal(prompt.result, 'fixture response');
  const unavailable = await post('/api/openclaw/configure', { ...conn, model: 'missing' });
  assert.equal(unavailable.status, 422); assert.equal(await fs.readFile(f.configPath, 'utf8'), f.original);
  const applied = await (await post('/api/openclaw/configure', { ...conn, model: 'provider/model' })).json();
  assert.equal(applied.success, true); assert.equal(applied.restartRequired, true);
  const logs = await (await fetch(url + '/api/openclaw/logs?lines=10')).json();
  assert.equal(logs.source, 'openclaw'); assert.ok(!JSON.stringify(logs).includes(key)); assert.ok(!JSON.stringify(logs).includes('fixture-gateway-token'));
  assert.equal((await fetch(url + '/api/openclaw/logs?lines=501')).status, 400);
  const html = await (await fetch(url)).text(); assert.ok(html.includes('System health')); assert.ok(!html.includes(key));
  assert.equal((await fetch(url + '/js/dashboard.js')).status, 200);
});
test('HTTP rejects foreign origins, DNS rebinding hosts and non-JSON writes', async t => {
  const f = await fixture(t); const url = await listen(t, createApp(f.cli));
  assert.equal((await fetch(url + '/api/openclaw/start', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.invalid' }, body: '{}' })).status, 403);
  assert.equal((await fetch(url + '/api/openclaw/start', { method: 'POST', body: '{}' })).status, 415);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { Host: 'attacker.invalid' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject);
  });
  assert.equal(hostStatus, 403);
});
test('process adapter reports missing executable and kills timed-out own process', async () => {
  await assert.rejects(new ProcessService(path.join(os.tmpdir(), 'nonexistent-bridge-executable')).run(['--version']), { code: 'OPENCLAW_NOT_INSTALLED' });
  await assert.rejects(new ProcessService(process.execPath).run(['-e', 'setInterval(()=>{},1000)'], {}, 100), { code: 'OPENCLAW_TIMEOUT' });
  await assert.rejects(new ProcessService(process.execPath).run(['-e', `process.stderr.write('${key}');process.exit(1)`]), error => error.code === 'OPENCLAW_COMMAND_FAILED' && !error.message.includes(key));
});
test('Windows npm .cmd shim supports spaces in executable paths', { skip: process.platform !== 'win32' }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge command ')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const command = path.join(dir, 'openclaw.cmd'); const entry = path.join(dir, 'cli.cjs');
  await fs.writeFile(entry, `console.log(JSON.stringify(process.argv.slice(2)))`);
  await fs.writeFile(command, `@echo off\r\n"${process.execPath}" "${entry}" %*\r\n`);
  assert.deepEqual(JSON.parse(await new ProcessService(command).run(['gateway', 'status', '--json'])), ['gateway', 'status', '--json']);
});

test('installed CLI with missing config reports CONFIG_MISSING', async t => {
  const f = await fixture(t); await fs.rm(f.configPath);
  const status = await f.service.status();
  assert.equal(status.installed, true); assert.equal(status.configExists, false); assert.equal(status.code, 'CONFIG_MISSING');
});
test('filesystem lock prevents competing config writes', async t => {
  const f = await fixture(t); await fs.writeFile(f.configPath + '.bridge.lock', '');
  await assert.rejects(f.config.update(connection, 'model'), { code: 'CONFIG_BUSY' });
  assert.equal(await fs.readFile(f.configPath, 'utf8'), f.original);
});
test('configuration remains applied if optional restart fails', async t => {
  const f = await fixture(t); const originalRun = f.cli.run;
  f.cli.run = async (args, env) => { if (args[1] === 'restart') throw new Error('fixture failed'); return originalRun(args, env); };
  const result = await f.service.configure(connection, 'provider/model', true);
  assert.equal(result.restartRequired, true); assert.equal(result.restartError, 'OPENCLAW_RUNTIME_FAILED');
  assert.equal(JSON.parse(await fs.readFile(f.configPath, 'utf8')).agents.defaults.model.primary, 'omniroute/provider/model');
});
test('process adapter reports port conflicts without exposing stderr secrets', async () => {
  await assert.rejects(new ProcessService(process.execPath).run(['-e', `process.stderr.write('EADDRINUSE ${key}');process.exit(1)`]), error => error.code === 'PORT_IN_USE' && !error.message.includes(key));
});
