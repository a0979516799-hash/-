@echo off
set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%PATH%"

echo ========================================================
echo   Connecting to MS SQL Server (SQLEXPRESS)...
echo ========================================================
echo.

node -v
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found in PATH or Program Files!
    echo Please close and restart this IDE or computer.
    pause
    exit /b
)

echo [OK] Node.js is detected!
echo.
echo [1/2] Checking and installing mssql library...
call npm install mssql --save
echo.

echo [2/2] Running database connection test to BarmagSqlQC...
echo.
node server/test_mssql.js

echo.
echo ========================================================
echo Test script completed.
pause
