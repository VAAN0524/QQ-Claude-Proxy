@echo off
REM ========================================
REM Quick Launcher - Start + Open Dashboard
REM Auto-kills old ports first
REM ========================================

chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Function to kill process by port
:killPort
if "%~1"=="" goto :eof
netstat -ano | findstr ":%~1 " >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%~1 " ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
)
goto :eof

REM Kill old ports
echo [INFO] Cleaning up old ports...
call :killPort 18789
call :killPort 8080
timeout /t 2 /nobreak >nul

REM Start the service in background
start /min "" cmd /c "cd /d "%SCRIPT_DIR%" && start.bat"

REM Wait for service to start
timeout /t 3 /nobreak >nul

REM Open Dashboard in browser
start http://localhost:8080

echo [INFO] Dashboard opened in browser.
echo [INFO] Service running in background.
echo.
pause
