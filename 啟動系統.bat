@echo off
cd /d "%~dp0"
title Spinning Oil and Sand Smart Inventory System
echo ========================================================
echo   Starting Smart Inventory System (Port 3000)...
echo ========================================================
echo.
explorer "http://localhost:3000"
node server/index.js
if %errorlevel% neq 0 (
    echo.
    echo Server exited with error code %errorlevel%.
)
echo.
pause
