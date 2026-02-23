@echo off
REM Windows Startup Installation Script
REM This script installs the application as a Windows startup service

setlocal enabledelayedexpansion

REM Color settings
color 0A

echo.
echo ============================================
echo    QQ-Claude-Proxy Startup Installer
echo ============================================
echo.

REM Get current directory
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."
cd /d "%PROJECT_DIR%"
set "PROJECT_DIR=%CD%"

echo [INFO] Project Directory: %PROJECT_DIR%
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script requires administrator privileges.
    echo [INFO] Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Check Node.js installation
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    pause
    exit /b 1
)

REM Check npm installation
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed or not in PATH
    pause
    exit /b 1
)

REM Build project if needed
if not exist "%PROJECT_DIR%\dist\index.js" (
    echo [INFO] Building project...
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Build failed
        pause
        exit /b 1
    )
)

REM Install dependencies
echo [INFO] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

REM Create data directory
if not exist "%PROJECT_DIR%\data" mkdir "%PROJECT_DIR%\data"
if not exist "%PROJECT_DIR%\logs" mkdir "%PROJECT_DIR%\logs"

REM Menu
:MENU
echo.
echo Please select startup method:
echo.
echo 1. Task Scheduler (Recommended)
echo 2. Registry Run Key
echo 3. Startup Folder
echo 4. Uninstall
echo 5. Exit
echo.
set /p CHOICE="Enter your choice (1-5): "

if "%CHOICE%"=="1" goto SCHEDULER
if "%CHOICE%"=="2" goto REGISTRY
if "%CHOICE%"=="3" goto STARTUP_FOLDER
if "%CHOICE%"=="4" goto UNINSTALL
if "%CHOICE%"=="5" goto END
goto MENU

:SCHEDULER
echo.
echo [INFO] Installing Task Scheduler job...
set "TASK_NAME=QQ-Claude-Proxy"
set "NODE_PATH=node"
set "WATCHDOG_SCRIPT=%PROJECT_DIR%\scripts\watchdog.ts"
set "NPM_RUN_WATCHDOG=cd /d "%PROJECT_DIR%" && npm run watchdog start"

REM Delete existing task
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

REM Create new task
schtasks /Create /TN "%TASK_NAME%" /TR "cmd /c %NPM_RUN_WATCHDOG%" /SC ONLOGON /RL HIGHEST /F
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create Task Scheduler job
    pause
    goto MENU
)

echo [SUCCESS] Task Scheduler job created successfully
echo.
echo To manually start/stop:
echo   Start:  schtasks /Run /TN "%TASK_NAME%"
echo   Stop:   taskkill /F /IM node.exe /FI "WINDOWTITLE eq npm*"
echo.
pause
goto MENU

:REGISTRY
echo.
echo [WARNING] Registry Run Key method requires the app to run in current user context
echo.
set /p CONFIRM="Continue? (Y/N): "
if /i not "%CONFIRM%"=="Y" goto MENU

echo [INFO] Adding to Registry Run key...

REM Get the startup script path
set "STARTUP_BAT=%PROJECT_DIR%\start.bat"

REM Add to registry
reg add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "QQ-Claude-Proxy" /t REG_SZ /d "\"%STARTUP_BAT%\"" /f
if %errorlevel% neq 0 (
    echo [ERROR] Failed to add registry key
    pause
    goto MENU
)

echo [SUCCESS] Registry key added successfully
echo.
echo To uninstall:
echo   reg delete "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "QQ-Claude-Proxy" /f
echo.
pause
goto MENU

:STARTUP_FOLDER
echo.
echo [INFO] Creating shortcut in Startup folder...

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\QQ-Claude-Proxy.lnk"
set "TARGET_BAT=%PROJECT_DIR%\start.bat"

REM Create a temporary VBScript to create the shortcut
set "VBS_SCRIPT=%TEMP%\create_shortcut.vbs"

echo Set WshShell = WScript.CreateObject("WScript.Shell") > "%VBS_SCRIPT%"
echo Set Shortcut = WshShell.CreateShortcut("%SHORTCUT_PATH%") >> "%VBS_SCRIPT%"
echo Shortcut.TargetPath = "%TARGET_BAT%" >> "%VBS_SCRIPT%"
echo Shortcut.WorkingDirectory = "%PROJECT_DIR%" >> "%VBS_SCRIPT%"
echo Shortcut.Description = "QQ-Claude-Proxy Bot" >> "%VBS_SCRIPT%"
echo Shortcut.Save >> "%VBS_SCRIPT%"

cscript //nologo "%VBS_SCRIPT%"
del "%VBS_SCRIPT%"

if exist "%SHORTCUT_PATH%" (
    echo [SUCCESS] Shortcut created in Startup folder
    echo.
    echo To uninstall:
    echo   del "%SHORTCUT_PATH%"
    echo.
) else (
    echo [ERROR] Failed to create shortcut
)

pause
goto MENU

:UNINSTALL
echo.
echo Please select what to uninstall:
echo.
echo 1. Task Scheduler Job
echo 2. Registry Run Key
echo 3. Startup Folder Shortcut
echo 4. All
echo 5. Back to menu
echo.
set /p UNINSTALL_CHOICE="Enter your choice (1-5): "

if "%UNINSTALL_CHOICE%"=="1" (
    schtasks /Delete /TN "QQ-Claude-Proxy" /F
    echo [SUCCESS] Task Scheduler job deleted
    echo.
    pause
    goto UNINSTALL
)

if "%UNINSTALL_CHOICE%"=="2" (
    reg delete "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "QQ-Claude-Proxy" /f
    echo [SUCCESS] Registry key deleted
    echo.
    pause
    goto UNINSTALL
)

if "%UNINSTALL_CHOICE%"=="3" (
    del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\QQ-Claude-Proxy.lnk" 2>nul
    echo [SUCCESS] Startup folder shortcut deleted
    echo.
    pause
    goto UNINSTALL
)

if "%UNINSTALL_CHOICE%"=="4" (
    schtasks /Delete /TN "QQ-Claude-Proxy" /F
    reg delete "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "QQ-Claude-Proxy" /f
    del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\QQ-Claude-Proxy.lnk" 2>nul
    echo [SUCCESS] All startup methods uninstalled
    echo.
    pause
    goto UNINSTALL
)

if "%UNINSTALL_CHOICE%"=="5" goto MENU

:END
echo.
echo Goodbye!
exit /b 0
