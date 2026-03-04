@echo off
echo ========================================
echo 重启 QQ-Claude-Proxy 服务
echo ========================================
echo.

echo [1/3] 停止当前服务...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo [2/3] 等待端口释放...
timeout /t 3 /nobreak >nul

echo [3/3] 启动服务...
start "QQ-Claude-Proxy" cmd /k "npm run dev"

echo.
echo ========================================
echo 服务重启完成！
echo ========================================
pause
