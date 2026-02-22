@echo off
REM ========================================
REM CLI Diagnostics Script
REM ========================================

setlocal enabledelayedexpansion

echo.
echo ========================================
echo   CLI Environment Diagnostics
echo ========================================
echo.

echo [1] Current Environment Variables:
echo ----------------------------------------
for /f "tokens=1,2 delims==" %%a in ('set') do (
    set "var=%%a"
    set "val=%%b"
    echo !var! | findstr /i "CLAUDE ANTHROPIC" >nul
    if not errorlevel 1 (
        echo   [FOUND] !var!=!val!
    )
)
echo.

echo [2] Testing CLI in current environment:
echo ----------------------------------------
echo Testing: claude --version
claude --version 2>&1
echo.
echo Error Level: %ERRORLEVEL%
echo.

echo [3] Testing CLI with --print mode:
echo ----------------------------------------
(echo你好) | claude --print --no-chrome --output-format stream-json --verbose 2>&1 | findstr /C:"{\"type\"" /C:"error" /C:"Error" /C:"CLI"
echo.
echo Error Level: %ERRORLEVEL%
echo.

echo [4] Testing with cleaned environment:
echo ----------------------------------------
set "CLEANED_ENV="
for /f "tokens=1 delims==" %%a in ('set') do (
    echo %%a | findstr /i "CLAUDE ANTHROPIC" >nul
    if errorlevel 1 (
        set "CLEANED_ENV=!CLEANED_ENV! %%a"
    )
)
echo (Environment check complete)
echo.

echo ========================================
echo   Diagnostics Complete
echo ========================================
echo.
echo Please share the output above for analysis.
pause
