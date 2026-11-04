# OpenClaw × OmniRoute Bridge

<p align="center">
  <strong>Kết nối AI API và tự động hóa trên máy cá nhân — đơn giản hơn, minh bạch hơn.</strong>
</p>

<p align="center">
  <a href="https://github.com/nguyenngohuythinh/OpenClaw-OmniRoute-Bridge">GitHub Repository</a> ·
  <a href="https://github.com/nguyenngohuythinh/openclaw">OpenClaw</a> ·
  <a href="https://github.com/nguyenngohuythinh/OmniRoute">OmniRoute</a>
</p>

**OpenClaw OmniRoute Bridge** là công cụ giao diện web chạy local, giúp cấu hình [OpenClaw](https://github.com/nguyenngohuythinh/openclaw) sử dụng các model được cung cấp thông qua [OmniRoute](https://github.com/nguyenngohuythinh/OmniRoute).

Dự án hướng đến một mục tiêu: xây dựng bộ công cụ AI cá nhân có thể tiếp cận, dễ cài đặt và dễ mở rộng, ưu tiên phần mềm mã nguồn mở cùng các lựa chọn API miễn phí hoặc chi phí thấp.

> **Lưu ý về chi phí:** OpenClaw, OmniRoute và Bridge là các phần mềm có thể tự triển khai. Điều đó không đồng nghĩa mọi model/API đều miễn phí. Chi phí sử dụng phụ thuộc nhà cung cấp, model, hạn mức miễn phí và lượng token phát sinh. Hãy kiểm tra chính sách và giá của nhà cung cấp trước khi sử dụng.

---

## ✨ Vì sao dự án này tồn tại?

Việc kết nối một agent AI với nhiều model thường yêu cầu chỉnh sửa cấu hình, endpoint và thông tin xác thực thủ công. Bridge gom các bước thiết lập thường gặp vào một giao diện tiếng Việt dễ sử dụng.

Dự án là lớp kết nối cấu hình, không phải một model AI mới và cũng không thay thế OpenClaw hoặc OmniRoute.

## 🧩 Hệ sinh thái

| Thành phần | Vai trò |
| --- | --- |
| [OpenClaw](https://github.com/nguyenngohuythinh/openclaw) | Agent AI thực hiện hội thoại, sử dụng công cụ và tự động hóa tác vụ |
| [OmniRoute](https://github.com/nguyenngohuythinh/OmniRoute) | Lớp định tuyến/gateway để OpenClaw truy cập các model thông qua API tương thích |
| **OpenClaw OmniRoute Bridge** | Giao diện local hỗ trợ kiểm tra kết nối, xem model và áp dụng cấu hình |

Luồng hoạt động tổng quát:

```text
Người dùng
   │
   ▼
OpenClaw (AI Agent)
   │
   ▼
OmniRoute (API Gateway / Router)
   │
   ├── Model / Provider A
   ├── Model / Provider B
   └── Model / Provider khác
```

Bridge hỗ trợ thiết lập kết nối và cấu hình; các yêu cầu AI khi vận hành đi theo luồng OpenClaw → OmniRoute → nhà cung cấp model.

## 🚀 Tính năng

- **Giao diện tiếng Việt:** thao tác cấu hình trực quan.
- **Kiểm tra kết nối OmniRoute:** xác thực endpoint và API key.
- **Khám phá model:** lấy danh sách model khả dụng từ OmniRoute.
- **Chọn model:** lựa chọn model muốn sử dụng trong OpenClaw.
- **Áp dụng cấu hình:** hỗ trợ cập nhật provider/model cho OpenClaw.
- **Sao lưu cấu hình:** tạo bản sao lưu trước khi thay đổi để thuận tiện khôi phục.
- **Hạn chế lộ thông tin nhạy cảm:** che API key trên giao diện và tránh ghi key vào log theo thiết kế hiện tại.

## 🖥️ Yêu cầu hệ thống

- Windows 10/11 (mục tiêu hỗ trợ chính).
- Node.js 18 trở lên.
- npm.
- Git (nếu cài đặt bằng cách clone repository).
- OpenClaw đã được cài đặt.
- OmniRoute đang chạy và có ít nhất một provider/model được cấu hình.

Mặc định OmniRoute thường được truy cập tại `http://127.0.0.1:20128`. Hãy dùng đúng địa chỉ và API key theo cấu hình thực tế của bạn.

## 📦 Cài đặt

Mở PowerShell hoặc Terminal:

```powershell
git clone https://github.com/nguyenngohuythinh/OpenClaw-OmniRoute-Bridge.git
cd OpenClaw-OmniRoute-Bridge
npm install
npm start
```

Sau khi ứng dụng khởi động, mở:

**http://localhost:3000**

### Nếu PowerShell báo lỗi npm.ps1

Một số máy Windows chặn script PowerShell theo Execution Policy. Có thể gọi trực tiếp file CMD của npm:

```powershell
npm.cmd install
npm.cmd start
```

Cách này không cần thay đổi Execution Policy của hệ thống.

## ⚙️ Cấu hình và sử dụng

1. Khởi động OmniRoute và bảo đảm provider/model mong muốn đã sẵn sàng.
2. Khởi động Bridge theo hướng dẫn cài đặt.
3. Mở `http://localhost:3000`.
4. Nhập Base URL của OmniRoute (mặc định: `http://127.0.0.1:20128`, tùy giao diện có thể yêu cầu endpoint API).
5. Nhập API key của OmniRoute.
6. Chọn chức năng kiểm tra kết nối và tải danh sách model.
7. Chọn model phù hợp rồi áp dụng cấu hình OpenClaw.
8. Kiểm tra lại model/provider trong OpenClaw và thử một yêu cầu đơn giản.

**Phân biệt hai loại khóa:**

- **OmniRoute API key:** dùng để OpenClaw/Bridge xác thực khi gọi API qua OmniRoute.
- **OpenClaw Gateway token:** dùng để xác thực Dashboard với Gateway; không phải API key của model.

Tên trường và định dạng cấu hình có thể thay đổi theo phiên bản OpenClaw, OmniRoute và Bridge. Nếu gặp lỗi, hãy kiểm tra log ứng dụng và cấu hình hiện tại trước khi thử ghi đè.

## 🔐 Bảo mật và quyền riêng tư

- Chỉ chạy giao diện trên máy tin cậy; không công khai cổng local ra Internet nếu chưa có lớp bảo vệ phù hợp.
- Không chia sẻ API key, Gateway token hoặc file cấu hình có chứa thông tin xác thực.
- Không commit `.env`, token, mật khẩu hoặc dữ liệu cá nhân lên Git.
- Giữ lại bản sao lưu trước khi thay đổi cấu hình.
- Thu hồi và tạo lại key nếu nghi ngờ key đã bị lộ.
- Kiểm tra nội dung mã nguồn và quyền truy cập trước khi chạy trên máy quan trọng.

## 🗺️ Định hướng phát triển

Dự án hướng đến trở thành một **bảng điều khiển cài đặt và quản lý kết nối AI local-first** cho người dùng OpenClaw và OmniRoute.

Các hướng phát triển dự kiến (không phải tính năng đã hoàn thành):

### Giai đoạn 1 — Kết nối ổn định
- Hoàn thiện quy trình kiểm tra endpoint, API key và model.
- Cải thiện xử lý lỗi, thông báo và hướng dẫn khắc phục.
- Tăng độ an toàn khi đọc/ghi cấu hình và khôi phục backup.

### Giai đoạn 2 — Quản lý model thông minh
- Hiển thị thông tin model và provider rõ ràng hơn.
- Hỗ trợ chọn model mặc định và cấu hình model dự phòng nếu các nền tảng hỗ trợ.
- Hỗ trợ kiểm tra tình trạng kết nối và phản hồi API.

### Giai đoạn 3 — Tối ưu chi phí
- Hỗ trợ người dùng nhận biết lựa chọn model miễn phí, có hạn mức miễn phí hoặc chi phí thấp.
- Bổ sung thông tin sử dụng/chi phí khi API cung cấp dữ liệu tương ứng.
- Gợi ý model theo nhu cầu: tốc độ, chất lượng, tác vụ agent và ngân sách.

### Giai đoạn 4 — Trung tâm tự động hóa cá nhân
- Hướng dẫn tích hợp các công cụ và workflow của OpenClaw.
- Hỗ trợ cấu hình các tác vụ tự động hóa phổ biến.
- Xây dựng tài liệu thực hành để người mới có thể tự triển khai hệ sinh thái AI của mình.

Lộ trình có thể thay đổi theo phản hồi cộng đồng, khả năng tương thích và giới hạn của các dự án nền tảng.

## 🧑‍💻 Công nghệ

Theo cấu trúc hiện tại của dự án:

- **Runtime:** Node.js
- **Backend:** Express, TypeScript
- **Frontend:** EJS, CSS
- **Tích hợp:** OmniRoute API và file cấu hình OpenClaw

## 🤝 Đóng góp

Mọi góp ý, báo lỗi và đề xuất tính năng đều được hoan nghênh.

- Báo lỗi / đề xuất: [GitHub Issues](https://github.com/nguyenngohuythinh/OpenClaw-OmniRoute-Bridge/issues)
- Mã nguồn: [OpenClaw-OmniRoute-Bridge](https://github.com/nguyenngohuythinh/OpenClaw-OmniRoute-Bridge)

Khi gửi issue, vui lòng cung cấp hệ điều hành, phiên bản Node.js, phiên bản OpenClaw/OmniRoute, bước tái hiện và thông báo lỗi đã loại bỏ API key/token.

## 📄 Giấy phép

Dự án sử dụng **ISC License**. Xem file [LICENSE](./LICENSE) để biết điều khoản.

---

<p align="center">
  <strong>Open source tools. Flexible AI models. Practical automation.</strong><br/>
  Xây dựng hệ sinh thái AI cá nhân dễ tiếp cận — bắt đầu từ những công cụ mở.
</p>
