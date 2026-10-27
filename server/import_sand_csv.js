const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('./config/database');

/**
 * 尋找鐵砂 CSV 檔案路徑
 */
function findCsvPath() {
  const candidates = [
    path.resolve(process.cwd(), '鐵砂.csv'),
    path.resolve(process.cwd(), 'ChangePack.csv'),
    path.resolve(__dirname, '../鐵砂.csv'),
    path.resolve(__dirname, '../ChangePack.csv'),
    path.resolve(process.cwd(), '鐵砂_preview.csv'),
    path.resolve(__dirname, '../鐵砂_preview.csv'),
    path.resolve(process.env.USERPROFILE || 'C:/Users/Bernie', 'Downloads/ChangePack.csv')
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * 執行 CSV 批次資料庫匯入
 * @param {Object} options - { resetBefore: boolean, onProgress: function }
 */
async function importSandCsv(options = {}) {
  await db.ready();
  const { resetBefore = true, onProgress = null } = options;

  const csvPath = findCsvPath();
  if (!csvPath) {
    throw new Error('未找到 鐵砂.csv 或 ChangePack.csv 檔案！請確認檔案位於專案目錄中。');
  }

  const stat = fs.statSync(csvPath);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`====================================================`);
  console.log(`🚀 開始批次匯入鐵砂耗材更換紀錄至資料庫`);
  console.log(`📁 來源檔案: ${csvPath} (${sizeMb} MB)`);
  console.log(`🗄️ 目標資料庫: [${db.type.toUpperCase()}]`);
  console.log(`====================================================`);

  const startTime = Date.now();

  // 若選擇重設，先清除舊有資料
  if (resetBefore) {
    console.log('🧹 正在清理既有舊更換紀錄...');
    try {
      await db.run('DELETE FROM sand_change_records');
    } catch (e) {
      console.warn('⚠️ 清理既有舊紀錄提示:', e.message);
    }
  }

  // 1. 偵測編碼 (前 2 bytes 是否為 0xFF 0xFE = UTF-16LE BOM)
  const fd = fs.openSync(csvPath, 'r');
  const bomBuf = Buffer.alloc(2);
  fs.readSync(fd, bomBuf, 0, 2, 0);
  fs.closeSync(fd);

  let encoding = 'utf8';
  if (bomBuf[0] === 0xff && bomBuf[1] === 0xfe) {
    encoding = 'utf16le';
    console.log('ℹ️ 偵測到 UTF-16LE 編碼格式 (Barmag 系統產出標準)');
  } else {
    console.log('ℹ️ 偵測到 UTF-8 編碼格式');
  }

  const stream = fs.createReadStream(csvPath, { encoding });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const BATCH_SIZE = 2000;
  let batch = [];
  let totalProcessed = 0;
  let isHeader = true;

  for await (const line of rl) {
    if (!line || !line.trim()) continue;
    if (isHeader) {
      isHeader = false;
      continue;
    }

    // 格式: ID,SM,POS,Pack,TL1..TL8,Cause_Code,Shift1,Change_Date,Change_Time,ChangeUser,Merge,...
    const parts = line.split(',');
    if (parts.length < 15) continue;

    const recordId = parseInt(parts[0], 10) || null;
    const sm = (parts[1] || '').trim();
    const pos = (parts[2] || '').trim();
    const pack = (parts[3] || '').trim();
    const cause = (parts[12] || '').trim();
    const shift = (parts[13] || '').trim();
    const rawDate = (parts[14] || '').trim();
    const changeTime = (parts[15] || '').trim();
    const changeUser = (parts[16] || '').trim();
    const mergeCode = (parts[17] || '').trim();

    if (!pack || !rawDate || pack === 'Pack') continue;

    // 標準化日期為 YYYY/MM/DD
    const changeDate = rawDate.replace(/-/g, '/');

    batch.push({
      record_id: recordId,
      sm,
      pos,
      pack_type: pack,
      cause_code: cause,
      shift,
      change_date: changeDate,
      change_time: changeTime,
      change_user: changeUser,
      merge_code: mergeCode
    });

    if (batch.length >= BATCH_SIZE) {
      await db.batchInsertSandRecords(batch);
      totalProcessed += batch.length;
      batch = [];

      if (onProgress) {
        onProgress(totalProcessed);
      } else {
        process.stdout.write(`\r⏳ 已成功寫入資料庫：${totalProcessed.toLocaleString()} 筆...`);
      }
    }
  }

  // 寫入剩餘批次
  if (batch.length > 0) {
    await db.batchInsertSandRecords(batch);
    totalProcessed += batch.length;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n====================================================`);
  console.log(`🎉 鐵砂 CSV 匯入成功！`);
  console.log(`📊 總匯入筆數: ${totalProcessed.toLocaleString()} 筆`);
  console.log(`⏱️ 總耗時: ${durationSec} 秒 (平均 ${(totalProcessed / durationSec).toFixed(0)} 筆/秒)`);
  console.log(`====================================================\n`);

  return {
    success: true,
    totalRecords: totalProcessed,
    durationSeconds: parseFloat(durationSec)
  };
}

// 若由命令列直接執行
if (require.main === module) {
  (async () => {
    try {
      await db.ready();
      await importSandCsv({ resetBefore: true });
      process.exit(0);
    } catch (err) {
      console.error('\n❌ 匯入過程發生錯誤:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  importSandCsv,
  findCsvPath
};
