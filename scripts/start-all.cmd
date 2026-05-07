@echo off
cd /d %~dp0\..
start "API Server" powershell -NoExit -Command "npm run dev:api"
timeout /t 2 >nul
powershell -NoExit -Command "npm run dev:web"
