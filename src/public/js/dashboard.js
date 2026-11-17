import { createPoller, errorPresentation, runtimeLabel } from './control-center-state.js';
const el = id => document.getElementById(id);
const time = value => new Date(value).toLocaleTimeString('vi-VN');
async function api(path, body, timeout = 45000) {
  try {
    const response = await fetch(path, { ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeout) });
    let data;
    try { data = await response.json(); } catch { throw Object.assign(new Error('Bridge trả về dữ liệu không hợp lệ. Hãy kiểm tra ứng dụng và thử lại.'), { code: 'INVALID_RESPONSE' }); }
    if (!response.ok) throw Object.assign(new Error(data.message || data.error || 'Không thể hoàn tất yêu cầu.'), { code: data.code || `HTTP_${response.status}` });
    return data;
  } catch (error) {
    if (!error.code) error.code = error.name === 'TimeoutError' || error.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR';
    throw error;
  }
}
function report(output, error, detailPrefix) {
  const presentation = errorPresentation(error); output.textContent = presentation.message;
  if (detailPrefix) { el(`${detailPrefix}-details`).hidden = false; el(`${detailPrefix}-code`).textContent = presentation.code; }
}
const connection = () => ({ baseUrl: el('baseUrl').value, apiKey: el('apiKey').value });
async function busy(button, output, task) {
  if (button.disabled) return;
  button.disabled = true; output.textContent = 'Đang xử lý…';
  try { await task(); } catch (error) { report(output, error); }
  finally { button.disabled = false; }
}
const runtimeButtons = [...document.querySelectorAll('[data-runtime]')];
let activeAction = null; let remoteOperation = null; let epoch = 0;
function updateButtons() {
  const remoteBusy = remoteOperation && Date.now() < Date.parse(remoteOperation.startedAt) + remoteOperation.timeoutMs + 5000;
  if (remoteOperation && !remoteBusy && !activeAction) {
    remoteOperation = null; el('runtime-status').textContent = 'Chưa nhận được trạng thái mới. Hãy làm mới để kiểm tra thao tác.'; el('runtime-status').className = 'action-status';
  }
  runtimeButtons.forEach(button => { button.disabled = Boolean(activeAction || remoteBusy); });
  el('runtime').setAttribute('aria-busy', String(Boolean(activeAction || remoteBusy)));
}
function renderRuntime(status) {
  if (!status) return;
  remoteOperation = status.operation; const running = runtimeLabel(status);
  el('openclaw-state').textContent = status.installed ? 'Installed' : status.commandExists ? 'CLI lỗi' : 'Chưa cài đặt';
  el('openclaw-version').textContent = status.version ? `Version ${status.version}` : 'Chưa xác định phiên bản';
  el('gateway-state').textContent = status.reachable ? 'Reachable' : 'Unreachable';
  el('gateway-state').className = status.reachable ? 'good' : 'warn';
  el('gateway-port').textContent = `Port ${status.gatewayPort ?? '—'}`;
  el('runtime-state').textContent = running; el('runtime-state').className = status.running ? 'good' : 'warn';
  el('runtime-pid').textContent = `PID ${status.pid ?? '—'}`;
  el('runtime-badge').textContent = running; el('runtime-badge').className = `pill ${status.running ? 'good' : ''}`;
  for (const [id, value] of Object.entries({ 'detail-pid': status.pid, 'detail-port': status.gatewayPort, 'detail-version': status.version, 'detail-model': status.currentModel, 'config-path': status.configPath }))
    el(id).textContent = value ?? '—';
  if (remoteOperation && !activeAction) {
    el('runtime-status').textContent = `Đang xử lý ${remoteOperation.action} từ một yêu cầu khác. Trạng thái sẽ tự cập nhật.`;
    el('runtime-status').className = 'action-status loading';
  } else if (!remoteOperation && !activeAction && el('runtime-status').classList.contains('loading')) {
    el('runtime-status').textContent = 'Không còn thao tác runtime đang xử lý.'; el('runtime-status').className = 'action-status';
  }
  updateButtons();
}
const healthPoller = createPoller(async () => {
  const currentEpoch = epoch;
  el('refresh').disabled = true;
  try {
    const data = await api('/api/system/health');
    if (currentEpoch !== epoch) return; // Discard pre-action health responses.
    el('bridge-state').textContent = 'Online'; el('bridge-state').className = 'good';
    el('bridge-version').textContent = `Bridge ${data.bridge.version}`;
    renderRuntime(data.openclaw);
    const presentation = errorPresentation(data.openclaw);
    el('health-message').textContent = presentation.message;
    el('health-message').className = `notice ${data.openclaw.code === 'OPENCLAW_READY' ? 'good' : 'warn'}`;
    el('health-details').hidden = data.openclaw.code === 'OPENCLAW_READY';
    el('health-code').textContent = data.openclaw.code;
    el('last-updated').textContent = `Cập nhật ${time(data.openclaw.checkedAt || Date.now())}`;
  } catch (error) {
    if (currentEpoch !== epoch) return;
    el('bridge-state').textContent = 'Offline'; el('bridge-state').className = 'bad';
    report(el('health-message'), error, 'health');
    el('health-message').className = 'notice warn';
    el('last-updated').textContent = 'Chưa cập nhật · dữ liệu có thể đã cũ';
    updateButtons();
  } finally { el('refresh').disabled = false; }
}, { isHidden: () => document.hidden });
const refresh = () => healthPoller.refreshAfterCurrent();
el('refresh').addEventListener('click', () => { void refresh(); });
for (const button of runtimeButtons) button.addEventListener('click', async () => {
  if (activeAction || button.disabled) return;
  activeAction = button.dataset.runtime; epoch++; updateButtons();
  const action = activeAction; const started = Date.now();
  el('runtime-details').hidden = true; el('runtime-status').className = 'action-status loading';
  const progress = () => { el('runtime-status').textContent = `Đang ${action} OpenClaw… ${Math.floor((Date.now() - started) / 1000)} giây · tối đa 90 giây, sau đó kiểm tra trạng thái.`; };
  progress(); const timer = setInterval(progress, 1000);
  try {
    const data = await api(`/api/openclaw/${action}`, {}, 100000);
    remoteOperation = null; renderRuntime({ ...data.status, operation: null });
    el('runtime-status').textContent = data.changed === false ? data.confirmed ? 'Trạng thái đã đúng, không cần thay đổi.' : 'OpenClaw đang chạy nhưng Gateway chưa kết nối được. Hãy kiểm tra cổng và xác thực Gateway.' : data.confirmed ? `Đã ${action} OpenClaw và xác nhận trạng thái Gateway.` : 'Đã gửi lệnh nhưng Gateway chưa sẵn sàng. Trạng thái sẽ tiếp tục tự cập nhật.';
    if (!data.confirmed) { el('runtime-details').hidden = false; el('runtime-code').textContent = data.status.code; }
  } catch (error) { report(el('runtime-status'), error, 'runtime'); }
  finally {
    clearInterval(timer); el('runtime-status').className = 'action-status'; activeAction = null; remoteOperation = null; epoch++;
    updateButtons(); await refresh();
  }
});
const logPoller = createPoller(async () => {
  const lines = Number(el('log-lines').value);
  if (!Number.isInteger(lines) || lines < 1 || lines > 500) { el('log-status').textContent = 'Chọn số dòng từ 1 đến 500.'; return; }
  el('logs').disabled = true; el('log-output').setAttribute('aria-busy', 'true');
  el('log-status').textContent = 'Đang đọc logs…'; el('log-details').hidden = true;
  try {
    const data = await api(`/api/openclaw/logs?lines=${lines}`, undefined, 35000);
    const scroll = el('log-output').scrollTop;
    el('log-output').textContent = data.lines.join('\n') || 'Chưa có log.';
    el('log-output').scrollTop = el('log-autoscroll').checked ? el('log-output').scrollHeight : scroll;
    el('log-source').textContent = data.source === 'openclaw' ? 'OpenClaw' : 'Bridge';
    el('log-updated').textContent = `Cập nhật ${time(data.updatedAt || Date.now())}`;
    el('log-status').textContent = `${data.lines.length} dòng · giới hạn ${lines} dòng.`;
    if (data.code) { report(el('log-status'), { code: data.code, message: data.message }, 'log'); el('log-status').textContent += ' Nguồn hiện tại: Bridge.'; }
  } catch (error) { report(el('log-status'), error, 'log'); }
  finally { el('logs').disabled = false; el('log-output').setAttribute('aria-busy', 'false'); }
}, { isHidden: () => document.hidden });
el('logs').addEventListener('click', () => { void logPoller.refresh(); });
el('log-auto-refresh').addEventListener('change', () => { if (el('log-auto-refresh').checked) void logPoller.start(); else logPoller.stop(); });
el('log-autoscroll').addEventListener('change', () => { if (el('log-autoscroll').checked) el('log-output').scrollTop = el('log-output').scrollHeight; });
el('log-lines').addEventListener('change', () => { if (el('log-auto-refresh').checked) void logPoller.refresh(); });
document.addEventListener('visibilitychange', () => { healthPoller.visibilityChanged(); logPoller.visibilityChanged(); });
window.addEventListener('pagehide', () => { healthPoller.stop(); logPoller.stop(); });
window.addEventListener('pageshow', event => { if (event.persisted) { void healthPoller.start(); if (el('log-auto-refresh').checked) void logPoller.start(); } });
void healthPoller.start();
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
  const data = await api('/api/openclaw/configure', { ...connection(), model: el('model-select').value, restart: el('restart-after').checked }, 240000);
  el('config-status').textContent = `${data.message} ${data.restartRequired ? 'Cần restart/reload Gateway. ' : ''}${data.restartError ? errorPresentation({ code: data.restartError }).message : ''}`;
  await refresh();
}));
el('test').addEventListener('click', () => busy(el('test'), el('chat-result'), async () => {
  const data = await api('/api/omniroute/test', { ...connection(), model: el('model-select').value, prompt: el('chat-prompt').value });
  el('chat-result').textContent = data.result;
}));
