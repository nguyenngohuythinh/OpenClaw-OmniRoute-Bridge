Write-Host "--- Cài đặt OpenClaw OmniRoute Bridge ---" -ForegroundColor Cyan

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Lỗi: Chưa tìm thấy Node.js. Vui lòng cài đặt tại https://nodejs.org/" -ForegroundColor Red
    exit
}

Write-Host "Đang cài đặt dependencies..."
& "C:\Program Files\nodejs\npm.cmd" install

Write-Host "Cài đặt hoàn tất!" -ForegroundColor Green
Write-Host "Chạy 'scripts/start.ps1' để bắt đầu."
