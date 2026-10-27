@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 專題專案無關檔案一鍵清理工具

echo ========================================================
echo   紡絲助劑與鐵砂智能庫存管理系統 - 檔案瘦身與清理工具
echo ========================================================
echo.
echo 即將清理以下 8 個與目前介面與系統運作無關的檔案：
echo.
echo   [已廢棄與舊壓縮包]
echo     1. sync.ps1                           (已由 bat 取代之廢棄腳本)
echo     2. public.zip                         (舊的暫存壓縮包)
echo     3. 專案完整內容與對話記錄.zip         (舊備份檔，隨時可用打包工具重產)
echo.
echo   [已整併的重複批次檔]
echo     4. 測試資料庫連線.bat                 (已整合至「一鍵修復SQL連線.bat」)
echo     5. 開啟SQL網路服務.bat                 (已整合至「一鍵修復SQL連線.bat」)
echo.
echo   [開發時期臨時診斷腳本]
echo     6. server\diag_sql.ps1                (臨時 Port 檢測腳本)
echo     7. server\analyze_sand.ps1            (臨時 CSV 結構採樣腳本)
echo     8. server\inspect_db.js               (臨時資料庫欄位檢視腳本)
echo.
echo ========================================================
echo 提示：
echo - 您的核心介面 (public/)、資料庫 (data/)、核心伺服器 (server/)
echo   以及「鐵砂.csv」與「畢業專題書面報告.md」皆受完整保護，不受任何影響！
echo ========================================================
echo.
set /p confirm="確認要刪除上述 8 個檔案嗎？(Y/N): "
if /i not "%confirm%"=="Y" (
    echo.
    echo 已取消清理操作。
    pause
    exit /b
)

echo.
echo 正在執行清理...

if exist "sync.ps1" ( del /f /q "sync.ps1" & echo [已刪除] sync.ps1 )
if exist "public.zip" ( del /f /q "public.zip" & echo [已刪除] public.zip )
if exist "專案完整內容與對話記錄.zip" ( del /f /q "專案完整內容與對話記錄.zip" & echo [已刪除] 專案完整內容與對話記錄.zip )
if exist "測試資料庫連線.bat" ( del /f /q "測試資料庫連線.bat" & echo [已刪除] 測試資料庫連線.bat )
if exist "開啟SQL網路服務.bat" ( del /f /q "開啟SQL網路服務.bat" & echo [已刪除] 開啟SQL網路服務.bat )
if exist "server\diag_sql.ps1" ( del /f /q "server\diag_sql.ps1" & echo [已刪除] server\diag_sql.ps1 )
if exist "server\analyze_sand.ps1" ( del /f /q "server\analyze_sand.ps1" & echo [已刪除] server\analyze_sand.ps1 )
if exist "server\inspect_db.js" ( del /f /q "server\inspect_db.js" & echo [已刪除] server\inspect_db.js )

echo.
echo ========================================================
echo ✅ 清理完成！專案目錄已維持最精簡、乾淨的狀態。
echo ========================================================
echo.
pause
