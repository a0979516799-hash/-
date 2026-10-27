@echo off
start https://app.netlify.com/drop
explorer.exe "%~dp0"
echo ========================================================
echo   Netlify Drop Deploy Tool
echo.
echo   1. Browser opened to: https://app.netlify.com/drop
echo   2. Folder window opened!
echo   3. Please drag the [ public ] folder into the browser!
echo   4. Deploy will finish in 5 seconds.
echo ========================================================
pause
