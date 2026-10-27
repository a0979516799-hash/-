@echo off
chcp 65001 >nul
title SQL Server 連線一鍵自動修復與診斷工具
echo ========================================================
echo   正在為您一鍵檢查與修復 SQL Server 連線設定...
echo ========================================================
echo.

:: 1. 檢查系統管理員權限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [提示] 正在為您以系統管理員權限重新執行...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [1/4] 正在檢查 SQL Server 服務狀態...
powershell -Command "Get-Service *SQL* | Format-Table -AutoSize Name, Status, StartType"

echo.
echo [2/4] 正在設定 SQL Server Browser (SQL 瀏覽器) 為自動啟動並啟動...
sc config SQLBrowser start= auto >nul 2>&1
net start SQLBrowser >nul 2>&1

echo.
echo [3/4] 正在重新啟動 SQL Server (SQLEXPRESS) 服務以套用設定...
net stop MSSQL$SQLEXPRESS >nul 2>&1
net start MSSQL$SQLEXPRESS >nul 2>&1

echo.
echo [4/4] 正在檢查 Port 1433 是否成功啟動...
powershell -Command "
$c = Get-NetTCPConnection -LocalPort 1433 -ErrorAction SilentlyContinue
if ($c) {
    Write-Host '🎉🎉🎉 【太棒了！】Port 1433 已經成功啟動並開始監聽！' -ForegroundColor Green
} else {
    Write-Host '⚠️ Port 1433 仍未監聽，請檢查「通訊協定」分頁中的「已啟用」是否選取為【是】。' -ForegroundColor Yellow
}
"

echo.
echo ========================================================
echo 正在自動執行連線測試...
echo ========================================================
node "%~dp0server\test_mssql.js"

echo.
echo ========================================================
echo 修復檢測完成！
echo ========================================================
pause
