@echo off
cd /d "%~dp0"

if not exist "node_modules\" call npm install
if not exist "dist\" call npm run build

echo Starting QQ-Claude-Proxy...
node dist/index.js
pause
