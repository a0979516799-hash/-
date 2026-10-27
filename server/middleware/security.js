const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const db = require('../config/database');

/**
 * 1. 強化 HTTP 安全標頭 (Helmet)
 * 防禦點擊劫持 (Clickjacking)、MIME 嗅探、主動啟用 CSP 內容安全政策
 */
const configureHelmet = () => {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*"],
      },
    },
    crossOriginEmbedderPolicy: false, // 允許載入 CDN 資源
  });
};

/**
 * 2. 跨來源資源共享防護 (CORS)
 * 限制只有受信任的前端 Origin 能發送請求，阻絕惡意未授權跨站呼叫
 */
const configureCors = () => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
  return cors({
    origin: (origin, callback) => {
      // 允許本機同源 (無 origin) 或在允許清單內的請求 (支援 IDE Live Preview 任意 port)
      if (!origin || origin === allowedOrigin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
      } else {
        callback(new Error('CORS 政策拒絕：未授權的外部網域請求'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
};

/**
 * 3. 速率限制 (Rate Limiting) - 防範暴力破解與 DoS 阻斷服務
 */
// 一般 API：每 15 分鐘最多 300 次
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: '⚠️ 請求次數過於頻繁，系統已啟動流量限制防護，請於 15 分鐘後再試。'
  }
});

// 敏感認證 (登入/註冊)：每 15 分鐘最多 15 次失敗嘗試，徹底抵禦字典檔暴力密碼破解
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    const ip = req.ip || req.connection.remoteAddress;
    db.logSecurityEvent(ip, 'BRUTE_FORCE_BLOCKED', `偵測到來自 ${ip} 的登入嘗試頻率超標，觸發防禦封鎖。`);
    res.status(429).json({
      success: false,
      message: '🚨 登入嘗試次數過多，為確保帳戶安全已暫時限制此 IP 的存取，請稍後重試。'
    });
  }
});

/**
 * 4. 惡意攻擊特徵即時偵測中介軟體 (WAF 輕量檢測)
 * 主動攔截並記錄 SQL Injection 與 XSS 特徵字串
 */
const attackDetectionMiddleware = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const rawTarget = JSON.stringify(req.body) + ' ' + JSON.stringify(req.query);

  // 常見的 SQL Injection 試探特徵 (僅用於安全審計記錄)
  const sqliPattern = /(\b(SELECT|UNION|INSERT|UPDATE|DELETE|DROP|ALTER|EXEC|ORDER\s+BY)\b|('|\bOR\b.*=.*--|\bAND\b.*=.*--|--|\/\*|\*\/))/i;
  
  // 常見的 XSS 惡意腳本特徵
  const xssPattern = /(<script[\s\S]*?>[\s\S]*?<\/script>|javascript:|onerror\s*=|onload\s*=|onclick\s*=)/i;

  if (sqliPattern.test(rawTarget) && !req.path.includes('/vulnerable-demo')) {
    db.logSecurityEvent(ip, 'SQLI_ATTEMPT_DETECTED', `偵測到疑似 SQL 注入惡意特徵: ${rawTarget.slice(0, 100)}`);
  }

  if (xssPattern.test(rawTarget)) {
    db.logSecurityEvent(ip, 'XSS_ATTEMPT_DETECTED', `偵測到疑似 XSS 跨站腳本特徵: ${rawTarget.slice(0, 100)}`);
  }

  next();
};

module.exports = {
  configureHelmet,
  configureCors,
  generalLimiter,
  authLimiter,
  attackDetectionMiddleware
};
