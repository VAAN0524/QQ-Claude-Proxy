@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo   QQ-Claude-Proxy Diagnostic Tool
echo ========================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo [1] Checking Node.js...
node --version 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found
    pause
    exit /b 1
)
echo [OK] Node.js is installed
echo.

echo [2] Checking dependencies...
if not exist "node_modules\" (
    echo [WARN] node_modules not found, run npm install
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.

echo [3] Checking build...
if not exist "dist\index.js" (
    echo [WARN] Build not found, building now...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Build failed
        pause
        exit /b 1
    )
)
echo [OK] Build exists
echo.

echo [4] Checking port 18789...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":18789 " ^| findstr "LISTENING" 2^>nul') do (
    echo [WARN] Port 18789 is in use by PID %%a
    choice /C YN /M "Kill process and continue"
    if errorlevel 2 (
        echo [INFO] Cancelled by user
        pause
        exit /b 1
    )
    taskkill /F /PID %%a >nul 2>&1
    timeout /t 2 /nobreak >nul
)
echo [OK] Port 18789 is available
echo.

echo [5] Checking .env file...
if not exist ".env" (
    echo [WARN] .env file not found
    choice /C YN /M "Continue anyway"
    if errorlevel 2 (
        pause
        exit /b 1
    )
)
echo [OK] Configuration check passed
echo.

echo ========================================
echo   All checks passed! Starting...
echo ========================================
pause
start "" cmd /k "cd /d "%SCRIPT_DIR%" && node dist/index.js"
