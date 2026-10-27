@echo off
cd /d "%~dp0"
title Spinning Oil and Sand Inventory System
start http://localhost:3000
echo Starting server on http://localhost:3000 ...
node server/index.js
pause
