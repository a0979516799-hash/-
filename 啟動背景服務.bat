@echo off
chcp 65001 >nul
wscript.exe "%~dp0bg_server.vbs"
exit /b 0
