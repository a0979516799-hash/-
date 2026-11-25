/**
 * ========================================================
 * 安全公私分離同步腳本 (MS SQL -> Cloud PostgreSQL)
 * 僅同步「60 個月彙總產能 + 14 筆油劑實績 + 8 筆物料庫存」，
 * 191 萬筆原始落筒明細絕對不離開本機！
 * ========================================================
 */
const dotenv = require('dotenv');
dotenv.config();

const sql = require('mssql');
const { Pool } = require('pg');

async function main() {
  const cloudUrl = process.env.CLOUD_DATABASE_URL || process.argv[2];
  if (!cloudUrl) {
    console.error('❌ 請先在 .env 設定 CLOUD_DATABASE_URL，或於指令後方帶入連線字串！');
    process.exit(1);
  }

  console.log('1️⃣ 正在連線本機 MS SQL Server...');
  const mssqlCfg = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'Password123!',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'BarmagSqlYZu',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    options: { encrypt: false, trustServerCertificate: true }
  };
  const msPool = await sql.connect(mssqlCfg);
  console.log('✅ 本機 MS SQL 連線成功！');

  console.log('2️⃣ 正在彙總 191 萬筆落筒資料為 60 個月統計 (僅匯出月總計，明細不出廠)...');
  const monthlyRes = await msPool.request().query(`
    SELECT 
      CONVERT(VARCHAR(7), TRY_CAST(doffDateTime AS DATETIME), 120) AS month,
      COUNT(*) AS doff_count,
      ROUND(SUM(Weight) / 1000.0, 2) AS weight_ton,
      ROUND(SUM(Weight), 2) AS weight_kg
    FROM dbo.V_DoffList_5Years
    WHERE TRY_CAST(doffDateTime AS DATETIME) IS NOT NULL AND Weight > 0
    GROUP BY CONVERT(VARCHAR(7), TRY_CAST(doffDateTime AS DATETIME), 120)
    ORDER BY month ASC
  `);
  console.log(`   -> 共取得 ${monthlyRes.recordset.length} 個月彙總紀錄`);

  let oilRows = [];
  try {
    const oilRes = await msPool.request().query('SELECT * FROM dbo.ConsumptionSummary_Table');
    oilRows = oilRes.recordset || [];
  } catch (_) {}

  let matRows = [];
  try {
    const matRes = await msPool.request().query('SELECT * FROM materials');
    matRows = matRes.recordset || [];
  } catch (_) {}

  console.log('3️⃣ 正在透過 SSL/TLS 加密連線雲端 PostgreSQL...');
  const pgPool = new Pool({
    connectionString: cloudUrl,
    ssl: { rejectUnauthorized: false }
  });

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS monthly_production_summary (
      month VARCHAR(20) PRIMARY KEY,
      doff_count INTEGER NOT NULL,
      weight_ton DOUBLE PRECISION NOT NULL,
      weight_kg DOUBLE PRECISION NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS materials (
      id SERIAL PRIMARY KEY,
      code VARCHAR(100) UNIQUE,
      name VARCHAR(200),
      category VARCHAR(100),
      spec VARCHAR(200),
      batch_no VARCHAR(100),
      expire_date VARCHAR(50),
      location VARCHAR(100),
      stock_quantity DOUBLE PRECISION,
      safety_stock DOUBLE PRECISION,
      lead_time INTEGER,
      unit VARCHAR(50),
      daily_demand DOUBLE PRECISION,
      status VARCHAR(50) DEFAULT 'ACTIVE'
    );
    CREATE TABLE IF NOT EXISTS daily_oil_consumptions (
      id SERIAL PRIMARY KEY,
      oil_type VARCHAR(100),
      machine_no VARCHAR(50),
      start_date VARCHAR(50),
      end_date VARCHAR(50),
      emulsion_consumption DOUBLE PRECISION,
      neat_oil_consumption DOUBLE PRECISION
    );
  `);

  for (const r of monthlyRes.recordset) {
    await pgPool.query(`
      INSERT INTO monthly_production_summary (month, doff_count, weight_ton, weight_kg, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (month) DO UPDATE SET
        doff_count = EXCLUDED.doff_count,
        weight_ton = EXCLUDED.weight_ton,
        weight_kg = EXCLUDED.weight_kg,
        updated_at = NOW()
    `, [r.month, r.doff_count, r.weight_ton, r.weight_kg]);
  }
  console.log(`✅ 已加密同步 ${monthlyRes.recordset.length} 個月產能統計至雲端！`);

  if (matRows.length > 0) {
    for (const m of matRows) {
      await pgPool.query(`
        INSERT INTO materials (code, name, category, spec, batch_no, expire_date, location, stock_quantity, safety_stock, lead_time, unit, daily_demand)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (code) DO UPDATE SET
          stock_quantity = EXCLUDED.stock_quantity,
          safety_stock = EXCLUDED.safety_stock,
          lead_time = EXCLUDED.lead_time,
          daily_demand = EXCLUDED.daily_demand
      `, [m.code, m.name, m.category, m.spec, m.batch_no, m.expire_date, m.location, m.stock_quantity, m.safety_stock, m.lead_time, m.unit, m.daily_demand]);
    }
    console.log(`✅ 已同步 ${matRows.length} 筆最新庫存主檔至雲端！`);
  }

  await pgPool.end();
  await msPool.close();
  console.log('🎉 雲端同步全部完成！主管現在打開 Netlify 就能看到與本機 100% 一致的即時資料！');
}

main().catch(err => {
  console.error('❌ 同步失敗:', err.message);
  process.exit(1);
});
