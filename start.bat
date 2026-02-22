@echo off
cd /d "%~dp0"

echo.
echo ========================================
echo   QQ-Claude-Proxy Launcher
echo ========================================
echo.

if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    call npm install
)

if not exist "dist\" (
    echo [INFO] Building project...
    call npm run build
)

echo [INFO] Starting service...
echo.

:restart
node dist/index.js

if errorlevel 1 (
    if errorlevel 42 (
        echo [INFO] Restarting...
        goto restart
    )
    echo.
    echo [ERROR] Service exited with error
    pause
)
