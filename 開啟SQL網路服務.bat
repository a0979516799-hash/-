@echo off
title 啟用 SQL Server 網路連線服務
echo ========================================================
echo   正在啟用 SQL Server 瀏覽器服務 (以支援 Node.js 連線)...
echo ========================================================
echo.

echo 正在設定 SQLBrowser 為自動啟動...
sc config SQLBrowser start= auto
echo 正在啟動 SQLBrowser 服務...
net start SQLBrowser

echo.
echo ========================================================
echo 執行完畢！若出現「存取遭拒」，請對此檔案點右鍵「以系統管理員身分執行」。
echo.
pause
