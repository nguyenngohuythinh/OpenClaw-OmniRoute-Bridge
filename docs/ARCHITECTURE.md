# OpenClaw OmniRoute Bridge

Công cụ kết nối OpenClaw với OmniRoute.

## Kiến trúc
Ứng dụng gồm:
- **Core**: Quản lý cấu hình OpenClaw và OmniRoute.
- **Services**: Tích hợp API OmniRoute và CLI OpenClaw.
- **UI**: Giao diện web local.

## Luồng dữ liệu
Người dùng nhập thông tin OmniRoute -> Xác thực & lấy model -> Người dùng chọn model -> Ứng dụng cấu hình OpenClaw -> Hướng dẫn sử dụng.
