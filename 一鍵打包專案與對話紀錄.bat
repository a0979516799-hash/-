@echo off
cd /d "%~dp0"
title Package Project and Chat History
echo Starting Project and Chat Packaging...
node server/package_project.js
echo.
pause
