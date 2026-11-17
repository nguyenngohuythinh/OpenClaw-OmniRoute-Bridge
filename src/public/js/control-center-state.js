// Shared by the dashboard and Node regression tests; no DOM/global timer work on import.
export function createPoller(task, { isHidden = () => false, activeMs = 7000, inactiveMs = 45000,
  setTimer = setTimeout, clearTimer = clearTimeout, onError = () => {} } = {}) {
  let timer; let pending; let started = false;
  const cancel = () => { if (timer !== undefined) clearTimer(timer); timer = undefined; };
  const schedule = () => {
    cancel();
    if (started) timer = setTimer(() => { timer = undefined; void refresh(); }, isHidden() ? inactiveMs : activeMs);
  };
  function refresh() {
    if (pending) return pending;
    cancel();
    pending = Promise.resolve().then(task).catch(onError).finally(() => { pending = undefined; schedule(); });
    return pending;
  }
  return {
    refresh,
    async refreshAfterCurrent() { if (pending) await pending; return refresh(); },
    start() { started = true; return refresh(); },
    stop() { started = false; cancel(); },
    visibilityChanged() { if (!started) return; if (isHidden()) schedule(); else { cancel(); void refresh(); } },
  };
}
const messages = {
  OPENCLAW_READY: 'OpenClaw đã sẵn sàng nhận yêu cầu.',
  OPENCLAW_STOPPED: 'OpenClaw đang dừng. Chọn Start để khởi động Gateway.',
  OPENCLAW_NOT_INSTALLED: 'Chưa tìm thấy OpenClaw. Hãy cài đặt hoặc kiểm tra đường dẫn OPENCLAW_COMMAND, rồi làm mới trạng thái.',
  OPENCLAW_GATEWAY_UNREACHABLE: 'OpenClaw đang chạy nhưng chưa kết nối được Gateway. Kiểm tra cổng và xác thực Gateway.',
  OPENCLAW_STATUS_UNKNOWN: 'Chưa xác định được trạng thái OpenClaw. Làm mới trạng thái hoặc kiểm tra Gateway trong terminal.',
  OPENCLAW_BUSY: 'Một thao tác OpenClaw đang được xử lý. Hãy chờ trạng thái cập nhật trước khi thử lại.',
  OPENCLAW_TIMEOUT: 'Thao tác OpenClaw đã hết thời gian chờ. Gateway có thể vẫn đang xử lý; hãy kiểm tra trạng thái trước khi thử lại.',
  OPENCLAW_COMMAND_FAILED: 'Không thể chạy lệnh OpenClaw. Kiểm tra cài đặt, quyền truy cập và cấu hình Gateway.',
  OPENCLAW_RUNTIME_FAILED: 'OpenClaw chưa xác nhận thao tác. Kiểm tra Gateway service và quyền chạy trên Windows.',
  OPENCLAW_SERVICE_NOT_INSTALLED: 'Chưa có Gateway service. Chạy openclaw gateway install trong terminal rồi thử lại.',
  OPENCLAW_PERMISSION_DENIED: 'Không đủ quyền điều khiển OpenClaw. Kiểm tra quyền của tài khoản chạy Gateway service.',
  OPENCLAW_CLI_UNSUPPORTED: 'Phiên bản OpenClaw chưa hỗ trợ lệnh này. Kiểm tra hoặc cập nhật OpenClaw.',
  CONFIG_MISSING: 'Chưa có cấu hình OpenClaw. Chạy openclaw onboard để tạo cấu hình trước.',
  CONFIG_UNAVAILABLE: 'Chưa đọc được cấu hình OpenClaw. Đang hiển thị log thao tác của Bridge.',
  CONFIG_PERMISSION_DENIED: 'Không đọc hoặc ghi được cấu hình OpenClaw. Kiểm tra quyền truy cập file.',
  CONFIG_INVALID: 'Cấu hình OpenClaw không hợp lệ. Kiểm tra bằng openclaw config validate.',
  PORT_IN_USE: 'Cổng Gateway đang bị chiếm. Kiểm tra ứng dụng đang dùng cổng trước khi khởi động lại.',
  CLI_OUTPUT_INVALID: 'Không đọc được kết quả từ OpenClaw. Kiểm tra phiên bản CLI đang sử dụng.',
  CLI_OUTPUT_LIMIT: 'OpenClaw trả quá nhiều dữ liệu. Giảm số dòng log hoặc kiểm tra CLI.',
  NETWORK_ERROR: 'Không kết nối được Bridge. Kiểm tra Bridge còn chạy và thử làm mới.',
  REQUEST_TIMEOUT: 'Bridge chưa phản hồi trong thời gian chờ. Hãy làm mới trạng thái trước khi thử lại.',
};
export function errorPresentation(error) {
  const code = error?.code || 'NETWORK_ERROR';
  return { message: messages[code] || error?.message || 'Không thể hoàn tất yêu cầu. Hãy kiểm tra trạng thái và thử lại.', code };
}
export function runtimeLabel(status) {
  return !status ? 'Đang kiểm tra' : !status.installed ? status.commandExists ? 'Chưa xác nhận' : 'Chưa cài đặt'
    : status.running === true ? 'Running' : status.running === false ? 'Stopped' : 'Chưa xác định';
}
