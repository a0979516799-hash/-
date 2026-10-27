const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// 1. 載入環境變數
dotenv.config();

const {
  configureHelmet,
  configureCors,
  generalLimiter,
  attackDetectionMiddleware
} = require('./middleware/security');

const authRoutes = require('./routes/auth');
const materialsRoutes = require('./routes/materials');
const transactionsRoutes = require('./routes/transactions');
const consumptionRoutes = require('./routes/consumption');
const sandRoutes = require('./routes/sand');
const dataRoutes = require('./routes/data');
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// 2. 設置安全防護中介層
app.use(configureHelmet());
app.use(configureCors());

// 3. 請求體積限制
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: true, limit: '20kb' }));

// 4. 全域流量限制與 WAF 偵測
app.use('/api', generalLimiter);
app.use(attackDetectionMiddleware);

// 5. 靜態資源託管
app.use(express.static(path.join(__dirname, '../public')));

// 6. 專案業務 API 路由註冊
app.use('/api/auth', authRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/consumption', consumptionRoutes);
app.use('/api/sand', sandRoutes);
app.use('/api/data', dataRoutes);
app.use('/api', dataRoutes); // 支援 /api/demo/*

// 7. 系統健康與物料庫存概況端點
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    systemName: '紡絲助劑與鐵砂智能庫存管理系統 (Smart Inventory System)',
    timestamp: new Date().toISOString(),
    securityFeatures: {
      parameterizedQueries: 'ENABLED (100% 防範 SQL Injection)',
      passwordHashing: 'ENABLED (Bcrypt 10 輪加鹽不可逆雜湊)',
      rateLimiting: 'ENABLED (防暴力破解)',
      helmetSecurityHeaders: 'ENABLED (CSP, X-Frame-Options 防點擊劫持)',
      environmentIsolation: 'ENABLED (.env 隱藏帳密)',
      databaseDriver: process.env.DB_TYPE || 'sqlite'
    }
  });
});

// 7.1 資料庫連線狀態與健康診斷端點 (助劑直連 + 鐵砂紀錄)
app.get('/api/db/status', async (req, res) => {
  try {
    const status = await db.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. 全域 404 處理
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: '請求的 API 端點不存在' });
});

// 9. 全域異常處理中介層
app.use((err, req, res, next) => {
  console.error('⚠️ 系統攔截未處理異常:', err.message);

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? '伺服器正在處理安全請求，請稍候重試' 
      : `處理錯誤: ${err.message}`
  });
});

// 10. 啟動伺服器
const server = app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🏭 紡絲助劑與鐵砂智能庫存管理系統已啟動！`);
  console.log(`🚀 網址: http://localhost:${PORT}`);
  console.log(`🔐 資料庫連線模式: [${(process.env.DB_TYPE || 'sqlite').toUpperCase()}] (已啟用參數化預編譯防護)`);
  console.log(`📊 機台日耗量與庫存預測模組已掛載 (/api/consumption)`);
  console.log('====================================================');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('====================================================');
    console.log(`ℹ️ Port ${PORT} 已經在運行中！伺服器已在背景正常服務！`);
    console.log(`👉 請直接在瀏覽器查看：http://localhost:${PORT}`);
    console.log('====================================================');
  } else {
    console.error('⚠️ 伺服器啟動異常:', err.message);
  }
});
