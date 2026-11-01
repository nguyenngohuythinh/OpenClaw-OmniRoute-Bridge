# OpenClaw OmniRoute Bridge

Công cụ hỗ trợ kết nối [OpenClaw](https://github.com/nguyenngohuythinh/openclaw) với [OmniRoute](https://github.com/nguyenngohuythinh/OmniRoute) một cách dễ dàng trên Windows.

## 🌟 Tính năng
- **Giao diện Tiếng Việt:** Dễ dàng thao tác và cấu hình.
- **Kết nối OmniRoute:** Kiểm tra URL và API Key trực quan.
- **Quản lý Model:** Tự động lấy danh sách model thực tế từ OmniRoute.
- **Cấu hình OpenClaw:** Tự động cập nhật provider và tạo bản sao lưu an toàn.
- **Bảo mật:** Không lưu API key vào log, hỗ trợ che API key trên giao diện.

## 🏗️ Kiến trúc
Dự án được xây dựng trên:
- **Backend:** Node.js, Express, TypeScript.
- **Frontend:** EJS, CSS thuần.
- **Dịch vụ:** Tích hợp trực tiếp API OmniRoute và hệ thống file của OpenClaw.

## 📋 Yêu cầu hệ thống
- **Node.js:** v18 trở lên.
- **Git:** Đã cài đặt trên Windows.
- **OmniRoute:** Đang chạy (mặc định tại `http://127.0.0.1:20128`).

## 🚀 Hướng dẫn cài đặt
1. Tải dự án về máy:
   ```bash
   git clone https://github.com/nguyenngohuythinh/OpenClaw-OmniRoute-Bridge.git
   cd OpenClaw-OmniRoute-Bridge
   ```
2. Cài đặt thư viện:
   ```bash
   npm install
   ```
3. Khởi động ứng dụng:
   ```bash
   npm start
   ```
4. Mở trình duyệt truy cập: `http://localhost:3000`

## 🛠️ Cách sử dụng
1. **Nhập thông tin:** Điền Base URL và API Key của OmniRoute.
2. **Kiểm tra:** Nhấn "Kiểm tra kết nối" để xác thực và tải danh sách model.
3. **Chọn Model:** Chọn model bạn muốn sử dụng từ danh sách xổ xuống.
4. **Áp dụng:** Nhấn "Cấu hình OpenClaw". Hệ thống sẽ tự động tạo bản sao lưu cấu hình cũ và cập nhật thông tin mới.

## 🔐 Bảo mật
- API Key chỉ được sử dụng để gọi API OmniRoute từ server local.
- Không commit file `.env` chứa thông tin nhạy cảm.
- Luôn tạo bản sao lưu `.bak` trước khi sửa file cấu hình.

## 🤝 Đóng góp
Nếu bạn gặp lỗi hoặc có ý tưởng mới, vui lòng mở [Issue](https://github.com/nguyenngohuythinh/OpenClaw-OmniRoute-Bridge/issues).

## 📄 Giấy phép
ISC License.
