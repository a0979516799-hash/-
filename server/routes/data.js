const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * 輔助函式：自前端 Header 嘗試解析 optional token
 */
function getOptionalUser(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const jwt = require('jsonwebtoken');
    try {
      return jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'fallback_dev_secret_key');
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * [GET] /api/data/notes - 讀取文章/筆記列表
 * 安全防護：
 * 1. 僅公開非機密項目 (is_secret = 0)
 * 2. 若登入，可同時查看自己的機密筆記
 * 3. 嚴禁越權讀取他人的機密資料 (防 IDOR 漏洞)
 */
router.get('/notes', async (req, res) => {
  try {
    const user = getOptionalUser(req);

    let sql;
    let params = [];

    if (user && user.role === 'admin') {
      // 管理員可檢視全部
      sql = `
        SELECT notes.*, users.username as author_name 
        FROM notes 
        JOIN users ON notes.user_id = users.id 
        ORDER BY notes.created_at DESC
      `;
    } else if (user) {
      // 已登入一般使用者：公開項目 + 自己的私密筆記 (使用參數化防禦)
      sql = `
        SELECT notes.*, users.username as author_name 
        FROM notes 
        JOIN users ON notes.user_id = users.id 
        WHERE notes.is_secret = 0 OR notes.user_id = ? 
        ORDER BY notes.created_at DESC
      `;
      params = [user.id];
    } else {
      // 未登入訪客：僅能檢視非機密公開筆記
      sql = `
        SELECT notes.*, users.username as author_name 
        FROM notes 
        JOIN users ON notes.user_id = users.id 
        WHERE notes.is_secret = 0 
        ORDER BY notes.created_at DESC
      `;
    }

    const notes = await db.query(sql, params);
    res.json({
      success: true,
      count: notes.length,
      data: notes
    });
  } catch (error) {
    console.error('查詢筆記失敗:', error);
    res.status(500).json({ success: false, message: '讀取資料失敗' });
  }
});

/**
 * [GET] /api/data/notes/search - 安全關鍵字搜尋 (示範防範 SQL Injection)
 * 正確安全寫法：使用 LIKE ? 並將 % 放在參數陣列中，絕對不把使用者輸入字串拼入 SQL！
 */
router.get('/notes/search', async (req, res) => {
  try {
    const keyword = (req.query.q || '').trim();

    if (!keyword) {
      return res.json({ success: true, data: [] });
    }

    // 【最安全實作】：參數化查詢，就算輸入 ' OR '1'='1 或 DROP TABLE 也會被視為純文字比對
    const searchPattern = `%${keyword}%`;
    const sql = `
      SELECT notes.*, users.username as author_name 
      FROM notes 
      JOIN users ON notes.user_id = users.id 
      WHERE (notes.title LIKE ? OR notes.content LIKE ?) AND notes.is_secret = 0
      ORDER BY notes.created_at DESC
    `;

    const results = await db.query(sql, [searchPattern, searchPattern]);

    res.json({
      success: true,
      mode: 'SECURE_PARAMETERIZED_QUERY',
      queryExecutedSafely: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    console.error('搜尋失敗:', error);
    res.status(500).json({ success: false, message: '搜尋過程發生錯誤' });
  }
});

/**
 * [POST] /api/data/notes - 新增筆記 (需登入驗證)
 */
router.post('/notes', authenticateToken, async (req, res) => {
  try {
    const { title, content, is_secret } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: '標題與內容皆為必填項目' });
    }

    // 限制長度，防範過大 Payload 消耗伺服器資源
    if (title.length > 100 || content.length > 2000) {
      return res.status(400).json({ success: false, message: '標題或內容長度超出允許限制' });
    }

    const secretFlag = is_secret ? 1 : 0;

    const result = await db.run(
      'INSERT INTO notes (user_id, title, content, is_secret) VALUES (?, ?, ?, ?)',
      [req.user.id, title.trim(), content.trim(), secretFlag]
    );

    res.status(201).json({
      success: true,
      message: '筆記已安全建立',
      noteId: result.id
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '新增失敗' });
  }
});

/**
 * [DELETE] /api/data/notes/:id - 刪除筆記
 * 防護重點：【修復 IDOR / 越權存取漏洞】
 * 嚴禁僅憑 id 刪除，必須同時驗證 user_id 是否為本人（或是否具備 admin 權限）！
 */
router.delete('/notes/:id', authenticateToken, async (req, res) => {
  try {
    const noteId = parseInt(req.params.id, 10);
    if (isNaN(noteId)) {
      return res.status(400).json({ success: false, message: '無效的項目識別碼' });
    }

    // 1. 查詢目標筆記確認歸屬
    const note = await db.get('SELECT * FROM notes WHERE id = ?', [noteId]);
    if (!note) {
      return res.status(404).json({ success: false, message: '找不到該筆記' });
    }

    // 2. 嚴格權限檢查 (Broken Access Control 防護)
    if (note.user_id !== req.user.id && req.user.role !== 'admin') {
      const ip = req.ip || req.connection.remoteAddress;
      db.logSecurityEvent(ip, 'UNAUTHORIZED_DELETION_ATTEMPT', `使用者 ${req.user.username} 嘗試越權刪除不屬於自己的筆記 ID: ${noteId}`);
      return res.status(403).json({
        success: false,
        message: '⛔ 權限不足：您無權刪除其他使用者的私密資料 (已記錄越權操作)'
      });
    }

    // 3. 安全參數化刪除
    await db.run('DELETE FROM notes WHERE id = ?', [noteId]);

    res.json({
      success: true,
      message: '✅ 資料已成功安全刪除'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '刪除失敗' });
  }
});

/**
 * [GET] /api/data/security-logs - 安全稽核日誌 (僅限 admin 管理員存取)
 * 防護重點：RBAC 角色存取控制
 */
router.get('/security-logs', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const logs = await db.query('SELECT * FROM security_logs ORDER BY created_at DESC LIMIT 50');
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '讀取日誌失敗' });
  }
});

/**
 * ========================================================
 * 專題口試演示專用端點 (安全對比展示)
 * ========================================================
 */

/**
 * [POST] /api/demo/sqli-comparison - SQL 注入攻擊前後對比演示
 * 展示當惡意輸入 "' OR '1'='1" 時：
 * 1. 脆弱寫法 (字串拼接) 為何會外洩所有機密
 * 2. 安全寫法 (參數化查詢) 如何完美防禦
 */
router.post('/demo/sqli-comparison', async (req, res) => {
  const userInput = req.body.input || '';

  try {
    // 1. 安全做法 (參數化查詢 - 永遠安全)
    const secureParams = [`%${userInput}%`];
    const secureSqlTemplate = `SELECT id, title, content, is_secret FROM notes WHERE title LIKE ? AND is_secret = 0`;
    const secureResults = await db.query(secureSqlTemplate, secureParams);

    // 2. 脆弱做法模擬 (僅供教學展示)
    // 傳統不安全寫法：直接拼接字串
    const dangerousSql = `SELECT id, title, content, is_secret FROM notes WHERE title LIKE '%${userInput}%'`;
    let dangerousResults = [];
    let dangerousError = null;

    try {
      dangerousResults = await db.vulnerableQueryUnsafe(dangerousSql);
    } catch (e) {
      dangerousError = e.message;
    }

    // 檢查脆弱版本是否因此洩漏了機密資料 (is_secret = 1)
    const secretLeaked = dangerousResults.some(item => item.is_secret === 1);

    res.json({
      success: true,
      userInput,
      safeArchitecture: {
        method: 'Prepared Statements (參數化查詢 / 預編譯)',
        sqlExecuted: 'SELECT id, title, content, is_secret FROM notes WHERE title LIKE ? AND is_secret = 0',
        boundParameter: secureParams,
        resultCount: secureResults.length,
        results: secureResults,
        status: '✅ 攻擊無效！惡意字元被當作普通文字比對，機密資料完好無損。'
      },
      vulnerableArchitecture: {
        method: 'Raw String Concatenation (傳統危險字串拼接)',
        sqlExecuted: dangerousSql,
        resultCount: dangerousResults.length,
        results: dangerousResults,
        error: dangerousError,
        secretLeaked: secretLeaked,
        status: secretLeaked 
          ? '🚨 嚴重漏洞！SQL 語法遭竄改，機密資料已完全外洩！' 
          : '⚠️ 此寫法存在高風險注入隱患。'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
