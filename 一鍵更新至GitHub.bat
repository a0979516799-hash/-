@echo off
cd /d "%~dp0"
title Sync to GitHub and Netlify

set "GIT="
where git >nul 2>nul
if %errorlevel% equ 0 set "GIT=git"

if not defined GIT if exist "C:\Program Files\Git\cmd\git.exe" set "GIT=C:\Program Files\Git\cmd\git.exe"
if not defined GIT if exist "C:\Program Files\Git\bin\git.exe" set "GIT=C:\Program Files\Git\bin\git.exe"
if not defined GIT if exist "C:\Program Files (x86)\Git\cmd\git.exe" set "GIT=C:\Program Files (x86)\Git\cmd\git.exe"
if not defined GIT if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" set "GIT=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"

if not defined GIT (
    echo ========================================================
    echo   [ERROR] Git is NOT installed on this computer!
    echo ========================================================
    echo.
    echo   1. If your Netlify is deployed by Drag-and-Drop:
    echo      Please double-click "一鍵Netlify發布.bat"
    echo      and drag the "public" folder to Netlify Drop!
    echo.
    echo   2. If you need to sync to GitHub:
    echo      Please install Git for Windows from:
    echo      https://git-scm.com/download/win
    echo      After installation, run this tool again.
    echo ========================================================
    echo.
    pause
    exit /b 1
)

echo ========================================================
echo   Syncing project to GitHub and Netlify...
echo   Using Git: %GIT%
echo ========================================================
echo.

echo [1/3] git add .
"%GIT%" add .

echo [2/3] git commit ...
"%GIT%" commit -m "fix: optimize sand and oil cards display"

echo [3/3] git push ...
"%GIT%" push

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   [SUCCESS] Successfully pushed to GitHub!
    echo   Netlify will automatically update in 1-2 minutes.
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo   [NOTICE] Git push finished or encountered an issue.
    echo   Please check the messages above.
    echo ========================================================
)

echo.
pause
