const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * [GET] /api/consumption - 直接讀取主管資料庫 BarmagSqlQC 的 dbo.ConsumptionSummary_Table
 */
router.get('/', async (req, res) => {
  try {
    const rawRecords = await db.getConsumptionSummaryTable();

    // 格式標準化 (相容 MS SQL 大小寫與 SQLite 欄位名稱)
    const normalized = (rawRecords || []).map((r, idx) => {
      // 處理可能的不同欄位命名習慣 (支援 MS SQL 真實中文欄位與英文欄位)
      const oilType = r['油種'] || r.oil_type || r.Oil_Type || r.OilType || r.oilType || '未知油種';
      const machineNo = String(r['機台'] || r.machine_no || r.Machine_No || r.MachineNo || r.machineNo || '001');
      const startDate = r['開始日期'] || r.start_date || r.Start_Date || r.StartDate || '2026-05-19';
      const endDate = r['結束日期'] || r.end_date || r.End_Date || r.EndDate || '2026-05-21';
      const emulsion = parseFloat(r['該油種_油水總耗量'] || r.emulsion_consumption || r.Emulsion_Consumption || r.EmulsionConsumption || 0);
      const neat = parseFloat(r['該油種_原油總耗量'] || r.neat_oil_consumption || r.Neat_Oil_Consumption || r.NeatOilConsumption || 0);

      const sDate = typeof startDate === 'object' ? startDate.toISOString().slice(0, 10) : String(startDate).slice(0, 10);
      const eDate = typeof endDate === 'object' ? endDate.toISOString().slice(0, 10) : String(endDate).slice(0, 10);
      const d1 = new Date(sDate);
      const d2 = new Date(eDate);
      const days = Math.max(1, Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
      const dailyNeat = parseFloat((neat / days).toFixed(4));
      const dailyEmulsion = parseFloat((emulsion / days).toFixed(4));

      return {
        id: r.id || (idx + 1),
        oil_type: oilType,
        machine_no: machineNo,
        start_date: sDate,
        end_date: eDate,
        days: days,
        emulsion_consumption: emulsion,
        neat_oil_consumption: neat,
        daily_neat_oil_consumption: dailyNeat,
        daily_emulsion_consumption: dailyEmulsion
      };
    });

    res.json({
      success: true,
      source: db.type === 'mssql' ? 'dbo.ConsumptionSummary_Table (主管 MS SQL 直連)' : 'daily_oil_consumptions (SQLite 備援)',
      databaseEngine: db.type,
      count: normalized.length,
      data: normalized
    });
  } catch (error) {
    console.error('查詢機台耗量失敗:', error);
    res.status(500).json({ success: false, message: '查詢機台耗量失敗: ' + error.message });
  }
});

module.exports = router;
