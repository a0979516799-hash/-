@echo off
chcp 65001 >nul
title 啟動 Microsoft SQL Server 服務
echo ========================================================
echo   正在啟動 Microsoft SQL Server (SQLEXPRESS)...
echo ========================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [提示] 正在請求系統管理員權限以啟動服務...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [1/3] 正在啟動 SQL Server (SQLEXPRESS) 核心服務...
net start MSSQL$SQLEXPRESS

echo.
echo [2/3] 正在啟動 SQL Server 瀏覽器服務 (SQLBrowser)...
sc config SQLBrowser start= auto >nul 2>&1
net start SQLBrowser

echo.
echo [3/3] 正在測試 MS SQL Server 連線...
node "%~dp0server\test_mssql.js"

echo.
echo ========================================================
pause
