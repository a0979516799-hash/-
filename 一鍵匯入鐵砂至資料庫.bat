@echo off
cd /d "%~dp0"
title Import Iron Sand CSV to Database
echo Starting Iron Sand CSV Import...
node server/import_sand_csv.js
echo.
pause
