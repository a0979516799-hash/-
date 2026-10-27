/**
 * ========================================================
 * MS SQL Server 連線診斷與自動偵測腳本
 * ========================================================
 */
const sql = require('mssql');
const net = require('net');
const dotenv = require('dotenv');

dotenv.config();

const baseConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Password123!',
  database: process.env.DB_NAME || 'BarmagSqlQC',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    connectTimeout: 5000
  }
};

/**
 * 測試 TCP Port 是否開放
 */
function probePort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function run() {
  console.log('====================================================');
  console.log('🔍 正在為您進行 SQL Server 連線全面診斷...');
  console.log('====================================================\n');

  // 1. 偵測標準 Port 1433
  console.log('1️⃣ 正在探測本機 Port 1433 是否通訊...');
  const is1433Open = await probePort(1433);
  if (is1433Open) {
    console.log('   ✅ 偵測到 Port 1433 是通的！正在嘗試透過 Port 1433 直連...');
    const ok = await tryConnectWithConfig({
      ...baseConfig,
      server: '127.0.0.1',
      port: 1433
    }, '127.0.0.1:1433');
    if (ok) return;
  } else {
    console.log('   ⚠️ Port 1433 目前未回應 (SQL Express 預設使用動態 Port)');
  }

  // 2. 透過實例名稱 SQLEXPRESS 連線 (需依賴 SQL Browser 或動態解析)
  console.log('\n2️⃣ 嘗試透過實例名稱 SQLEXPRESS 連線 (自動協商)...');
  const ok2 = await tryConnectWithConfig({
    ...baseConfig,
    server: '127.0.0.1',
    options: {
      ...baseConfig.options,
      instanceName: 'SQLEXPRESS'
    }
  }, '127.0.0.1\\SQLEXPRESS');
  if (ok2) return;

  // 3. 嘗試關閉加密連線 (部分本機開發設定允許非加密)
  console.log('\n3️⃣ 嘗試以相容非加密模式測試...');
  const ok3 = await tryConnectWithConfig({
    ...baseConfig,
    server: '127.0.0.1',
    options: {
      instanceName: 'SQLEXPRESS',
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 5000
    }
  }, '127.0.0.1\\SQLEXPRESS (相容模式)');
  if (ok3) return;

  // 4. 若皆未通，提供針對性解決方案
  console.log('\n====================================================');
  console.log('💡 【核心原因與解法】');
  console.log('SQL Server Express 啟用 TCP/IP 後，預設會使用隨機的「動態 Port」。');
  console.log('只要將它固定為標準的 1433，就能 100% 直連成功！\n');
  console.log('請在「SQL Server 組態管理員」做這最後一步：');
  console.log('1. 點開「SQL Server 網路組態」->「SQLEXPRESS 的通訊協定」-> 點兩下「TCP/IP」');
  console.log('2. 切換到【IP 位址】頁籤，拉到最下面的【IPAll】區塊');
  console.log('3. 將【TCP 動態通訊埠】裡面的數字全部刪除 (留空)');
  console.log('4. 在【TCP 通訊埠】填入：1433');
  console.log('5. 按確定，並重啟 SQL Server (SQLEXPRESS) 服務！');
  console.log('====================================================');
}

async function tryConnectWithConfig(cfg, label) {
  try {
    const pool = await sql.connect(cfg);
    console.log(`\n🎉🎉🎉 【連線成功！】恭喜！成功透過 [${label}] 連入 BarmagSqlQC！`);
    
    console.log('🔍 正在讀取 dbo.ConsumptionSummary_Table...\n');
    const result = await pool.request().query('SELECT TOP 5 * FROM dbo.ConsumptionSummary_Table');
    console.log(`✅ 成功取得 ${result.recordset.length} 筆真實資料：`);
    console.table(result.recordset);
    
    await pool.close();
    return true;
  } catch (e) {
    console.log(`   ❌ 嘗試失敗 [${label}]: ${e.message}`);
    return false;
  }
}

run();
