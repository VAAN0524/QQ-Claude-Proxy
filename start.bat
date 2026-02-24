@echo off
REM Set console code page to UTF-8
chcp 65001 >nul 2>&1

echo ========================================
echo Starting QQ-Claude-Proxy...
echo ========================================
echo.

REM Start the service
call npm run dev

REM If service exits, wait for user to see the error
echo.
echo ========================================
echo Service stopped or exited
echo ========================================
pause
