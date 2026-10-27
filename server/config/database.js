const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

const DB_TYPE = process.env.DB_TYPE || 'mssql';

let dbInstance = null;

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * 紡絲助劑與鐵砂智能庫存管理系統 - 安全資料庫核心
 * 連線支援：
 * 1. Microsoft SQL Server (BarmagSqlQC / dbo.ConsumptionSummary_Table)
 * 2. SQLite 離線安全備援 (含 sand_change_records, materials, transactions 自動建表)
 */
class Database {
  constructor() {
    this.type = DB_TYPE;
    this.connected = false;
    this.initPromise = this.init();
  }

  async ready() {
    await this.initPromise;
    return this;
  }

  async init() {
    if (this.type === 'mssql') {
      const sql = require('mssql');
      const mssqlConfig = {
        user: process.env.DB_USER || 'sa',
        password: process.env.DB_PASSWORD || 'Password123!',
        server: process.env.DB_SERVER || 'localhost',
        database: process.env.DB_NAME || 'BarmagSqlQC',
        options: {
          instanceName: process.env.DB_INSTANCE || 'SQLEXPRESS',
          encrypt: true,
          trustServerCertificate: true,
          connectTimeout: 4000
        }
      };

      console.log(`🔄 正在嘗試連線至 MS SQL Server: ${mssqlConfig.server}\\${mssqlConfig.options.instanceName} [資料庫: ${mssqlConfig.database}]`);
      try {
        this.pool = await sql.connect(mssqlConfig);
        this.connected = true;
        console.log('✅ MS SQL Server (BarmagSqlQC) 安全連線池建立成功！');
        await this.pool.request().query(`
          IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sand_change_records' and xtype='U')
          CREATE TABLE sand_change_records (
            id INT IDENTITY(1,1) PRIMARY KEY,
            record_id INT,
            sm NVARCHAR(50),
            pos NVARCHAR(50),
            pack_type NVARCHAR(50),
            cause_code NVARCHAR(100),
            shift NVARCHAR(20),
            change_date NVARCHAR(50),
            change_time NVARCHAR(50),
            change_user NVARCHAR(100),
            merge_code NVARCHAR(50),
            created_at DATETIME DEFAULT GETDATE()
          )
        `);
      } catch (err) {
        console.warn('⚠️ MS SQL 連線失敗，自動切換為本地 SQLite 雙模備用模式:', err.message);
        this.type = 'sqlite';
        await this.initSqlite();
      }
    } else {
      await this.initSqlite();
    }
  }

  initSqlite() {
    return new Promise((resolve) => {
      const sqlite3 = require('sqlite3').verbose();
      const dbPath = path.resolve(process.env.SQLITE_PATH || './data/database.sqlite');
      ensureDirectoryExistence(dbPath);

      console.log(`🔄 連線至本地 SQLite 資料庫: ${dbPath}`);
      this.db = new sqlite3.Database(dbPath, async (err) => {
        if (err) {
          console.error('❌ SQLite 連線失敗:', err.message);
          this.connected = false;
        } else {
          this.connected = true;
          console.log('✅ SQLite 資料庫連線成功！正在檢查並初始化資料表...');
          await this.initSqliteSchemaAndSeeds();
        }
        resolve();
      });
    });
  }

  /**
   * 初始化 SQLite 資料表與預設種子資料
   */
  async initSqliteSchemaAndSeeds() {
    const runAsync = (sql, params = []) => {
      return new Promise((resolve, reject) => {
        this.db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    };

    const getAsync = (sql, params = []) => {
      return new Promise((resolve, reject) => {
        this.db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    };

    try {
      // 1. 鐵砂更換紀錄表 (由 ChangePack.csv / 鐵砂.csv 匯入)
      await runAsync(`
        CREATE TABLE IF NOT EXISTS sand_change_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id INTEGER,
          sm TEXT,
          pos TEXT,
          pack_type TEXT,
          cause_code TEXT,
          shift TEXT,
          change_date TEXT,
          change_time TEXT,
          change_user TEXT,
          merge_code TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await runAsync(`CREATE INDEX IF NOT EXISTS idx_sand_date ON sand_change_records (change_date)`);
      await runAsync(`CREATE INDEX IF NOT EXISTS idx_sand_pack ON sand_change_records (pack_type)`);

      // 2. 主管紡絲助劑機台耗量表 (對應 MS SQL BarmagSqlQC.dbo.ConsumptionSummary_Table)
      await runAsync(`
        CREATE TABLE IF NOT EXISTS daily_oil_consumptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          oil_type TEXT,
          machine_no TEXT,
          start_date TEXT,
          end_date TEXT,
          emulsion_consumption REAL,
          neat_oil_consumption REAL
        )
      `);

      // 檢查並預載 14 筆 BarmagSqlQC 真實機台耗量數據 (確保離線時也能 100% 擬真)
      const oilCount = await getAsync('SELECT COUNT(*) as count FROM daily_oil_consumptions');
      if (!oilCount || oilCount.count === 0) {
        console.log('🌱 正在為 SQLite 匯入主管 BarmagSqlQC 14 筆真實機台耗量資料...');
        const initialOils = [
          { oil_type: 'B-1823', machine_no: '011', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 1354.752, neat: 162.5696 },
          { oil_type: 'P-1213', machine_no: '001', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 652.3082, neat: 97.8458 },
          { oil_type: 'P-1213', machine_no: '002', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 895.7952, neat: 134.3694 },
          { oil_type: 'T-1206', machine_no: '011', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 1804.032, neat: 270.6048 },
          { oil_type: 'T-1206', machine_no: '013', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 822.528, neat: 123.3792 },
          { oil_type: 'T2227', machine_no: '001', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 102.021, neat: 8.1618 },
          { oil_type: 'T-2227', machine_no: '001', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 1270.8301, neat: 101.6669 },
          { oil_type: 'T-2227', machine_no: '002', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 1122.5088, neat: 89.8002 },
          { oil_type: 'T-2227', machine_no: '003', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 420.6188, neat: 33.649 },
          { oil_type: 'T-2227', machine_no: '012', start_date: '2026-05-20', end_date: '2026-05-21', emulsion: 850.176, neat: 68.0143 },
          { oil_type: 'T-2227', machine_no: '013', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 172.8, neat: 15.2064 },
          { oil_type: 'T-2227', machine_no: '014', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 538.6752, neat: 43.0934 },
          { oil_type: 'T2227+YT5355', machine_no: '004', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 403.5135, neat: 48.4211 },
          { oil_type: 'XF-5010+T-2124', machine_no: '013', start_date: '2026-05-19', end_date: '2026-05-21', emulsion: 354.24, neat: 42.509 }
        ];
        for (const item of initialOils) {
          await runAsync(
            `INSERT INTO daily_oil_consumptions (oil_type, machine_no, start_date, end_date, emulsion_consumption, neat_oil_consumption) VALUES (?, ?, ?, ?, ?, ?)`,
            [item.oil_type, item.machine_no, item.start_date, item.end_date, item.emulsion, item.neat]
          );
        }
      }

      // 3. 物料主檔表 (materials - 助劑 6 款 + 鐵砂 2 款)
      await runAsync(`
        CREATE TABLE IF NOT EXISTS materials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE,
          name TEXT,
          category TEXT,
          spec TEXT,
          batch_no TEXT,
          expire_date TEXT,
          location TEXT,
          stock_quantity REAL,
          safety_stock REAL,
          lead_time INTEGER,
          unit TEXT,
          daily_demand REAL,
          status TEXT DEFAULT 'ACTIVE'
        )
      `);

      const matCount = await getAsync('SELECT COUNT(*) as count FROM materials');
      if (!matCount || matCount.count === 0) {
        console.log('🌱 正在初始化紡絲助劑與鐵砂規格主檔...');
        const initialMaterials = [
          // 紡絲助劑
          { code: 'B-1823', name: '紡絲油劑 B-1823', category: '紡絲助劑', spec: '200KG/桶', batch_no: 'B2605-A1', expire_date: '2026-11-20', location: 'A-01-01', stock: 1800.0, ss: 400.0, lt: 5, unit: 'KG', d: 162.57 },
          { code: 'P-1213', name: '紡絲油劑 P-1213', category: '紡絲助劑', spec: '200KG/桶', batch_no: 'P2605-C2', expire_date: '2026-12-15', location: 'A-01-02', stock: 2200.0, ss: 500.0, lt: 5, unit: 'KG', d: 232.22 },
          { code: 'T-1206', name: '紡絲油劑 T-1206', category: '紡絲助劑', spec: '200KG/桶', batch_no: 'T2604-B3', expire_date: '2026-10-30', location: 'A-02-01', stock: 2400.0, ss: 600.0, lt: 5, unit: 'KG', d: 393.98 },
          { code: 'T-2227', name: '紡絲油劑 T-2227', category: '紡絲助劑', spec: '200KG/桶', batch_no: 'T2605-D1', expire_date: '2026-11-10', location: 'A-02-02', stock: 3000.0, ss: 700.0, lt: 4, unit: 'KG', d: 359.59 },
          { code: 'T2227+YT5355', name: '複合油劑 T2227+YT5355', category: '紡絲助劑', spec: '200KG/桶', batch_no: 'TY2603-A', expire_date: '2026-09-25', location: 'A-03-01', stock: 550.0, ss: 150.0, lt: 7, unit: 'KG', d: 48.42 },
          { code: 'XF-5010+T-2124', name: '複合油劑 XF-5010+T-2124', category: '紡絲助劑', spec: '200KG/桶', batch_no: 'XT2604-C', expire_date: '2026-10-05', location: 'A-03-02', stock: 500.0, ss: 150.0, lt: 7, unit: 'KG', d: 42.51 },
          // 鐵砂耗材
          { code: '25/50', name: '粗砂', category: '鐵砂耗材', spec: '下層支撐導流 (目數 25/50)', batch_no: 'SAND-C2601', expire_date: '2028-12-31', location: 'S-01-01', stock: 1500.0, ss: 300.0, lt: 7, unit: 'KG', d: 52.0 },
          { code: '140/200', name: '細砂', category: '鐵砂耗材', spec: '上層高精過濾 (目數 140/200)', batch_no: 'SAND-F2601', expire_date: '2028-12-31', location: 'S-01-02', stock: 800.0, ss: 150.0, lt: 10, unit: 'KG', d: 18.0 }
        ];

        for (const m of initialMaterials) {
          await runAsync(`
            INSERT INTO materials (code, name, category, spec, batch_no, expire_date, location, stock_quantity, safety_stock, lead_time, unit, daily_demand)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [m.code, m.name, m.category, m.spec, m.batch_no, m.expire_date, m.location, m.stock, m.ss, m.lt, m.unit, m.d]);
        }
      }

      // 4. 進出庫交易紀錄表 (inventory_transactions)
      await runAsync(`
        CREATE TABLE IF NOT EXISTS inventory_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tx_no TEXT UNIQUE,
          material_id INTEGER,
          type TEXT,
          quantity REAL,
          unit TEXT,
          department TEXT,
          purpose TEXT,
          batch_no TEXT,
          status TEXT,
          operator TEXT,
          auditor TEXT,
          audit_comment TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          audited_at DATETIME
        )
      `);

      // 5. 使用者帳號表 (users)
      await runAsync(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          password_hash TEXT,
          email TEXT,
          role TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const userCount = await getAsync('SELECT COUNT(*) as count FROM users');
      if (!userCount || userCount.count === 0) {
        console.log('🌱 正在建立預設使用者帳號 (admin, operator_bernie)...');
        const adminHash = bcrypt.hashSync('Password123!', 10);
        const operatorHash = bcrypt.hashSync('Password123!', 10);
        await runAsync(`INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)`, ['admin', adminHash, 'admin@textile-factory.com', 'admin']);
        await runAsync(`INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)`, ['operator_bernie', operatorHash, 'bernie@textile-factory.com', 'operator']);
      }

      // 6. 文章/筆記表 (notes - 安全演示用)
      await runAsync(`
        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          title TEXT,
          content TEXT,
          is_secret INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const notesCount = await getAsync('SELECT COUNT(*) as count FROM notes');
      if (!notesCount || notesCount.count === 0) {
        await runAsync(`INSERT INTO notes (user_id, title, content, is_secret) VALUES (1, '標準作業SOP', '紡絲油劑與鐵砂更換定期檢驗標準SOP', 0)`);
        await runAsync(`INSERT INTO notes (user_id, title, content, is_secret) VALUES (1, '機密配方', '機密配方資料：YT5355 與 XF-5010 比例極限管制', 1)`);
      }

      // 7. 安全稽核日誌 (security_logs)
      await runAsync(`
        CREATE TABLE IF NOT EXISTS security_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip TEXT,
          event_type TEXT,
          details TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('✅ SQLite 資料表檢查與種子資料建置完成！');
    } catch (e) {
      console.error('❌ 初始化 SQLite 資料表失敗:', e.message);
    }
  }

  /**
   * 批次寫入鐵砂更換紀錄 (使用 Transaction 高速匯入)
   */
  async batchInsertSandRecords(records) {
    await this.ready();
    if (this.type === 'sqlite' && this.db) {
      return new Promise((resolve, reject) => {
        this.db.serialize(() => {
          this.db.run('BEGIN TRANSACTION');
          const stmt = this.db.prepare(`
            INSERT INTO sand_change_records 
            (record_id, sm, pos, pack_type, cause_code, shift, change_date, change_time, change_user, merge_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const r of records) {
            stmt.run([
              r.record_id || null,
              r.sm || '',
              r.pos || '',
              r.pack_type || '',
              r.cause_code || '',
              r.shift || '',
              r.change_date || '',
              r.change_time || '',
              r.change_user || '',
              r.merge_code || ''
            ]);
          }

          stmt.finalize((err) => {
            if (err) {
              this.db.run('ROLLBACK');
              return reject(err);
            }
            this.db.run('COMMIT', (commitErr) => {
              if (commitErr) reject(commitErr);
              else resolve(records.length);
            });
          });
        });
      });
    } else if (this.type === 'mssql' && this.pool) {
      const sql = require('mssql');
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sand_change_records' and xtype='U')
        CREATE TABLE sand_change_records (
          id INT IDENTITY(1,1) PRIMARY KEY,
          record_id INT,
          sm NVARCHAR(50),
          pos NVARCHAR(50),
          pack_type NVARCHAR(50),
          cause_code NVARCHAR(100),
          shift NVARCHAR(20),
          change_date NVARCHAR(50),
          change_time NVARCHAR(50),
          change_user NVARCHAR(100),
          merge_code NVARCHAR(50),
          created_at DATETIME DEFAULT GETDATE()
        )
      `);

      const table = new sql.Table('sand_change_records');
      table.create = false;
      table.columns.add('record_id', sql.Int, { nullable: true });
      table.columns.add('sm', sql.NVarChar(50), { nullable: true });
      table.columns.add('pos', sql.NVarChar(50), { nullable: true });
      table.columns.add('pack_type', sql.NVarChar(50), { nullable: true });
      table.columns.add('cause_code', sql.NVarChar(100), { nullable: true });
      table.columns.add('shift', sql.NVarChar(20), { nullable: true });
      table.columns.add('change_date', sql.NVarChar(50), { nullable: true });
      table.columns.add('change_time', sql.NVarChar(50), { nullable: true });
      table.columns.add('change_user', sql.NVarChar(100), { nullable: true });
      table.columns.add('merge_code', sql.NVarChar(50), { nullable: true });

      for (const r of records) {
        table.rows.add(
          r.record_id || null,
          r.sm || '',
          r.pos || '',
          r.pack_type || '',
          r.cause_code || '',
          r.shift || '',
          r.change_date || '',
          r.change_time || '',
          r.change_user || '',
          r.merge_code || ''
        );
      }

      const request = this.pool.request();
      await request.bulk(table);
      return records.length;
    }
  }

  /**
   * 取得資料庫全盤狀態與健康度診斷
   */
  async getStatus() {
    await this.ready();
    const t0 = Date.now();
    let oilRecordsCount = 0;
    let sandRecordsCount = 0;
    let materialsCount = 0;

    try {
      if (this.type === 'mssql' && this.pool) {
        const oilRes = await this.pool.request().query('SELECT COUNT(*) as count FROM dbo.ConsumptionSummary_Table');
        oilRecordsCount = oilRes.recordset[0]?.count || 0;

        try {
          const sandRes = await this.pool.request().query('SELECT COUNT(*) as count FROM sand_change_records');
          sandRecordsCount = sandRes.recordset[0]?.count || 0;
        } catch (_) {
          sandRecordsCount = 0;
        }

        materialsCount = 8;
      } else {
        const oilRes = await this.get('SELECT COUNT(*) as count FROM daily_oil_consumptions');
        oilRecordsCount = oilRes?.count || 0;

        const sandRes = await this.get('SELECT COUNT(*) as count FROM sand_change_records');
        sandRecordsCount = sandRes?.count || 0;

        const matRes = await this.get('SELECT COUNT(*) as count FROM materials');
        materialsCount = matRes?.count || 0;
      }

      const latencyMs = Date.now() - t0;

      return {
        success: true,
        connected: this.connected,
        type: this.type,
        server: this.type === 'mssql' ? `${process.env.DB_SERVER}\\${process.env.DB_INSTANCE}` : 'Local SQLite',
        databaseName: this.type === 'mssql' ? (process.env.DB_NAME || 'BarmagSqlQC') : 'database.sqlite',
        oilSource: this.type === 'mssql' ? 'dbo.ConsumptionSummary_Table (主管 MS SQL)' : 'daily_oil_consumptions (SQLite備援)',
        oilRecordsCount,
        sandRecordsCount,
        materialsCount,
        latencyMs,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        success: false,
        connected: false,
        type: this.type,
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 記錄安全稽核事件
   */
  async logSecurityEvent(ip, eventType, details) {
    try {
      await this.run(
        `INSERT INTO security_logs (ip, event_type, details) VALUES (?, ?, ?)`,
        [ip || '127.0.0.1', eventType, details]
      );
    } catch (e) {
      console.warn('寫入安全日誌失敗:', e.message);
    }
  }

  /**
   * 脆弱查詢 (僅用於資安攻防演示)
   */
  async vulnerableQueryUnsafe(sqlStr) {
    await this.ready();
    if (this.type === 'sqlite' && this.db) {
      return new Promise((resolve, reject) => {
        this.db.all(sqlStr, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    } else if (this.type === 'mssql' && this.pool) {
      const result = await this.pool.request().query(sqlStr);
      return result.recordset || [];
    }
    return [];
  }

  /**
   * 直接讀取 BarmagSqlQC 的 dbo.ConsumptionSummary_Table
   */
  async getConsumptionSummaryTable() {
    await this.ready();
    if (this.type === 'mssql' && this.pool) {
      const tableName = process.env.DB_TABLE || 'dbo.ConsumptionSummary_Table';
      const result = await this.pool.request().query(`SELECT * FROM ${tableName}`);
      return result.recordset;
    } else {
      return await this.query('SELECT * FROM daily_oil_consumptions');
    }
  }

  /**
   * 參數化查詢多筆 (Prepared Statements / 防 SQL 注入)
   */
  async query(sqlStr, params = []) {
    await this.ready();
    if (this.type === 'mssql' && this.pool) {
      const request = this.pool.request();
      params.forEach((param, idx) => {
        request.input(`param${idx}`, param);
      });
      let mssqlQuery = sqlStr;
      params.forEach((_, idx) => {
        mssqlQuery = mssqlQuery.replace('?', `@param${idx}`);
      });
      const result = await request.query(mssqlQuery);
      return result.recordset || [];
    } else if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.all(sqlStr, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    } else {
      return [];
    }
  }

  /**
   * 參數化查詢單筆 (Prepared Statements / 防 SQL 注入)
   */
  async get(sqlStr, params = []) {
    const rows = await this.query(sqlStr, params);
    return rows[0] || null;
  }

  /**
   * 參數化執行 INSERT/UPDATE/DELETE
   */
  async run(sqlStr, params = []) {
    await this.ready();
    if (this.type === 'mssql' && this.pool) {
      const request = this.pool.request();
      params.forEach((param, idx) => {
        request.input(`param${idx}`, param);
      });
      let mssqlQuery = sqlStr;
      params.forEach((_, idx) => {
        mssqlQuery = mssqlQuery.replace('?', `@param${idx}`);
      });
      const result = await request.query(mssqlQuery);
      return { id: result.rowsAffected[0], changes: result.rowsAffected[0] };
    } else if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.run(sqlStr, params, function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, changes: this.changes });
        });
      });
    } else {
      return { id: 0, changes: 0 };
    }
  }
}

dbInstance = new Database();
module.exports = dbInstance;
