Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "🔍 正在深入診斷 SQL Server 服務與 TCP/IP 監聽狀態..." -ForegroundColor Cyan
Write-Host "===================================================="

# 1. 檢查 SQL 相關服務
Write-Host "`n[1] 檢查 SQL 服務狀態：" -ForegroundColor Yellow
$services = Get-Service -Name *SQL* -ErrorAction SilentlyContinue
foreach ($s in $services) {
    Write-Host ("   • {0} : {1}" -f $s.Name, $s.Status)
}

# 2. 尋找 sqlservr 行程
Write-Host "`n[2] 尋找正在運行的 sqlservr 行程：" -ForegroundColor Yellow
$procs = Get-Process -Name sqlservr -ErrorAction SilentlyContinue
if ($procs) {
    foreach ($p in $procs) {
        Write-Host ("   • PID {0} : {1}" -f $p.Id, $p.Path)
    }
} else {
    Write-Host "   ⚠️ 沒有找到運行中的 sqlservr.exe 行程！SQL Server 可能沒有啟動！" -ForegroundColor Red
}

# 3. 檢查監聽的 TCP 連接埠 (找 1433 或 sqlservr PID)
Write-Host "`n[3] 檢查本機 TCP 監聽通訊埠：" -ForegroundColor Yellow
if ($procs) {
    $pids = $procs.Id
    $conns = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $pids -contains $_.OwningProcess }
    if ($conns) {
        foreach ($c in $conns) {
            Write-Host ("   ✅ SQL Server 正監聽在: {0}:{1}" -f $c.LocalAddress, $c.LocalPort) -ForegroundColor Green
        }
    } else {
        Write-Host "   ⚠️ sqlservr.exe 沒有監聽任何 TCP 通訊埠！(TCP/IP 尚未生效或未啟用)" -ForegroundColor Red
    }
}

# 4. 檢查 1433 連接埠被誰佔用
$port1433 = Get-NetTCPConnection -LocalPort 1433 -ErrorAction SilentlyContinue
if ($port1433) {
    Write-Host ("   ℹ️ Port 1433 目前正被 PID {0} 監聽。" -f $port1433[0].OwningProcess) -ForegroundColor Cyan
} else {
    Write-Host "   ⚠️ Port 1433 目前沒有被任何程式監聽。" -ForegroundColor Yellow
}

# 5. 尋找 SQL Server Errorlog 查看具體日誌
Write-Host "`n[4] 檢查 SQL Server 最新日誌 (尋找 Server is listening 或 TCP 錯誤)：" -ForegroundColor Yellow
$logPaths = @(
    "C:\Program Files\Microsoft SQL Server\MSSQL*\MSSQL\Log\ERRORLOG",
    "C:\Program Files (x86)\Microsoft SQL Server\MSSQL*\MSSQL\Log\ERRORLOG"
)
$foundLog = $null
foreach ($pattern in $logPaths) {
    $files = Get-Item $pattern -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
    if ($files) {
        $foundLog = $files[0].FullName
        break
    }
}

if ($foundLog) {
    Write-Host "   讀取日誌: $foundLog"
    $lines = Get-Content $foundLog -Tail 100 -ErrorAction SilentlyContinue | Select-String "listening", "Server is listening", "TCP", "error", "failed", "1433", "port"
    foreach ($l in $lines | Select-Object -Last 10) {
        Write-Host "   $l"
    }
} else {
    Write-Host "   未找到 ERRORLOG 檔案"
}

Write-Host "`n====================================================" -ForegroundColor Cyan
