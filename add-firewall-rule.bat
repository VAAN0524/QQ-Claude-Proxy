@echo off
REM ========================================
REM Add Firewall Rule for Port 8080
REM ========================================

echo Adding firewall rule for QQ-Claude-Proxy Dashboard...
netsh advfirewall firewall add rule name="QQ-Claude-Proxy Dashboard" dir=in action=allow protocol=TCP localport=8080

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to add firewall rule.
    echo Please run as Administrator.
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Firewall rule added successfully!
echo You can now access the dashboard from other devices.
echo.
echo Dashboard URLs:
echo   - Local:   http://localhost:8080
echo   - Network: http://172.10.28.167:8080
echo.
pause
