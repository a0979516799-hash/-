const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { authLimiter } = require('../middleware/security');
const { authenticateToken } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_dev_secret_key';

/**
 * 密碼強度檢驗函式 (防範弱密碼)
 */
function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return '密碼長度至少需為 8 個字元。';
  }
  if (!/[A-Z]/.test(password)) {
    return '密碼需包含至少一個大寫英文字母。';
  }
  if (!/[a-z]/.test(password)) {
    return '密碼需包含至少一個小寫英文字母。';
  }
  if (!/[0-9]/.test(password)) {
    return '密碼需包含至少一個數字。';
  }
  return null;
}

/**
 * [POST] /api/auth/register - 安全註冊
 * 防護重點：
 * 1. 密碼強度防禦
 * 2. Bcrypt 10 輪加鹽雜湊 (不儲存明文)
 * 3. 參數化查詢杜絕 SQL 注入
 */
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, password, email } = req.body;

    // 1. 輸入驗證 (Input Validation)
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: '帳號名稱至少需為 3 個字元以上'
      });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = (email && typeof email === 'string') ? email.trim() : null;

    // 2. 檢查帳號是否已存在 (使用參數化查詢)
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [cleanUsername]);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: '該帳號名稱已被註冊，請更換其他帳號'
      });
    }

    // 3. 密碼安全雜湊 (Salt + Hash)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 4. 寫入資料庫 (安全參數化寫入)
    const result = await db.run(
      'INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)',
      [cleanUsername, passwordHash, cleanEmail, 'user']
    );

    res.status(201).json({
      success: true,
      message: '🎉 註冊成功！密碼已安全以 Bcrypt 加鹽雜湊技術加密儲存。',
      userId: result.id
    });
  } catch (error) {
    console.error('註冊錯誤:', error);
    res.status(500).json({
      success: false,
      message: '伺服器內部錯誤，請稍候重試'
    });
  }
});

/**
 * [POST] /api/auth/login - 安全登入
 * 防護重點：
 * 1. Rate Limiting 頻率限制 (阻絕暴力破解)
 * 2. 參數化帳號查詢 (防 ' OR '1'='1 繞過)
 * 3. Bcrypt 定時比對函式 (防 Timing Attack 時序攻擊)
 * 4. 簽發 JWT Token，不回傳密碼 Hash
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '請輸入帳號與密碼'
      });
    }

    // 1. 參數化查詢使用者 (從根本防範登入繞過 SQL 注入)
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);

    // 2. 安全模糊比對 (若使用者不存在仍執行假雜湊比對，防止透過回應時間差探測帳號是否存在)
    if (!user) {
      await bcrypt.compare('dummy_password_timing_defense', '$2a$10$abcdefghijklmnopqrstuvwxyz123456789012345678901234567890');
      return res.status(401).json({
        success: false,
        message: '帳號或密碼錯誤，請重新確認'
      });
    }

    // 3. 驗證密碼雜湊
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: '帳號或密碼錯誤，請重新確認'
      });
    }

    // 4. 簽發短期安全 JWT 憑證
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: '2h', // 2 小時有效期
      algorithm: 'HS256'
    });

    res.json({
      success: true,
      message: '🎉 登入成功！已通過安全身分認證。',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('登入錯誤:', error);
    res.status(500).json({
      success: false,
      message: '伺服器內部錯誤，請稍候重試'
    });
  }
});

/**
 * [GET] /api/auth/me - 取得當前已登入使用者個人資訊
 * 防護重點：必須具備有效 JWT 憑證才能存取
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: '找不到此使用者' });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '伺服器內部錯誤' });
  }
});

module.exports = router;
