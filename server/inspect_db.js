const sql = require('mssql');
require('dotenv').config({ path: './.env' });

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Password123!',
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'BarmagSqlQC',
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: process.env.DB_INSTANCE || 'SQLEXPRESS'
  }
};

async function inspect() {
  let pool;
  try {
    pool = await sql.connect(config);
    console.log('=== [1] 資料庫中所有的資料表 (Tables) ===');
    const tablesRes = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE 
      FROM INFORMATION_SCHEMA.TABLES 
      ORDER BY TABLE_TYPE, TABLE_NAME;
    `);
    console.table(tablesRes.recordset);

    console.log('\n=== [2] 所有欄位結構 (Columns) ===');
    const colsRes = await pool.request().query(`
      SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      ORDER BY TABLE_NAME, ORDINAL_POSITION;
    `);
    console.table(colsRes.recordset);

    for (const t of tablesRes.recordset) {
      if (t.TABLE_TYPE === 'BASE TABLE') {
        const fullTable = `[${t.TABLE_SCHEMA}].[${t.TABLE_NAME}]`;
        const countRes = await pool.request().query(`SELECT COUNT(*) AS total_rows FROM ${fullTable}`);
        console.log(`\n=== [3] 資料表 ${fullTable} 總筆數: ${countRes.recordset[0].total_rows} 筆 ===`);
        const sampleRes = await pool.request().query(`SELECT TOP 5 * FROM ${fullTable}`);
        console.table(sampleRes.recordset);
      }
    }
  } catch (err) {
    console.error('資料庫連線或查詢失敗:', err.message);
  } finally {
    if (pool) await pool.close();
  }
}

inspect();
