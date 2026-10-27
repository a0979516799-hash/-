const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * [GET] /api/materials - 查詢物料清單 (支援參數化安全篩選)
 * 參數：
 * - category: '紡絲助劑' | '鐵砂耗材' | 'all'
 * - keyword: 關鍵字 (代碼、名稱、批號、儲位)
 * - filter: 'low_stock' (低庫存) | 'expiring' (即期品)
 */
router.get('/', async (req, res) => {
  try {
    const { category, keyword, filter } = req.query;

    let sql = 'SELECT * FROM materials WHERE 1=1';
    let params = [];

    // 1. 類別篩選 (參數化綁定)
    if (category && category !== 'all') {
      sql += ' AND category = ?';
      params.push(category);
    }

    // 2. 關鍵字模糊查詢 (全參數化防 SQL 注入)
    if (keyword && keyword.trim()) {
      const kw = `%${keyword.trim()}%`;
      sql += ' AND (code LIKE ? OR name LIKE ? OR batch_no LIKE ? OR location LIKE ?)';
      params.push(kw, kw, kw, kw);
    }

    // 3. 智能庫存狀態篩選
    if (filter === 'low_stock') {
      sql += ' AND stock_quantity <= safety_stock';
    } else if (filter === 'expiring') {
      // 30 天內即將過期或已過期
      sql += " AND expire_date IS NOT NULL AND expire_date <= date('now', '+30 days')";
    }

    sql += ' ORDER BY category ASC, id ASC';

    const materials = await db.query(sql, params);

    // 標記智能預警狀態
    const today = new Date();
    const alertDays = 30 * 24 * 60 * 60 * 1000;

    const enriched = materials.map(mat => {
      const isLowStock = mat.stock_quantity <= mat.safety_stock;
      let isExpiringSoon = false;
      let isExpired = false;

      if (mat.expire_date) {
        const exp = new Date(mat.expire_date);
        const diff = exp - today;
        if (diff < 0) {
          isExpired = true;
        } else if (diff <= alertDays) {
          isExpiringSoon = true;
        }
      }

      return {
        ...mat,
        is_low_stock: isLowStock,
        is_expiring_soon: isExpiringSoon,
        is_expired: isExpired
      };
    });

    res.json({
      success: true,
      count: enriched.length,
      data: enriched
    });
  } catch (error) {
    console.error('查詢物料失敗:', error);
    res.status(500).json({ success: false, message: '查詢物料資料失敗' });
  }
});

/**
 * [GET] /api/materials/:id - 取得單筆物料詳情
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const material = await db.get('SELECT * FROM materials WHERE id = ?', [id]);
    if (!material) {
      return res.status(404).json({ success: false, message: '找不到指定物料' });
    }
    res.json({ success: true, data: material });
  } catch (error) {
    res.status(500).json({ success: false, message: '取得資料失敗' });
  }
});

/**
 * [POST] /api/materials - 新增物料主檔 (限管理員)
 */
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { code, name, category, spec, batch_no, stock_quantity, safety_stock, unit, location, expire_date, hazard_level } = req.body;

    if (!code || !name || !category) {
      return res.status(400).json({ success: false, message: '物料編號、品名與分類為必填欄位' });
    }

    // 檢查編號是否重複 (參數化查詢)
    const existing = await db.get('SELECT id FROM materials WHERE code = ?', [code.trim()]);
    if (existing) {
      return res.status(409).json({ success: false, message: '該物料代碼已存在' });
    }

    const result = await db.run(`
      INSERT INTO materials (code, name, category, spec, batch_no, stock_quantity, safety_stock, unit, location, expire_date, hazard_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      code.trim(),
      name.trim(),
      category,
      spec || '',
      batch_no || '',
      parseFloat(stock_quantity) || 0,
      parseFloat(safety_stock) || 100,
      unit || 'KG',
      location || '',
      expire_date || null,
      hazard_level || '普通'
    ]);

    res.status(201).json({
      success: true,
      message: '物料規格已安全寫入主檔',
      materialId: result.id
    });
  } catch (error) {
    console.error('新增物料失敗:', error);
    res.status(500).json({ success: false, message: '新增物料失敗' });
  }
});

/**
 * [PUT] /api/materials/:id - 更新物料庫存警戒或儲位 (限管理員)
 */
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { safety_stock, location, spec, hazard_level } = req.body;

    await db.run(`
      UPDATE materials 
      SET safety_stock = ?, location = ?, spec = ?, hazard_level = ?
      WHERE id = ?
    `, [
      parseFloat(safety_stock) || 100,
      location || '',
      spec || '',
      hazard_level || '普通',
      id
    ]);

    res.json({ success: true, message: '物料設定已成功更新' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失敗' });
  }
});

/**
 * [POST] /api/materials/deduct - 扣除單項或多項庫存 (支援生產耗量扣除)
 */
router.post('/deduct', async (req, res) => {
  try {
    const { code, amount, reason } = req.body;
    const deductQty = parseFloat(amount);
    if (!code || isNaN(deductQty) || deductQty <= 0) {
      return res.status(400).json({ success: false, message: '請提供有效的物料代碼與扣除數量' });
    }

    const mat = await db.get('SELECT * FROM materials WHERE code = ?', [code]);
    if (!mat) {
      return res.status(404).json({ success: false, message: `找不到代碼為 [${code}] 的物料` });
    }

    const newStock = Math.max(0, parseFloat((mat.stock_quantity - deductQty).toFixed(2)));
    await db.run('UPDATE materials SET stock_quantity = ? WHERE id = ?', [newStock, mat.id]);

    // 寫入交易紀錄
    const txNo = `TX-OUT-${Date.now().toString().slice(-6)}`;
    await db.run(`
      INSERT INTO inventory_transactions (tx_no, material_id, type, quantity, unit, department, purpose, status, operator)
      VALUES (?, ?, 'OUT', ?, ?, '生產車間', ?, '已完成', '系統自動扣除')
    `, [txNo, mat.id, deductQty, mat.unit || 'KG', reason || '每日生產耗量扣除']);

    res.json({
      success: true,
      message: `✅ [${code}] 成功扣除 ${deductQty} ${mat.unit}，目前庫存: ${newStock}`,
      newStock
    });
  } catch (error) {
    console.error('扣除庫存失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * [POST] /api/materials/restock - 到貨入庫回補
 */
router.post('/restock', async (req, res) => {
  try {
    const { code, amount, batchNo } = req.body;
    const addQty = parseFloat(amount);
    if (!code || isNaN(addQty) || addQty <= 0) {
      return res.status(400).json({ success: false, message: '請提供有效的物料代碼與入庫數量' });
    }

    const mat = await db.get('SELECT * FROM materials WHERE code = ?', [code]);
    if (!mat) {
      return res.status(404).json({ success: false, message: `找不到代碼為 [${code}] 的物料` });
    }

    const newStock = parseFloat((mat.stock_quantity + addQty).toFixed(2));
    await db.run('UPDATE materials SET stock_quantity = ? WHERE id = ?', [newStock, mat.id]);

    // 寫入交易紀錄
    const txNo = `TX-IN-${Date.now().toString().slice(-6)}`;
    await db.run(`
      INSERT INTO inventory_transactions (tx_no, material_id, type, quantity, unit, department, purpose, batch_no, status, operator)
      VALUES (?, ?, 'IN', ?, ?, '原料倉儲', '到貨驗收入庫回補', ?, '已完成', '倉管員')
    `, [txNo, mat.id, addQty, mat.unit || 'KG', batchNo || 'AUTO-RESTOCK']);

    res.json({
      success: true,
      message: `✅ [${code}] 成功回補 ${addQty} ${mat.unit}，目前庫存: ${newStock}`,
      newStock
    });
  } catch (error) {
    console.error('回補庫存失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * [POST] /api/materials/batch-sync - 批次同步前端設定至資料庫
 */
router.post('/batch-sync', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items 必須為陣列' });
    }

    for (const item of items) {
      if (item.code) {
        await db.run(`
          UPDATE materials 
          SET stock_quantity = COALESCE(?, stock_quantity),
              safety_stock = COALESCE(?, safety_stock),
              lead_time = COALESCE(?, lead_time)
          WHERE code = ?
        `, [
          item.currentStock !== undefined ? parseFloat(item.currentStock) : null,
          item.safetyStock !== undefined ? parseFloat(item.safetyStock) : null,
          item.leadTime !== undefined ? parseInt(item.leadTime, 10) : null,
          item.code
        ]);
      }
    }

    res.json({ success: true, message: '資料庫物料數據同步完成' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
