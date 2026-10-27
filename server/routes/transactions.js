const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * 輔助函式：產生唯一交易單號
 */
function generateTxNo(prefix) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TX-${prefix}-${dateStr}-${rand}`;
}

/**
 * [GET] /api/transactions - 查詢進出庫紀錄
 */
router.get('/', async (req, res) => {
  try {
    const { status, type } = req.query;

    let sql = `
      SELECT t.*, m.name as material_name, m.code as material_code, m.unit as material_unit, m.category as material_category, m.stock_quantity as current_stock
      FROM inventory_transactions t
      JOIN materials m ON t.material_id = m.id
      WHERE 1=1
    `;
    let params = [];

    if (status && status !== 'all') {
      sql += ' AND t.status = ?';
      params.push(status);
    }

    if (type && type !== 'all') {
      sql += ' AND t.type = ?';
      params.push(type);
    }

    sql += ' ORDER BY t.created_at DESC LIMIT 100';

    const records = await db.query(sql, params);
    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    console.error('查詢交易紀錄失敗:', error);
    res.status(500).json({ success: false, message: '查詢交易紀錄失敗' });
  }
});

/**
 * [POST] /api/transactions/inbound - 進貨登記 (直接入庫並更新庫存)
 */
router.post('/inbound', authenticateToken, async (req, res) => {
  try {
    const { material_id, quantity, department, purpose, batch_no, expire_date } = req.body;

    const matId = parseInt(material_id, 10);
    const qty = parseFloat(quantity);

    if (!matId || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: '請選擇有效物料並輸入大於 0 的入庫數量' });
    }

    const mat = await db.get('SELECT * FROM materials WHERE id = ?', [matId]);
    if (!mat) {
      return res.status(404).json({ success: false, message: '找不到該物料' });
    }

    const txNo = generateTxNo('IN');
    const applicant = req.user.username;

    // 1. 寫入進貨紀錄
    await db.run(`
      INSERT INTO inventory_transactions 
      (transaction_no, material_id, type, quantity, user_id, applicant_name, department, purpose, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      txNo,
      matId,
      '進貨入庫',
      qty,
      req.user.id,
      applicant,
      department || '採購進料組',
      purpose || '正常補貨驗收入庫',
      '已核准'
    ]);

    // 2. 增加物料庫存 (若有新批號或過期日則同步更新)
    let updateSql = 'UPDATE materials SET stock_quantity = stock_quantity + ?';
    let updateParams = [qty];

    if (batch_no) {
      updateSql += ', batch_no = ?';
      updateParams.push(batch_no.trim());
    }
    if (expire_date) {
      updateSql += ', expire_date = ?';
      updateParams.push(expire_date);
    }

    updateSql += ' WHERE id = ?';
    updateParams.push(matId);

    await db.run(updateSql, updateParams);

    res.status(201).json({
      success: true,
      message: `🎉 入庫成功！單號：${txNo}，已累計庫存 +${qty} ${mat.unit}`,
      transactionNo: txNo
    });
  } catch (error) {
    console.error('進貨失敗:', error);
    res.status(500).json({ success: false, message: '進貨登記失敗' });
  }
});

/**
 * [POST] /api/transactions/requisition - 提交生產領料出庫申請 (產線技術員)
 */
router.post('/requisition', authenticateToken, async (req, res) => {
  try {
    const { material_id, quantity, department, purpose } = req.body;

    const matId = parseInt(material_id, 10);
    const qty = parseFloat(quantity);

    if (!matId || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: '請選擇物料並填寫正確領料數量' });
    }

    const mat = await db.get('SELECT * FROM materials WHERE id = ?', [matId]);
    if (!mat) {
      return res.status(404).json({ success: false, message: '找不到該物料' });
    }

    if (mat.stock_quantity < qty) {
      return res.status(400).json({
        success: false,
        message: `⚠️ 目前庫存僅存 ${mat.stock_quantity} ${mat.unit}，不足申請數量 ${qty} ${mat.unit}`
      });
    }

    const txNo = generateTxNo('OUT');
    const applicant = req.user.username;

    // 建立待審核領料單 (狀態為 待審核，尚未真正扣庫存)
    await db.run(`
      INSERT INTO inventory_transactions 
      (transaction_no, material_id, type, quantity, user_id, applicant_name, department, purpose, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      txNo,
      matId,
      '生產領料',
      qty,
      req.user.id,
      applicant,
      department || '產線生產組',
      purpose || '產線工單耗用領料',
      '待審核'
    ]);

    res.status(201).json({
      success: true,
      message: `📋 領料申請已送出！單號：${txNo}，等待倉管主管審核中。`,
      transactionNo: txNo
    });
  } catch (error) {
    console.error('領料申請失敗:', error);
    res.status(500).json({ success: false, message: '領料申請處理失敗' });
  }
});

/**
 * [POST] /api/transactions/:id/review - 審核領料申請 (核准或駁回，限管理員)
 */
router.post('/:id/review', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const txId = parseInt(req.params.id, 10);
    const { action, comment } = req.body; // action: 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: '無效的審核動作' });
    }

    const tx = await db.get('SELECT * FROM inventory_transactions WHERE id = ?', [txId]);
    if (!tx) {
      return res.status(404).json({ success: false, message: '找不到該領料單據' });
    }

    if (tx.status !== '待審核') {
      return res.status(400).json({ success: false, message: `此單據已被處理為 [${tx.status}]，不可重複審核` });
    }

    if (action === 'reject') {
      await db.run(`
        UPDATE inventory_transactions 
        SET status = '已駁回', reviewer_id = ?, review_comment = ? 
        WHERE id = ?
      `, [req.user.id, comment || '主管審核不予通過', txId]);

      return res.json({ success: true, message: '單據已駁回' });
    }

    // 核准流程：檢查目前庫存是否足夠
    const mat = await db.get('SELECT * FROM materials WHERE id = ?', [tx.material_id]);
    if (mat.stock_quantity < tx.quantity) {
      return res.status(400).json({
        success: false,
        message: `庫存不足無法核准！現存 ${mat.stock_quantity} ${mat.unit}，領料需求 ${tx.quantity} ${mat.unit}`
      });
    }

    // 1. 扣除物料庫存
    await db.run('UPDATE materials SET stock_quantity = stock_quantity - ? WHERE id = ?', [
      tx.quantity,
      tx.material_id
    ]);

    // 2. 更新單據為已核准
    await db.run(`
      UPDATE inventory_transactions 
      SET status = '已核准', reviewer_id = ?, review_comment = ? 
      WHERE id = ?
    `, [req.user.id, comment || '審核通過，准予出庫', txId]);

    res.json({
      success: true,
      message: `✅ 審核完成！單號 ${tx.transaction_no} 已核准出庫，庫存已扣除 ${tx.quantity} ${mat.unit}`
    });
  } catch (error) {
    console.error('審核失敗:', error);
    res.status(500).json({ success: false, message: '審核作業發生錯誤' });
  }
});

/**
 * [GET] /api/transactions/statistics - 智能庫存看板統計數據
 */
router.get('/statistics', async (req, res) => {
  try {
    const totalMaterials = await db.get('SELECT COUNT(*) as count FROM materials');
    
    // 紡絲助劑統計
    const saStat = await db.get(`
      SELECT COUNT(*) as count, COALESCE(SUM(stock_quantity), 0) as total_stock 
      FROM materials WHERE category = '紡絲助劑'
    `);

    // 鐵砂耗材統計
    const isStat = await db.get(`
      SELECT COUNT(*) as count, COALESCE(SUM(stock_quantity), 0) as total_stock 
      FROM materials WHERE category = '鐵砂耗材'
    `);

    // 低庫存警戒品項數
    const lowStockStat = await db.get(`
      SELECT COUNT(*) as count FROM materials WHERE stock_quantity <= safety_stock
    `);

    // 即期助劑品項數 (30天內)
    const expiringStat = await db.get(`
      SELECT COUNT(*) as count FROM materials 
      WHERE expire_date IS NOT NULL AND expire_date <= date('now', '+30 days')
    `);

    // 待審核單據數
    const pendingReview = await db.get(`
      SELECT COUNT(*) as count FROM inventory_transactions WHERE status = '待審核'
    `);

    res.json({
      success: true,
      data: {
        totalMaterials: totalMaterials.count,
        spinningAuxiliaries: {
          count: saStat.count,
          totalStock: saStat.total_stock
        },
        ironSand: {
          count: isStat.count,
          totalStock: isStat.total_stock
        },
        lowStockAlertCount: lowStockStat.count,
        expiringAlertCount: expiringStat.count,
        pendingReviewCount: pendingReview.count
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '讀取統計資料失敗' });
  }
});

module.exports = router;
