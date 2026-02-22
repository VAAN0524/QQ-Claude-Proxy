@echo off
REM ========================================
REM Create Desktop Shortcut
REM ========================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "SHORTCUT_NAME=QQ-Claude-Proxy.lnk"
set "DESKTOP=%USERPROFILE%\Desktop"
set "TARGET=%SCRIPT_DIR%start-dashboard.bat"

REM Use PowerShell to create shortcut
powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%DESKTOP%\%SHORTCUT_NAME%');$s.TargetPath='%TARGET%';$s.WorkingDirectory='%SCRIPT_DIR%';$s.Description='QQ-Claude-Proxy - Remote Control for Claude Code';$s.Save()"

echo.
echo [SUCCESS] Desktop shortcut created: %DESKTOP%\%SHORTCUT_NAME%
echo.
echo Usage:
echo   - Double-click the shortcut to start
echo   - Service will auto-start and open Dashboard
echo.
pause
