@echo off
chcp 65001 >nul
title 註冊一鍵啟動協定 (BarmagSqlQC)
echo ========================================================
echo   正在註冊網頁一鍵連線協定 (barmag://)...
echo   (完全靜默背景啟動模式，不會跳出黑色視窗)
echo ========================================================
echo.

set "TARGET_VBS=%~dp0bg_server.vbs"

reg add "HKCU\Software\Classes\barmag" /ve /d "URL:BarmagSqlQC Protocol" /f >nul
reg add "HKCU\Software\Classes\barmag" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\barmag\shell\open\command" /ve /d "wscript.exe \"%TARGET_VBS%\" \"%%1\"" /f >nul

if %errorlevel% equ 0 (
    echo ✅ 註冊成功（純靜默背景模式）！
    echo 👉 以後在網頁點擊「🔌 連線」，系統會在背景悄悄連線，不會跳出任何黑色視窗！
) else (
    echo ❌ 註冊失敗，請檢查權限設定。
)
echo.
pause
