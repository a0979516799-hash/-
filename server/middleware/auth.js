const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_dev_secret_key';

/**
 * 身分驗證中介軟體 (驗證 JWT Token)
 * 防禦未授權存取 (OWASP: Broken Authentication)
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: '🔒 存取遭拒：請先登入取得授權憑證 (Token)'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: '⛔ 權限無效：憑證已過期或被竄改，請重新登入'
      });
    }

    req.user = user; // 附加登入者資訊至請求物件 (id, username, role)
    next();
  });
};

/**
 * 權限控管中介軟體 (防範越權存取 / IDOR / Broken Access Control)
 * @param {string} requiredRole - 需要的最低角色權限
 */
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== requiredRole) {
      return res.status(403).json({
        success: false,
        message: `⛔ 越權存取阻擋：此操作僅限具有 [${requiredRole}] 權限之管理員執行`
      });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole
};
