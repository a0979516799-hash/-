@echo off
chcp 65001 >nul
title 重啟背景系統服務 (BarmagSqlQC)
echo 正在結束舊的背景伺服器 (node.exe)...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul
echo 正在重新啟動最新版背景伺服器...
wscript.exe "%~dp0bg_server.vbs"
timeout /t 2 /nobreak >nul
echo ✅ 已重新啟動完成！請回瀏覽器按 Ctrl + F5 重新整理。
pause
