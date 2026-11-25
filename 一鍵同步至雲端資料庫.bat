@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 一鍵安全同步本機 MS SQL 至雲端資料庫
echo ========================================================
echo   正在執行公私分離安全同步 (僅同步彙總數據，明細不出廠)
echo ========================================================
echo.
node server/sync_to_cloud.js %1
echo.
pause
