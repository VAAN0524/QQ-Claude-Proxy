@echo off
REM Set console code page to UTF-8
chcp 65001 >nul 2>&1

REM Start the service
npm run dev
