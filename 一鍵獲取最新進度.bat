@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 下載 GitHub 最新專案進度

set "GIT="
where git >nul 2>nul
if %errorlevel% equ 0 set "GIT=git"

if not defined GIT if exist "C:\Program Files\Git\cmd\git.exe" set "GIT=C:\Program Files\Git\cmd\git.exe"
if not defined GIT if exist "C:\Program Files\Git\bin\git.exe" set "GIT=C:\Program Files\Git\bin\git.exe"
if not defined GIT if exist "C:\Program Files (x86)\Git\cmd\git.exe" set "GIT=C:\Program Files (x86)\Git\cmd\git.exe"
if not defined GIT if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" set "GIT=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"

if not defined GIT (
    echo ========================================================
    echo   [錯誤] 這台電腦尚未安裝 Git！
    echo ========================================================
    echo   請先安裝 Git for Windows:
    echo   https://git-scm.com/download/win
    echo ========================================================
    echo.
    pause
    exit /b 1
)

echo ========================================================
echo   📥 正在從 GitHub 下載組員與雲端的最新進度...
echo ========================================================
echo.

"%GIT%" pull

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   🎉【成功】您的專案已更新為最新版本！
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo   ⚠️【提醒】同步可能遇到衝突或網路中斷，請檢查上方訊息。
    echo ========================================================
)

echo.
pause
