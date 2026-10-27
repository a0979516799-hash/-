const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../config/database');
const { importSandCsv, findCsvPath } = require('../import_sand_csv');

// 記憶體快取結構 (作為尚未匯入資料庫前的即時備援)
let cachedData = {
  isLoaded: false,
  isLoading: false,
  dates: [],
  byDate: {},
  packSummary: {},
  totalRecords: 0
};

/**
 * 檢查資料庫 sand_change_records 是否已有匯入紀錄
 */
async function getDbRecordCount() {
  try {
    const row = await db.get('SELECT COUNT(*) as count FROM sand_change_records');
    return row ? (row.count || 0) : 0;
  } catch (err) {
    return 0;
  }
}

/**
 * 異步串流解析 ChangePack.csv (備援模式)
 */
async function parseChangePackCsv() {
  if (cachedData.isLoaded || cachedData.isLoading) return;
  cachedData.isLoading = true;

  const csvPath = findCsvPath();
  if (!csvPath) {
    console.warn('⚠️ 未找到 ChangePack.csv 或 鐵砂.csv');
    cachedData.isLoading = false;
    return;
  }

  try {
    const fd = fs.openSync(csvPath, 'r');
    const bomBuf = Buffer.alloc(2);
    fs.readSync(fd, bomBuf, 0, 2, 0);
    fs.closeSync(fd);

    let encoding = 'utf8';
    if (bomBuf[0] === 0xff && bomBuf[1] === 0xfe) {
      encoding = 'utf16le';
    }

    const stream = fs.createReadStream(csvPath, { encoding });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const byDate = {};
    const packSummary = {};
    let totalRecords = 0;
    let isHeader = true;

    for await (const line of rl) {
      if (!line || !line.trim()) continue;
      if (isHeader) {
        isHeader = false;
        continue;
      }

      const parts = line.split(',');
      if (parts.length < 15) continue;

      const pack = (parts[3] || '').trim();
      const cause = (parts[12] || '').trim();
      const rawDate = (parts[14] || '').trim();

      if (!pack || !rawDate || pack === 'Pack') continue;
      const date = rawDate.replace(/-/g, '/');

      if (!byDate[date]) {
        byDate[date] = { date, totalPacks: 0, packs: {}, causes: {} };
      }

      byDate[date].totalPacks += 1;
      byDate[date].packs[pack] = (byDate[date].packs[pack] || 0) + 1;
      if (cause) byDate[date].causes[cause] = (byDate[date].causes[cause] || 0) + 1;

      packSummary[pack] = (packSummary[pack] || 0) + 1;
      totalRecords++;
    }

    const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
    cachedData.dates = sortedDates.map(d => ({ date: d, totalPacks: byDate[d].totalPacks }));
    cachedData.byDate = byDate;
    cachedData.packSummary = packSummary;
    cachedData.totalRecords = totalRecords;
    cachedData.isLoaded = true;
    cachedData.isLoading = false;
  } catch (err) {
    console.error('❌ 解析 ChangePack.csv 發生錯誤:', err);
    cachedData.isLoading = false;
  }
}

/**
 * [GET] /api/sand/dates - 取得更換日期列表 (優先自資料庫 GROUP BY 高速查詢)
 */
router.get('/dates', async (req, res) => {
  try {
    const dbCount = await getDbRecordCount();
    if (dbCount > 0) {
      // 直接自資料庫高效查詢
      const rows = await db.query(`
        SELECT change_date as date, COUNT(*) as totalPacks
        FROM sand_change_records
        GROUP BY change_date
        ORDER BY change_date DESC
      `);

      return res.json({
        success: true,
        source: 'database',
        databaseEngine: db.type,
        totalRecords: dbCount,
        count: rows.length,
        dates: rows
      });
    }

    // 資料庫尚無資料，降級自 CSV 記憶體快取
    if (!cachedData.isLoaded) {
      await parseChangePackCsv();
    }

    res.json({
      success: true,
      source: 'csv_fallback',
      totalRecords: cachedData.totalRecords,
      count: cachedData.dates.length,
      dates: cachedData.dates
    });
  } catch (error) {
    console.error('查詢鐵砂更換日期失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * [GET] /api/sand/daily-stats?date=YYYY/MM/DD - 取得指定日期 PACK 型號更換統計
 */
router.get('/daily-stats', async (req, res) => {
  try {
    const reqDate = (req.query.date || '').trim().replace(/-/g, '/');
    const dbCount = await getDbRecordCount();

    if (dbCount > 0) {
      // 確定查詢日期 (若未提供則預設最新一天)
      let targetDate = reqDate;
      if (!targetDate) {
        const latestRow = await db.get('SELECT change_date FROM sand_change_records ORDER BY change_date DESC LIMIT 1');
        targetDate = latestRow ? latestRow.change_date : null;
      }

      if (!targetDate) {
        return res.status(404).json({ success: false, message: '查無鐵砂換裝紀錄' });
      }

      // 自資料庫查詢該日期的型號分佈與更換原因
      const packRows = await db.query(`
        SELECT pack_type, COUNT(*) as count
        FROM sand_change_records
        WHERE change_date = ?
        GROUP BY pack_type
        ORDER BY count DESC
      `, [targetDate]);

      const causeRows = await db.query(`
        SELECT cause_code, COUNT(*) as count
        FROM sand_change_records
        WHERE change_date = ? AND cause_code != ''
        GROUP BY cause_code
        ORDER BY count DESC
      `, [targetDate]);

      const packs = {};
      let totalPacks = 0;
      packRows.forEach(r => {
        packs[r.pack_type] = r.count;
        totalPacks += r.count;
      });

      const causes = {};
      causeRows.forEach(r => {
        causes[r.cause_code] = r.count;
      });

      return res.json({
        success: true,
        source: 'database',
        data: {
          date: targetDate,
          totalPacks,
          packs,
          causes
        }
      });
    }

    // 離線 CSV 快取備援
    if (!cachedData.isLoaded) {
      await parseChangePackCsv();
    }

    const targetDate = reqDate || (cachedData.dates[0] ? cachedData.dates[0].date : null);
    if (!targetDate || !cachedData.byDate[targetDate]) {
      return res.status(404).json({
        success: false,
        message: `查無日期 [${reqDate || '未指定'}] 之 PACK 更換紀錄`
      });
    }

    res.json({
      success: true,
      source: 'csv_fallback',
      data: cachedData.byDate[targetDate]
    });
  } catch (error) {
    console.error('查詢日統計失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * [GET] /api/sand/import-status - 檢查鐵砂資料庫匯入狀態與 CSV 檔案狀態
 */
router.get('/import-status', async (req, res) => {
  try {
    const dbCount = await getDbRecordCount();
    const csvPath = findCsvPath();
    let csvStats = null;

    if (csvPath && fs.existsSync(csvPath)) {
      const s = fs.statSync(csvPath);
      csvStats = {
        filename: path.basename(csvPath),
        sizeBytes: s.size,
        sizeMb: (s.size / (1024 * 1024)).toFixed(2),
        modifiedAt: s.mtime
      };
    }

    res.json({
      success: true,
      databaseType: db.type,
      importedToDatabase: dbCount > 0,
      dbRecordCount: dbCount,
      csvAvailable: !!csvPath,
      csvInfo: csvStats
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * [POST] /api/sand/import - 網頁觸發一鍵將 CSV 匯入至資料庫
 */
router.post('/import', async (req, res) => {
  try {
    const result = await importSandCsv({ resetBefore: true });
    res.json({
      success: true,
      message: `🎉 成功將 ${result.totalRecords.toLocaleString()} 筆鐵砂更換紀錄匯入至 [${db.type.toUpperCase()}] 資料庫！`,
      data: result
    });
  } catch (error) {
    console.error('網頁觸發 CSV 匯入失敗:', error);
    res.status(500).json({
      success: false,
      message: '匯入失敗: ' + error.message
    });
  }
});

module.exports = router;
