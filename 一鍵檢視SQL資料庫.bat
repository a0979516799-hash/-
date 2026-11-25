@echo off
chcp 65001 >nul
title 檢視 MS SQL Server 資料庫內容 (BarmagSqlQC)
echo ========================================================
echo   正在連線並查詢 MS SQL Server (BarmagSqlQC)...
echo ========================================================
echo.
node server/inspect_db.js
echo.
echo ========================================================
pause
