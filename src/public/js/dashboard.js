'use strict';
const el = id => document.getElementById(id);
async function api(path, body) {
  const response = await fetch(path, { ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(180000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${data.code || response.status}: ${data.error || 'Request failed'}`);
  return data;
}
const connection = () => ({ baseUrl: el('baseUrl').value, apiKey: el('apiKey').value });
async function busy(button, output, task) {
  button.disabled = true; output.textContent = 'Đang xử lý…';
  try { await task(); } catch (error) { output.textContent = error.message; }
  finally { button.disabled = false; }
}
let checking = false;
async function refresh() {
  if (checking) return; checking = true;
  try {
    const data = await api('/api/system/health'); const o = data.openclaw; const m = data.omniroute;
    el('system-health').textContent = [
      `Bridge: Online · ${data.bridge.version}`,
      `OpenClaw: ${o.installed ? 'Installed' : 'Not installed'} · ${o.running === null ? 'Unknown' : o.running ? 'Running' : 'Stopped'}`,
      `Gateway: ${o.reachable ? 'Reachable' : 'Unreachable'} · PID: ${o.pid ?? '—'} · ${o.code}`,
      `Current model: ${o.currentModel || '—'}`,
      `OmniRoute: ${m.modelsAvailable ? 'Connected' : 'Offline / cần kiểm tra'} · ${m.code} · ${m.baseUrl}`,
    ].join('\n');
  } catch (error) { el('system-health').textContent = error.message; }
  finally { checking = false; }
}
el('refresh').addEventListener('click', refresh);
el('omni-form').addEventListener('submit', event => {
  event.preventDefault();
  busy(el('check'), el('connection-status'), async () => {
    el('model-section').hidden = true;
    const data = await api('/api/omniroute/check', connection());
    el('model-select').replaceChildren(...data.models.map(model => { const option = document.createElement('option'); option.value = model.id; option.textContent = model.id; return option; }));
    el('model-section').hidden = false;
    el('configure').disabled = data.models.length === 0;
    el('connection-status').textContent = `Đã tải ${data.models.length} model. API key chưa được xác minh bằng inference; có thể dùng phép thử model bên dưới.`;
    await refresh();
  });
});
for (const id of ['baseUrl', 'apiKey']) el(id).addEventListener('input', () => { el('model-section').hidden = true; el('connection-status').textContent = ''; });
el('configure').addEventListener('click', () => busy(el('configure'), el('config-status'), async () => {
  const data = await api('/api/openclaw/configure', { ...connection(), model: el('model-select').value, restart: el('restart-after').checked });
  el('config-status').textContent = `${data.message} ${data.restartRequired ? 'Cần restart/reload Gateway. ' : ''}${data.restartError || ''}`;
  await refresh();
}));
el('test').addEventListener('click', () => busy(el('test'), el('chat-result'), async () => {
  const data = await api('/api/omniroute/test', { ...connection(), model: el('model-select').value, prompt: el('chat-prompt').value });
  el('chat-result').textContent = data.result;
}));
const runtimeButtons = [...document.querySelectorAll('[data-runtime]')];
for (const button of runtimeButtons) button.addEventListener('click', async () => {
  runtimeButtons.forEach(b => { b.disabled = true; });
  try {
    el('runtime-status').textContent = 'Đang xử lý…';
    const data = await api(`/api/openclaw/${button.dataset.runtime}`, {});
    el('runtime-status').textContent = data.changed === false ? 'Trạng thái đã đúng, không cần thay đổi.' : data.confirmed ? 'Đã xác nhận trạng thái Gateway.' : `Đã gửi lệnh; trạng thái chưa được xác nhận: ${data.status.code}`;
    await refresh();
  } catch (error) { el('runtime-status').textContent = error.message; }
  finally { runtimeButtons.forEach(b => { b.disabled = false; }); }
});
el('logs').addEventListener('click', () => busy(el('logs'), el('log-output'), async () => {
  const data = await api(`/api/openclaw/logs?lines=${encodeURIComponent(el('log-lines').value)}`);
  el('log-source').textContent = `Nguồn: ${data.source}${data.code ? ` · ${data.code}` : ''}`;
  el('log-output').textContent = data.lines.join('\n') || 'Chưa có log.';
}));
refresh(); setInterval(() => { if (!document.hidden) refresh(); }, 15000);
