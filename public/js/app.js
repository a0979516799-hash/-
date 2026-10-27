/**
 * ========================================================
 * 紡絲油耗量智能管理系統 (BarmagSqlQC)
 * 核心邏輯：ROP 再訂購點計算、每日扣除、水位預警折線圖、
 *           採購請購單產出、工廠稼動率與到貨入庫回補
 * ========================================================
 */

// 1. 來自主管資料庫 BarmagSqlQC.dbo.ConsumptionSummary_Table 的 14 筆真實數據 (支援資料庫動態載入)
let consumptionData = [
  { id: 1, oil_type: 'B-1823', machine_no: '011', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 1354.752, neat_oil_consumption: 162.5696 },
  { id: 2, oil_type: 'P-1213', machine_no: '001', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 652.3082, neat_oil_consumption: 97.8458 },
  { id: 3, oil_type: 'P-1213', machine_no: '002', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 895.7952, neat_oil_consumption: 134.3694 },
  { id: 4, oil_type: 'T-1206', machine_no: '011', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 1804.032, neat_oil_consumption: 270.6048 },
  { id: 5, oil_type: 'T-1206', machine_no: '013', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 822.528, neat_oil_consumption: 123.3792 },
  { id: 6, oil_type: 'T2227', machine_no: '001', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 102.021, neat_oil_consumption: 8.1618 },
  { id: 7, oil_type: 'T-2227', machine_no: '001', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 1270.8301, neat_oil_consumption: 101.6669 },
  { id: 8, oil_type: 'T-2227', machine_no: '002', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 1122.5088, neat_oil_consumption: 89.8002 },
  { id: 9, oil_type: 'T-2227', machine_no: '003', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 420.6188, neat_oil_consumption: 33.649 },
  { id: 10, oil_type: 'T-2227', machine_no: '012', start_date: '2026-05-20', end_date: '2026-05-21', emulsion_consumption: 850.176, neat_oil_consumption: 68.0143 },
  { id: 11, oil_type: 'T-2227', machine_no: '013', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 172.8, neat_oil_consumption: 15.2064 },
  { id: 12, oil_type: 'T-2227', machine_no: '014', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 538.6752, neat_oil_consumption: 43.0934 },
  { id: 13, oil_type: 'T2227+YT5355', machine_no: '004', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 403.5135, neat_oil_consumption: 48.4211 },
  { id: 14, oil_type: 'XF-5010+T-2124', machine_no: '013', start_date: '2026-05-19', end_date: '2026-05-21', emulsion_consumption: 354.24, neat_oil_consumption: 42.509 }
];

// 計算日期跨度天數 (結束日期 - 開始日期 + 1，確保包含首尾完整運作日)
function calcDays(startStr, endStr) {
  if (!startStr || !endStr) return 1;
  const d1 = new Date(startStr);
  const d2 = new Date(endStr);
  const diffTime = Math.abs(d2 - d1);
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return isNaN(diffDays) || diffDays <= 0 ? 1 : diffDays;
}

// 2. 6 大油種配置（以真實每日平均原油耗量 d 為基準）
const defaultOilConfigs = [
  {
    code: 'B-1823',
    baseDailyDemand: 54.19,     // d (KG/天，162.57 ÷ 3天)
    currentStock: 600.0,        // 目前庫存值 (KG)
    initialStock: 600.0,
    leadTime: 5,                // L (天)
    safetyStock: 150.0          // SS (KG)
  },
  {
    code: 'P-1213',
    baseDailyDemand: 77.41,     // d (KG/天，232.22 ÷ 3天)
    currentStock: 750.0,
    initialStock: 750.0,
    leadTime: 5,
    safetyStock: 200.0
  },
  {
    code: 'T-1206',
    baseDailyDemand: 131.33,    // d (KG/天，393.98 ÷ 3天)
    currentStock: 800.0,
    initialStock: 800.0,
    leadTime: 5,
    safetyStock: 250.0
  },
  {
    code: 'T-2227',
    baseDailyDemand: 131.20,    // d (KG/天，全機台日均加總)
    currentStock: 1000.0,
    initialStock: 1000.0,
    leadTime: 4,
    safetyStock: 250.0
  },
  {
    code: 'T2227+YT5355',
    baseDailyDemand: 16.14,     // d (KG/天，48.42 ÷ 3天)
    currentStock: 220.0,
    initialStock: 220.0,
    leadTime: 7,
    safetyStock: 60.0
  },
  {
    code: 'XF-5010+T-2124',
    baseDailyDemand: 14.17,     // d (KG/天，42.51 ÷ 3天)
    currentStock: 200.0,
    initialStock: 200.0,
    leadTime: 7,
    safetyStock: 60.0
  }
];

// 運行狀態變數 (油劑模組)
let oilROPConfigs = JSON.parse(JSON.stringify(defaultOilConfigs));
let simulatedDays = 0;
let totalDeductedNeatOil = 0;
let capacityRate = 1.0; // 稼動率 (1.0 = 100%)
let currentMainTab = 'oil'; // 'oil' 或 'sand'

// ========================================================
// 鐵砂耗材模組核心變數與預設配方庫 (比重固定 2.2 g/c.c.)
// ========================================================
const SAND_BULK_DENSITY = 2.2; // 鐵砂比重常數 2.2 g/c.c.
const SAND_BAG_KG = 25.0;      // 工廠標準包裝 25 KG/袋

const defaultSandConfigs = {
  coarse: {
    id: 'coarse',
    code: '25/50',
    name: '粗砂',
    spec: '規格目數 25/50 ｜ 下層支撐導流',
    currentStock: 1500.0, // KG (~60袋)
    initialStock: 1500.0,
    leadTime: 7,          // L (天)
    safetyStock: 300.0    // SS (KG, ~12袋)
  },
  fine: {
    id: 'fine',
    code: '140/200',
    name: '細砂',
    spec: '規格目數 140/200 ｜ 上層高精過濾',
    currentStock: 800.0,  // KG (~32袋)
    initialStock: 800.0,
    leadTime: 10,         // L (天)
    safetyStock: 150.0    // SS (KG, ~6袋)
  }
};

// 依據工廠 PACK 歷史真實型號與開會範例 (52 cc / 18 cc) 建立之預設配方庫
const defaultPackRecipes = [
  { id: 'p1', packType: 'A29-18D', dailyPacks: 85, coarseCc: 52, fineCc: 18 },
  { id: 'p2', packType: 'A29-19D', dailyPacks: 64, coarseCc: 52, fineCc: 18 },
  { id: 'p3', packType: 'A20', dailyPacks: 55, coarseCc: 48, fineCc: 16 },
  { id: 'p4', packType: 'A29', dailyPacks: 48, coarseCc: 50, fineCc: 18 },
  { id: 'p5', packType: 'T280-2', dailyPacks: 42, coarseCc: 56, fineCc: 20 },
  { id: 'p6', packType: 'T315-5', dailyPacks: 38, coarseCc: 60, fineCc: 22 },
  { id: 'p7', packType: 'B001-9', dailyPacks: 33, coarseCc: 45, fineCc: 15 }
];

let sandConfigs = JSON.parse(JSON.stringify(defaultSandConfigs));
let packRecipes = JSON.parse(JSON.stringify(defaultPackRecipes));
let sandSimulatedDays = 0;
let totalDeductedCoarseKg = 0;
let totalDeductedFineKg = 0;

// 輔助函式：有效日耗量 (考慮稼動率)
function getEffectiveDemand(item) {
  return parseFloat((item.baseDailyDemand * capacityRate).toFixed(2));
}

// 輔助函式：換算標準鐵桶數 (200 KG/桶)
function toBarrels(kg) {
  return (kg / 200).toFixed(1);
}

// 輔助函式：建議請購量計算
function calcSuggestedOrder(item) {
  const effDemand = getEffectiveDemand(item);
  const rop = Math.round((effDemand * item.leadTime) + item.safetyStock);
  const targetStock = rop + Math.round(effDemand * 5); // 目標庫存 = ROP + 5天安全週轉
  const deficit = targetStock - item.currentStock;
  if (deficit <= 0) return { kg: 0, barrels: 0 };
  const barrels = Math.ceil(deficit / 200);
  return { kg: barrels * 200, barrels: barrels };
}

// 頁面加載初始化
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadFromLocalStorage();
  renderTable(consumptionData);
  renderMachineChart();
  renderROPCards();
  updateTopMetrics();
  renderTrendChart();
  populateRestockDropdown();
  renderSandView();
  initChangePackDateSelector();
  window.addEventListener('resize', () => {
    if (currentMainTab === 'oil') {
      renderTrendChart();
    } else {
      renderSandTrendChart();
    }
  });

  // === 全端資料庫串接與即時同步 ===
  checkDatabaseStatus();
  loadConsumptionFromDB();
  loadMaterialsFromDB();
});

// 3. 本地記憶保存 (LocalStorage)
function saveToLocalStorage() {
  try {
    const payload = {
      oilROPConfigs,
      simulatedDays,
      totalDeductedNeatOil,
      capacityRate,
      sandConfigs,
      packRecipes,
      sandSimulatedDays,
      totalDeductedCoarseKg,
      totalDeductedFineKg
    };
    localStorage.setItem('spinning_oil_system_v3', JSON.stringify(payload));
  } catch (e) {
    console.warn('LocalStorage save error:', e);
  }
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem('spinning_oil_system_v3');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.oilROPConfigs && data.oilROPConfigs.length === 6) {
        oilROPConfigs = data.oilROPConfigs;
        simulatedDays = data.simulatedDays || 0;
        totalDeductedNeatOil = data.totalDeductedNeatOil || 0;
        capacityRate = data.capacityRate || 1.0;

        const slider = document.getElementById('capacity-slider');
        const capVal = document.getElementById('capacity-val');
        if (slider) slider.value = Math.round(capacityRate * 100);
        if (capVal) capVal.textContent = `${Math.round(capacityRate * 100)}%`;
      }
      if (data.sandConfigs && data.sandConfigs.coarse && data.sandConfigs.fine) {
        sandConfigs = data.sandConfigs;
        sandConfigs.coarse.name = '粗砂';
        sandConfigs.coarse.code = '25/50';
        sandConfigs.coarse.spec = '下層支撐導流 (規格目數 25/50)';
        sandConfigs.fine.name = '細砂';
        sandConfigs.fine.code = '140/200';
        sandConfigs.fine.spec = '上層高精過濾 (規格目數 140/200)';
      }
      if (data.packRecipes && Array.isArray(data.packRecipes) && data.packRecipes.length > 0) {
        packRecipes = data.packRecipes;
      }
      sandSimulatedDays = data.sandSimulatedDays || 0;
      totalDeductedCoarseKg = data.totalDeductedCoarseKg || 0;
      totalDeductedFineKg = data.totalDeductedFineKg || 0;
    }
  } catch (e) {
    console.warn('LocalStorage load error:', e);
  }
}

// 4. 生產稼動率調整
function changeCapacity(val) {
  const percent = parseInt(val, 10);
  capacityRate = percent / 100;
  const label = document.getElementById('capacity-val');
  if (label) label.textContent = `${percent}%`;

  updateTopMetrics();
  renderROPCards();
  renderTrendChart();
  updateSandMetrics();
  renderSandROPCards();
  renderSandTrendChart();
  saveToLocalStorage();
  showToast(`🏭 全廠稼動率設定為 ${percent}% (耗量係數 ×${capacityRate.toFixed(2)})`, 'info');
}

// 5. 渲染 6 大油種 ROP 卡片 (全新頂級工業科技儀表板設計)
function renderROPCards() {
  const container = document.getElementById('rop-cards-grid');
  if (!container) return;
  container.innerHTML = '';

  let ropAlertCount = 0;

  oilROPConfigs.forEach((item, index) => {
    const effDemand = getEffectiveDemand(item);
    const rop = Math.round((effDemand * item.leadTime) + item.safetyStock);

    const isBelowSS = item.currentStock <= item.safetyStock;
    const isBelowROP = item.currentStock <= rop;
    const orderInfo = calcSuggestedOrder(item);

    let statusHtml = '';
    let cardStateClass = 'is-safe';
    let meterGradient = 'linear-gradient(90deg, #10b981, #06b6d4)';

    if (isBelowSS) {
      statusHtml = '<span class="rop-status-badge rop-status-crit">🚨 跌破安全量</span>';
      cardStateClass = 'is-critical';
      meterGradient = 'linear-gradient(90deg, #ef4444, #dc2626)';
      ropAlertCount++;
    } else if (isBelowROP) {
      statusHtml = '<span class="rop-status-badge rop-status-warn">⚠️ 達再訂購點</span>';
      cardStateClass = 'is-warning';
      meterGradient = 'linear-gradient(90deg, #f59e0b, #d97706)';
      ropAlertCount++;
    } else {
      statusHtml = '<span class="rop-status-badge rop-status-safe">● 存量充足</span>';
    }

    // 計算庫存水位健康百分比 (參考滿載 = 初期存量或 ROP * 1.4 之較大值)
    const maxRef = Math.max(item.initialStock * 1.25, rop * 1.4, 2000);
    const pct = Math.min(100, Math.max(0, (item.currentStock / maxRef) * 100));
    const isCompound = item.code.includes('+');

    const card = document.createElement('div');
    card.className = `rop-oil-card ${cardStateClass}`;

    card.innerHTML = `
      <!-- 卡片 Header：油劑編號、種類標籤與狀態晶片 -->
      <div class="rop-card-header">
        <div class="rop-card-identity">
          <span class="rop-oil-code">${escapeHtml(item.code)}</span>
          <span class="rop-type-pill">${isCompound ? '複合油劑' : '純油劑原液'}</span>
        </div>
        <div>${statusHtml}</div>
      </div>

      <!-- 核心存量 Hero 區塊 (大字即時編輯 + 桶數換算 + 視覺水位條) -->
      <div class="rop-stock-hero">
        <div class="rop-stock-label-row">
          <span class="rop-stock-label">🛢️ 即時庫存存量</span>
          <span class="rop-demand-badge" title="稼動率扣除日耗量">日耗 d: ${effDemand} KG/天</span>
        </div>

        <div class="rop-stock-input-row">
          <div class="rop-stock-input-wrap">
            <input type="number" step="10" min="0" class="rop-stock-input" 
                   value="${item.currentStock.toFixed(1)}" 
                   title="直接輸入數值修改庫存"
                   onchange="updateOilStock(${index}, this.value)">
            <span class="rop-stock-unit">KG</span>
          </div>
        </div>

        <!-- 水位健康條 -->
        <div class="rop-meter-wrapper">
          <div class="rop-meter-track" title="庫存健康百分比: ${pct.toFixed(0)}%">
            <div class="rop-meter-fill" style="width: ${pct}%; background: ${meterGradient};"></div>
          </div>
          <div class="rop-meter-labels">
            <span>安全底線 SS: ${item.safetyStock} KG</span>
            <span>再訂購線 ROP: ${rop.toLocaleString()} KG</span>
          </div>
        </div>
      </div>

      <!-- 參數設定矩陣：安全庫存 (SS) 與 採購交期 (L) -->
      <div class="rop-params-grid">
        <div class="rop-param-box">
          <div class="rop-param-header">🛡️ 安全庫存 (SS)</div>
          <div class="rop-param-field-row">
            <input type="number" step="10" min="0" class="rop-param-input" 
                   value="${item.safetyStock}" 
                   title="修改安全庫存值"
                   onchange="updateSafetyStock(${index}, this.value)">
            <span class="rop-param-unit">KG (${toBarrels(item.safetyStock)}桶)</span>
          </div>
        </div>
        <div class="rop-param-box">
          <div class="rop-param-header">⏱️ 採購交期 (L)</div>
          <div class="rop-param-field-row">
            <input type="number" step="1" min="1" max="60" class="rop-param-input" 
                   value="${item.leadTime}" 
                   title="修改採購交期天數"
                   onchange="updateLeadTime(${index}, this.value)">
            <span class="rop-param-unit">天到貨</span>
          </div>
        </div>
      </div>

      <!-- 再訂購點 (ROP) 門檻橫條 -->
      <div class="rop-target-strip ${isBelowROP ? '' : 'is-safe-strip'}">
        <div class="rop-target-label">
          <span>📌 再訂購點 (ROP)</span>
          <span style="font-size:0.68rem; opacity:0.75;">(d×L + SS)</span>
        </div>
        <div style="display:flex; align-items:baseline;">
          <span class="rop-target-val ${isBelowROP ? '' : 'safe-text'}">${rop.toLocaleString()}</span>
          <span class="rop-target-sub">KG</span>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  // 更新頂部數據計數
  const ropCountEl = document.getElementById('rop-alert-count');
  const poBadge = document.getElementById('po-badge');
  if (ropCountEl) {
    ropCountEl.textContent = `${ropAlertCount} 種`;
    ropCountEl.style.color = ropAlertCount > 0 ? 'var(--danger)' : 'var(--success)';
  }
  if (poBadge) {
    poBadge.textContent = ropAlertCount;
    poBadge.style.background = ropAlertCount > 0 ? 'var(--danger)' : 'var(--bg-tag)';
  }
}

// 6. 每日生產扣除動態模擬
function simulateNextDay(days = 1) {
  simulatedDays += days;
  let triggeredAlerts = [];

  oilROPConfigs.forEach(item => {
    const effDemand = getEffectiveDemand(item);
    const dailyDeduct = effDemand * days;
    item.currentStock = Math.max(0, parseFloat((item.currentStock - dailyDeduct).toFixed(1)));
    totalDeductedNeatOil += dailyDeduct;

    const rop = Math.round((effDemand * item.leadTime) + item.safetyStock);

    if (item.currentStock <= item.safetyStock) {
      triggeredAlerts.push(`【${item.code}】跌破安全存量！現存 ${item.currentStock} KG`);
    } else if (item.currentStock <= rop) {
      triggeredAlerts.push(`【${item.code}】達再訂購點 (ROP)！請發單`);
    }
  });

  updateTopMetrics();
  renderROPCards();
  renderTrendChart();
  saveToLocalStorage();
  syncOilStockToDatabase();

  if (triggeredAlerts.length > 0) {
    showToast(`🚨 生產模擬第 ${simulatedDays} 天警示：\n` + triggeredAlerts.join('； '), 'warning');
  } else {
    showToast(`✅ 已模擬生產 ${days} 天，全廠油劑庫存平穩。`, 'success');
  }
}

// 7. 重設初始庫存
function resetInventoryStock() {
  simulatedDays = 0;
  totalDeductedNeatOil = 0;
  oilROPConfigs = JSON.parse(JSON.stringify(defaultOilConfigs));
  capacityRate = 1.0;

  const slider = document.getElementById('capacity-slider');
  const capVal = document.getElementById('capacity-val');
  if (slider) slider.value = 100;
  if (capVal) capVal.textContent = '100%';

  updateTopMetrics();
  renderROPCards();
  renderTrendChart();
  saveToLocalStorage();
  showToast('🔄 已重設為初始庫存與排產參數', 'info');
}

// 8. 快捷入庫與到貨回補
function quickRestock(index, amountKG) {
  oilROPConfigs[index].currentStock += amountKG;
  renderROPCards();
  renderTrendChart();
  saveToLocalStorage();
  showToast(`📦 【${oilROPConfigs[index].code}】已入庫 +${amountKG} KG (${toBarrels(amountKG)} 桶)`, 'success');
}

function openRestockModal() {
  const modal = document.getElementById('restock-modal');
  if (!modal) return;
  populateRestockDropdown();
  modal.classList.add('active');
}

function closeRestockModal() {
  const modal = document.getElementById('restock-modal');
  if (modal) modal.classList.remove('active');
}

function populateRestockDropdown() {
  const select = document.getElementById('restock-oil-select');
  if (!select) return;
  select.innerHTML = '';
  oilROPConfigs.forEach((item, index) => {
    const opt = document.createElement('option');
    opt.value = index;
    opt.textContent = `${item.code} (現存: ${item.currentStock.toFixed(0)} KG)`;
    select.appendChild(opt);
  });
}

function setRestockQty(qty) {
  const input = document.getElementById('restock-amount');
  if (input) input.value = qty;
}

function confirmRestock() {
  const select = document.getElementById('restock-oil-select');
  const input = document.getElementById('restock-amount');
  if (!select || !input) return;

  const index = parseInt(select.value, 10);
  const qty = parseFloat(input.value);

  if (isNaN(qty) || qty <= 0) {
    showToast('請輸入大於 0 的入庫數量', 'warning');
    return;
  }

  oilROPConfigs[index].currentStock += qty;
  closeRestockModal();
  renderROPCards();
  renderTrendChart();
  saveToLocalStorage();
  showToast(`✅ 進貨完成！【${oilROPConfigs[index].code}】目前存量增至 ${oilROPConfigs[index].currentStock.toFixed(1)} KG`, 'success');
}

// 9. 正式採購請購單生成邏輯 (PO Sheet)
function openPOModal() {
  const modal = document.getElementById('po-modal');
  if (!modal) return;

  const tbody = document.getElementById('po-table-body');
  const poDate = document.getElementById('po-date');
  const poNo = document.getElementById('po-no');

  const todayStr = new Date().toISOString().slice(0, 10);
  if (poDate) poDate.textContent = todayStr;
  if (poNo) poNo.textContent = `PO-${todayStr.replace(/-/g, '')}-001`;

  if (tbody) {
    tbody.innerHTML = '';
    let rowsHtml = '';
    let count = 0;

    oilROPConfigs.forEach(item => {
      const effDemand = getEffectiveDemand(item);
      const rop = Math.round((effDemand * item.leadTime) + item.safetyStock);
      const isUrgent = item.currentStock <= rop;
      const orderInfo = calcSuggestedOrder(item);

      if (isUrgent || orderInfo.kg > 0) {
        count++;
        rowsHtml += `
          <tr>
            <td style="text-align:center;">${count}</td>
            <td><strong style="font-family:monospace; font-size:1rem; color:#0f172a;">${escapeHtml(item.code)}</strong></td>
            <td style="font-family:monospace; color:${item.currentStock <= item.safetyStock ? '#dc2626' : '#d97706'}; font-weight:700;">
              ${item.currentStock.toFixed(1)} KG
            </td>
            <td style="font-family:monospace;">${rop.toLocaleString()} KG</td>
            <td style="font-family:monospace;">${item.safetyStock} KG</td>
            <td style="text-align:center;">${item.leadTime} 天</td>
            <td style="font-family:monospace; font-weight:800; color:#0f172a; text-align:right;">
              ${orderInfo.kg.toLocaleString()} KG
            </td>
            <td style="text-align:center;">
              <span style="background:#e0f2fe; color:#0369a1; padding:0.2rem 0.5rem; border-radius:4px; font-weight:600; font-size:0.85rem;">
                ${orderInfo.barrels} 桶
              </span>
            </td>
          </tr>
        `;
      }
    });

    if (count === 0) {
      oilROPConfigs.slice(0, 3).forEach((item, idx) => {
        rowsHtml += `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td><strong style="font-family:monospace;">${escapeHtml(item.code)}</strong></td>
            <td style="font-family:monospace; color:#16a34a; font-weight:700;">${item.currentStock.toFixed(1)} KG (充足)</td>
            <td style="font-family:monospace;">${Math.round((getEffectiveDemand(item) * item.leadTime) + item.safetyStock)} KG</td>
            <td style="font-family:monospace;">${item.safetyStock} KG</td>
            <td style="text-align:center;">${item.leadTime} 天</td>
            <td style="font-family:monospace; text-align:right;">400 KG</td>
            <td style="text-align:center;">2 桶 (備用儲備)</td>
          </tr>
        `;
      });
    }

    tbody.innerHTML = rowsHtml;
  }

  modal.classList.add('active');
}

function closePOModal() {
  const modal = document.getElementById('po-modal');
  if (modal) modal.classList.remove('active');
}

// 10. 未來 14 天動態水位消耗趨勢折線圖 (HTML5 Canvas)
function renderTrendChart() {
  const canvas = document.getElementById('trendCanvas');
  if (!canvas) return;

  const select = document.getElementById('trend-oil-select');
  const selectedCode = select ? select.value : 'T-1206';
  const insightEl = document.getElementById('trend-insight-text');

  const container = canvas.parentElement;
  const w = container ? container.clientWidth : (canvas.getBoundingClientRect().width || 500);
  const h = container ? container.clientHeight : 280;
  if (w === 0 || h === 0) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.style.maxWidth = '100%';
  canvas.style.maxHeight = '280px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const padLeft = 65;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 40;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  ctx.clearRect(0, 0, w, h);

  let targetItem = oilROPConfigs.find(o => o.code === selectedCode);
  let isAll = selectedCode === 'all';

  let startStock = 0;
  let dailyRate = 0;
  let ropVal = 0;
  let ssVal = 0;
  let displayName = '';

  if (isAll) {
    displayName = '全廠原油';
    oilROPConfigs.forEach(o => {
      startStock += o.currentStock;
      const d = getEffectiveDemand(o);
      dailyRate += d;
      ropVal += Math.round((d * o.leadTime) + o.safetyStock);
      ssVal += o.safetyStock;
    });
  } else if (targetItem) {
    displayName = targetItem.code;
    startStock = targetItem.currentStock;
    dailyRate = getEffectiveDemand(targetItem);
    ropVal = Math.round((dailyRate * targetItem.leadTime) + targetItem.safetyStock);
    ssVal = targetItem.safetyStock;
  }

  const daysCount = 14;
  const points = [];
  for (let t = 0; t <= daysCount; t++) {
    const stockAtDay = Math.max(0, startStock - (dailyRate * t));
    points.push({ day: t, stock: stockAtDay });
  }

  const maxVal = Math.max(startStock * 1.15, ropVal * 1.25, 100);
  const getX = d => padLeft + (d / daysCount) * plotW;
  const getY = v => padTop + plotH - (v / maxVal) * plotH;

  // 水平網格與刻度字體自適應主題
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)';
  const chartTextColor = isLight ? '#475569' : '#94a3b8';
  const chartDotBorder = isLight ? '#ffffff' : '#0a0e17';

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gridSteps = 4;
  ctx.fillStyle = chartTextColor;
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridSteps; i++) {
    const val = (maxVal / gridSteps) * i;
    const y = getY(val);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(val)} KG`, padLeft - 8, y + 4);
  }

  // 垂直天數刻度
  ctx.textAlign = 'center';
  ctx.strokeStyle = gridColor;
  for (let d = 0; d <= daysCount; d += 2) {
    const x = getX(d);
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, padTop + plotH);
    ctx.stroke();
    ctx.fillText(`${d}天`, x, h - padBottom + 18);
  }

  // 安全庫存線 (SS 紅色虛線)
  if (ssVal > 0) {
    const ssY = getY(ssVal);
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, ssY);
    ctx.lineTo(w - padRight, ssY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`SS (${ssVal} KG)`, padLeft + 10, ssY - 5);
  }

  // 再訂購點線 (ROP 琥珀色虛線)
  if (ropVal > 0) {
    const ropY = getY(ropVal);
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(padLeft, ropY);
    ctx.lineTo(w - padRight, ropY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`ROP (${ropVal} KG)`, padLeft + 10, ropY - 5);
  }

  // 消耗曲線
  ctx.beginPath();
  points.forEach((p, idx) => {
    const x = getX(p.day);
    const y = getY(p.stock);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.lineTo(getX(daysCount), getY(0));
  ctx.lineTo(getX(0), getY(0));
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
  grad.addColorStop(0, 'rgba(6, 182, 212, 0.2)');
  grad.addColorStop(1, 'rgba(6, 182, 212, 0.01)');
  ctx.fillStyle = grad;
  ctx.fill();

  // 圓點
  points.forEach(p => {
    const x = getX(p.day);
    const y = getY(p.stock);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = p.stock <= ssVal ? '#ef4444' : (p.stock <= ropVal ? '#f59e0b' : '#06b6d4');
    ctx.fill();
    ctx.strokeStyle = chartDotBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // 分析文字 (簡潔有力)
  const ropDay = dailyRate > 0 ? ((startStock - ropVal) / dailyRate) : -1;
  const ssDay = dailyRate > 0 ? ((startStock - ssVal) / dailyRate) : -1;

  if (insightEl) {
    if (startStock <= ssVal) {
      insightEl.innerHTML = `<span style="color:var(--danger); font-weight:700;">☠️ 【${displayName}】已破安全存量 (${ssVal} KG)！請立即叫料避免停機。</span>`;
    } else if (startStock <= ropVal) {
      insightEl.innerHTML = `<span style="color:var(--warning); font-weight:700;">🚨 【${displayName}】已達再訂購點 (${ropVal} KG)！預估第 ${ssDay.toFixed(1)} 天侵蝕安全庫存。</span>`;
    } else {
      insightEl.innerHTML = `<strong>【${displayName}】</strong>目前存量充足，預估在第 <strong>${ropDay.toFixed(1)} 天</strong>到達再訂購點，第 <strong>${ssDay.toFixed(1)} 天</strong>觸及安全庫存。`;
    }
  }
}

// 11. 演示情境載入
function loadDemoScenario(type) {
  ['normal', 'rop', 'critical'].forEach(t => {
    const btn = document.getElementById(`scen-${t}`);
    if (btn) btn.classList.toggle('active', t === type);
  });

  simulatedDays = 0;
  totalDeductedNeatOil = 0;
  oilROPConfigs = JSON.parse(JSON.stringify(defaultOilConfigs));

  if (type === 'normal') {
    capacityRate = 1.0;
    showToast('🟢 已載入【正常庫存情境】', 'success');
  } else if (type === 'rop') {
    oilROPConfigs[2].currentStock = 850; // T-1206 ROP=907
    oilROPConfigs[1].currentStock = 550; // P-1213 ROP=587
    capacityRate = 1.1;
    showToast('🟡 已載入【達再訂購點 (ROP) 警示情境】', 'warning');
  } else if (type === 'critical') {
    oilROPConfigs[2].currentStock = 200;  // T-1206 SS=250
    oilROPConfigs[1].currentStock = 180;  // P-1213 SS=200
    capacityRate = 1.2;
    showToast('🔴 已載入【跌破安全存量危機情境】', 'danger');
  }

  const slider = document.getElementById('capacity-slider');
  const capVal = document.getElementById('capacity-val');
  if (slider) slider.value = Math.round(capacityRate * 100);
  if (capVal) capVal.textContent = `${Math.round(capacityRate * 100)}%`;

  updateTopMetrics();
  renderROPCards();
  renderTrendChart();
  saveToLocalStorage();
}

// 12. 更新參數
function updateOilStock(index, newStockVal) {
  const val = parseFloat(newStockVal);
  if (isNaN(val) || val < 0) return;
  oilROPConfigs[index].currentStock = val;
  oilROPConfigs[index].initialStock = val;
  renderROPCards();
  renderTrendChart();
  saveToLocalStorage();
  showToast(`已更新 [${oilROPConfigs[index].code}] 庫存為 ${val} KG`, 'success');
}

function updateSafetyStock(index, newSS) {
  const val = parseFloat(newSS);
  if (isNaN(val) || val < 0) return;
  oilROPConfigs[index].safetyStock = val;
  renderROPCards();
  renderTrendChart();
  saveToLocalStorage();
  showToast(`已更新 [${oilROPConfigs[index].code}] 安全庫存為 ${val} KG`, 'info');
}

function updateLeadTime(index, newLT) {
  const val = parseInt(newLT, 10);
  if (isNaN(val) || val < 1) return;
  oilROPConfigs[index].leadTime = val;
  renderROPCards();
  renderTrendChart();
  saveToLocalStorage();
  showToast(`已更新 [${oilROPConfigs[index].code}] 交期為 ${val} 天`, 'info');
}

function updateTopMetrics() {
  const neatEl = document.getElementById('top-neat-oil');
  const emulsionEl = document.getElementById('top-emulsion-oil');

  // 計算 6 大油種每日基準總耗量 (424.4 KG/天) 與油水日總耗量 (3,644.2 KG/天)
  let baseNeat = oilROPConfigs.reduce((sum, item) => sum + item.baseDailyDemand, 0);
  let effNeat = (baseNeat * capacityRate).toFixed(1);
  let baseEmulsion = 3644.2;
  let effEmulsion = (baseEmulsion * capacityRate).toFixed(1);

  if (neatEl) neatEl.innerHTML = `${effNeat} <span style="font-size: 1rem; font-weight: 500;">KG/天</span>`;
  if (emulsionEl) emulsionEl.innerHTML = `${effEmulsion} <span style="font-size: 1rem; font-weight: 500;">KG/天</span>`;
}

// 13. 機台耗量長條圖 (以單日原油耗量 KG/天 為排行標準)
function renderMachineChart() {
  const container = document.getElementById('machine-bars-container');
  if (!container) return;
  container.innerHTML = '';

  const machineMap = {};
  consumptionData.forEach(item => {
    const days = calcDays(item.start_date, item.end_date);
    const dailyNeat = item.neat_oil_consumption / days;
    if (!machineMap[item.machine_no]) machineMap[item.machine_no] = 0;
    machineMap[item.machine_no] += dailyNeat;
  });

  const sortedMachines = Object.keys(machineMap)
    .map(m => ({ machine: m, dailyNeatOil: parseFloat(machineMap[m].toFixed(1)) }))
    .sort((a, b) => b.dailyNeatOil - a.dailyNeatOil);

  const maxVal = sortedMachines.length > 0 ? sortedMachines[0].dailyNeatOil : 100;

  sortedMachines.forEach((item, index) => {
    const percent = Math.round((item.dailyNeatOil / maxVal) * 100);

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '0.75rem';
    row.style.fontSize = '0.85rem';

    row.innerHTML = `
      <div style="width: 70px; font-weight: 700; color: var(--text-main);">機台 ${item.machine}</div>
      <div style="flex: 1; height: 10px; background: var(--meter-bg); border-radius: 5px; overflow: hidden;">
        <div style="width: ${percent}%; height: 100%; border-radius: 5px; background: ${index === 0 ? 'var(--accent-gradient)' : 'linear-gradient(90deg, #3b82f6, #06b6d4)'};"></div>
      </div>
      <div style="width: 95px; text-align: right; font-weight: 700; font-family: monospace; color: var(--accent-cyan);">${item.dailyNeatOil} KG/天</div>
    `;

    container.appendChild(row);
  });
}

// 14. 篩選與表格渲染
function applyFilters() {
  const selectedOil = document.getElementById('filter-oil').value;
  const selectedMachine = document.getElementById('filter-machine').value;

  let filtered = consumptionData.filter(item => {
    if (selectedOil !== 'all') {
      if (selectedOil === 'T-2227') {
        if (!item.oil_type.startsWith('T-2227') && !item.oil_type.startsWith('T2227')) return false;
        if (item.oil_type.includes('+')) return false;
      } else {
        if (item.oil_type !== selectedOil) return false;
      }
    }

    if (selectedMachine !== 'all') {
      if (item.machine_no !== selectedMachine) return false;
    }

    return true;
  });

  renderTable(filtered);
  document.getElementById('filtered-count').textContent = `顯示中：${filtered.length} 筆資料`;
}

function renderTable(list) {
  const tbody = document.getElementById('table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:2rem; color:var(--text-dim);">查無符合條件之資料</td></tr>';
    return;
  }

  list.forEach((row, index) => {
    const concentration = ((row.neat_oil_consumption / row.emulsion_consumption) * 100).toFixed(2);
    const days = row.days || calcDays(row.start_date, row.end_date);
    const dailyNeat = row.daily_neat_oil_consumption || parseFloat((row.neat_oil_consumption / days).toFixed(4));

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--text-dim);">${index + 1}</td>
      <td><strong style="color:var(--accent-cyan); font-family:monospace;">${escapeHtml(row.oil_type)}</strong></td>
      <td><span class="card-category-badge badge-is" style="font-weight:700;">機台 ${escapeHtml(row.machine_no)}</span></td>
      <td><code>${row.start_date}</code></td>
      <td><code>${row.end_date}</code></td>
      <td style="text-align:center;"><span style="background:rgba(255,255,255,0.06); padding:0.15rem 0.5rem; border-radius:4px; font-family:monospace;">${days} 天</span></td>
      <td style="text-align:right; font-family:monospace; font-weight:800; color:var(--accent-cyan); font-size:0.95rem; background:rgba(6,182,212,0.06);">${dailyNeat.toFixed(2)}</td>
      <td style="text-align:right; font-family:monospace; font-size:0.92rem; color:var(--text-muted);">${row.neat_oil_consumption.toLocaleString()}</td>
      <td style="text-align:right; font-family:monospace; font-size:0.92rem;">${row.emulsion_consumption.toLocaleString()}</td>
      <td style="text-align:center;"><span style="background:rgba(16,185,129,0.15); color:var(--success); padding:0.2rem 0.6rem; border-radius:4px; font-weight:700; font-size:0.85rem;">${concentration} %</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// 15. 匯出 CSV 報表 (包含統計天數與每日原油耗量)
function exportToCSV() {
  const headers = ['編號', '油種代號', '機台', '開始日期', '結束日期', '統計天數(天)', '每日原油耗量(KG/天)', '原油總耗量(KG)', '油水總耗量(KG)', '乳化濃度(%)'];
  const rows = consumptionData.map((r, i) => {
    const days = r.days || calcDays(r.start_date, r.end_date);
    const dailyNeat = r.daily_neat_oil_consumption || parseFloat((r.neat_oil_consumption / days).toFixed(4));
    return [
      i + 1,
      `"${r.oil_type}"`,
      `"${r.machine_no}"`,
      r.start_date,
      r.end_date,
      days,
      dailyNeat.toFixed(2),
      r.neat_oil_consumption,
      r.emulsion_consumption,
      ((r.neat_oil_consumption / r.emulsion_consumption) * 100).toFixed(2)
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `紡絲油耗量日報表_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 紡絲油每日耗量報表 (CSV) 已成功匯出！', 'success');
}

// 16. 主題切換 (白天模式 ☀️ ↔ 夜間模式 🌙 全局統一切換)
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
  renderTrendChart();
  renderSandTrendChart();
  renderROPCards();
  renderSandROPCards();
  renderMachineChart();
  showToast(next === 'light' ? '☀️ 已切換至白天模式 (高對比淺色清晰視圖)' : '🌙 已切換至夜間模式 (深色護眼工程視圖)', 'info');
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    if (theme === 'dark') {
      btn.innerHTML = '<span style="font-size:1.05rem;">🌙</span> <span>夜間模式</span>';
      btn.title = '目前為夜間模式（深色底淺色字），點擊切換為白天模式';
    } else {
      btn.innerHTML = '<span style="font-size:1.05rem;">☀️</span> <span>白天模式</span>';
      btn.title = '目前為白天模式（淺色底深色字），點擊切換為夜間模式';
    }
  }
}

// 17. 訊息 Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'danger') icon = '🚨';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span><span style="white-space:pre-line;">${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str);
}

// ========================================================
// 模組切換邏輯 (油劑 🛢️ ↔ 鐵砂 🏔️)
// ========================================================
function switchMainTab(tab) {
  currentMainTab = tab;
  const oilView = document.getElementById('oil-view');
  const sandView = document.getElementById('sand-view');
  const tabBtnOil = document.getElementById('tab-btn-oil');
  const tabBtnSand = document.getElementById('tab-btn-sand');
  const poModalBtn = document.getElementById('po-modal-btn');
  const sandPoNavBtn = document.getElementById('sand-po-nav-btn');

  if (tab === 'oil') {
    if (oilView) oilView.style.display = 'block';
    if (sandView) sandView.style.display = 'none';
    if (tabBtnOil) tabBtnOil.classList.add('active');
    if (tabBtnSand) tabBtnSand.classList.remove('active');
    if (poModalBtn) poModalBtn.style.display = 'inline-flex';
    if (sandPoNavBtn) sandPoNavBtn.style.display = 'none';
    setTimeout(() => renderTrendChart(), 50);
  } else {
    if (oilView) oilView.style.display = 'none';
    if (sandView) sandView.style.display = 'block';
    if (tabBtnSand) tabBtnSand.classList.add('active');
    if (tabBtnOil) tabBtnOil.classList.remove('active');
    if (poModalBtn) poModalBtn.style.display = 'none';
    if (sandPoNavBtn) sandPoNavBtn.style.display = 'inline-flex';
    renderSandView();
  }
}

function handleExportCSV() {
  if (currentMainTab === 'sand') {
    exportSandToCSV();
  } else {
    exportToCSV();
  }
}

// ========================================================
// 鐵砂耗材模組計算與渲染核心邏輯
// ========================================================

// 1. 單一配方單顆重 (g) 與單日需求 (KG) 計算
function getRecipeStats(r) {
  const coarseGrams = (Number(r.coarseCc) || 0) * SAND_BULK_DENSITY;
  const fineGrams = (Number(r.fineCc) || 0) * SAND_BULK_DENSITY;
  const totalGrams = coarseGrams + fineGrams;
  const packs = Number(r.dailyPacks) || 0;
  const dailyCoarseKg = (packs * coarseGrams) / 1000.0;
  const dailyFineKg = (packs * fineGrams) / 1000.0;
  return {
    coarseGrams,
    fineGrams,
    totalGrams,
    dailyCoarseKg,
    dailyFineKg
  };
}

// 2. 全廠粗砂、細砂單日總耗量彙總 (依全廠稼動率 capacityRate)
function getSandDailyTotals() {
  let totalPacks = 0;
  let totalCoarseKg = 0;
  let totalFineKg = 0;

  packRecipes.forEach(r => {
    const stats = getRecipeStats(r);
    totalPacks += (Number(r.dailyPacks) || 0);
    totalCoarseKg += stats.dailyCoarseKg;
    totalFineKg += stats.dailyFineKg;
  });

  return {
    totalPacks,
    coarseDailyDemand: parseFloat((totalCoarseKg * capacityRate).toFixed(2)),
    fineDailyDemand: parseFloat((totalFineKg * capacityRate).toFixed(2)),
    totalDailyKg: parseFloat(((totalCoarseKg + totalFineKg) * capacityRate).toFixed(2))
  };
}

// 3. 鐵砂建議請購量計算
function calcSandSuggestedOrder(typeKey) {
  const item = sandConfigs[typeKey];
  const totals = getSandDailyTotals();
  const d = typeKey === 'coarse' ? totals.coarseDailyDemand : totals.fineDailyDemand;
  const rop = Math.round((d * item.leadTime) + item.safetyStock);
  const targetStock = rop + Math.round(d * 5); // 補足至 ROP + 5天安全週轉
  const deficit = targetStock - item.currentStock;
  if (deficit <= 0) return { kg: 0, bags: 0, rop };
  const bags = Math.ceil(deficit / SAND_BAG_KG);
  return { kg: bags * SAND_BAG_KG, bags, rop };
}

// 4. 總渲染鐵砂介面
function renderSandView() {
  updateSandMetrics();
  renderSandROPCards();
  renderPackRecipeTable();
  setTimeout(() => renderSandTrendChart(), 50);
}

// 5. 更新頂部 4 大統計卡片
function updateSandMetrics() {
  const totals = getSandDailyTotals();
  const coarseBags = (totals.coarseDailyDemand / SAND_BAG_KG).toFixed(1);
  const fineBags = (totals.fineDailyDemand / SAND_BAG_KG).toFixed(1);

  const coarseEl = document.getElementById('sand-top-coarse-kg');
  const coarseBagsEl = document.getElementById('sand-top-coarse-bags');
  if (coarseEl) coarseEl.innerHTML = `${totals.coarseDailyDemand.toLocaleString()} <span style="font-size: 1rem; font-weight: 500;">KG/天</span>`;
  if (coarseBagsEl) coarseBagsEl.textContent = `約 ${coarseBags} 袋/天 (25KG/袋)`;

  const fineEl = document.getElementById('sand-top-fine-kg');
  const fineBagsEl = document.getElementById('sand-top-fine-bags');
  if (fineEl) fineEl.innerHTML = `${totals.fineDailyDemand.toLocaleString()} <span style="font-size: 1rem; font-weight: 500;">KG/天</span>`;
  if (fineBagsEl) fineBagsEl.textContent = `約 ${fineBags} 袋/天 (25KG/袋)`;

  const packsEl = document.getElementById('sand-top-total-packs');
  const weightEl = document.getElementById('sand-top-total-weight');
  if (packsEl) packsEl.innerHTML = `${totals.totalPacks} <span style="font-size: 1rem; font-weight: 500;">顆/天</span>`;
  if (weightEl) weightEl.textContent = `全廠雙砂日耗: ${totals.totalDailyKg.toLocaleString()} KG`;

  // 檢查是否有任一砂種達 ROP
  let alertCount = 0;
  const coarseRop = (totals.coarseDailyDemand * sandConfigs.coarse.leadTime) + sandConfigs.coarse.safetyStock;
  const fineRop = (totals.fineDailyDemand * sandConfigs.fine.leadTime) + sandConfigs.fine.safetyStock;

  if (sandConfigs.coarse.currentStock <= coarseRop) alertCount++;
  if (sandConfigs.fine.currentStock <= fineRop) alertCount++;

  const alertCountEl = document.getElementById('sand-top-alert-count');
  const alertDescEl = document.getElementById('sand-top-alert-desc');
  const alertIconEl = document.getElementById('sand-alert-icon');
  const navBadge = document.getElementById('sand-po-badge');

  if (navBadge) navBadge.textContent = alertCount;

  if (alertCountEl) {
    if (alertCount > 0) {
      alertCountEl.style.color = 'var(--danger)';
      alertCountEl.textContent = `${alertCount} 種警戒`;
      if (alertDescEl) alertDescEl.textContent = '存量達 ROP，請立即開立請購單';
      if (alertIconEl) {
        alertIconEl.style.background = 'var(--danger-bg)';
        alertIconEl.style.color = 'var(--danger)';
        alertIconEl.textContent = '⚠';
      }
    } else {
      alertCountEl.style.color = 'var(--success)';
      alertCountEl.textContent = '0 種';
      if (alertDescEl) alertDescEl.textContent = '粗細砂庫存充足';
      if (alertIconEl) {
        alertIconEl.style.background = 'var(--success-bg)';
        alertIconEl.style.color = 'var(--success)';
        alertIconEl.textContent = '✓';
      }
    }
  }
}

// 6. 渲染粗砂與細砂 ROP 卡片 (全新頂級工業科技儀表板設計)
function renderSandROPCards() {
  const container = document.getElementById('sand-rop-cards-grid');
  if (!container) return;
  container.innerHTML = '';

  const totals = getSandDailyTotals();

  ['coarse', 'fine'].forEach(key => {
    const item = sandConfigs[key];
    const isCoarse = key === 'coarse';
    const d = isCoarse ? totals.coarseDailyDemand : totals.fineDailyDemand;
    const rop = Math.round((d * item.leadTime) + item.safetyStock);
    const isAlert = item.currentStock <= rop;
    const isCritical = item.currentStock <= item.safetyStock;

    const bags = (item.currentStock / SAND_BAG_KG).toFixed(1);
    const ropBags = Math.ceil(rop / SAND_BAG_KG);
    const dBags = (d / SAND_BAG_KG).toFixed(2);

    const targetMax = Math.max(item.initialStock * 1.25, rop * 1.5, 200);
    const stockPct = Math.min(100, Math.max(0, (item.currentStock / targetMax) * 100));

    let cardStateClass = 'is-safe';
    let meterGradient = 'linear-gradient(90deg, #10b981, #06b6d4)';
    let alertBadge = `<span class="rop-status-badge rop-status-safe">● 存量充足</span>`;

    if (isCritical) {
      cardStateClass = 'is-critical';
      meterGradient = 'linear-gradient(90deg, #ef4444, #dc2626)';
      alertBadge = `<span class="rop-status-badge rop-status-crit">🚨 跌破安全量</span>`;
    } else if (isAlert) {
      cardStateClass = 'is-warning';
      meterGradient = isCoarse ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'linear-gradient(90deg, #06b6d4, #3b82f6)';
      alertBadge = `<span class="rop-status-badge rop-status-warn">⚠️ 達再訂購點</span>`;
    }

    const deficitBags = Math.ceil((rop - item.currentStock) / SAND_BAG_KG);
    const suggestedKg = isAlert ? Math.max(0, deficitBags * SAND_BAG_KG) : 0;

    const card = document.createElement('div');
    card.className = `rop-oil-card ${cardStateClass}`;

    card.innerHTML = `
      <!-- 卡片 Header：粗砂/細砂大標題與警示標籤 (方案 A: 精簡俐落) -->
      <div class="rop-card-header">
        <div class="rop-card-identity">
          <span class="rop-oil-code">${isCoarse ? '🪨 粗砂' : '✨ 細砂'}</span>
        </div>
        <div>${alertBadge}</div>
      </div>
      <div style="font-size:0.78rem; color:var(--text-dim); margin-top:-0.5rem;">
        ${isCoarse ? '規格目數 25/50 ｜ 下層支撐導流' : '規格目數 140/200 ｜ 上層高精過濾'}
      </div>

      <!-- 核心存量 Hero 區塊 -->
      <div class="rop-stock-hero">
        <div class="rop-stock-label-row">
          <span class="rop-stock-label">🏔️ 即時鐵砂庫存</span>
          <span class="rop-demand-badge" title="組件更換日耗量">日耗 d: ${d.toFixed(1)} KG/天 (${dBags} 袋)</span>
        </div>

        <div class="rop-stock-input-row">
          <div class="rop-stock-input-wrap">
            <input type="number" step="25" min="0" class="rop-stock-input" 
                   value="${item.currentStock.toFixed(1)}" 
                   title="直接輸入數值修改鐵砂存量"
                   onchange="updateSandStock('${key}', this.value)">
            <span class="rop-stock-unit">KG</span>
          </div>
          <div class="rop-stock-barrels">
            ≈ <strong>${bags}</strong> 袋 <span style="font-size:0.72rem; opacity:0.7;">(25kg/袋)</span>
          </div>
        </div>

        <!-- 水位健康條 -->
        <div class="rop-meter-wrapper">
          <div class="rop-meter-track" title="庫存健康度: ${stockPct.toFixed(0)}%">
            <div class="rop-meter-fill" style="width: ${stockPct}%; background: ${meterGradient};"></div>
          </div>
          <div class="rop-meter-labels">
            <span>安全儲備 SS: ${item.safetyStock} KG</span>
            <span>再訂購線 ROP: ${rop.toLocaleString()} KG</span>
          </div>
        </div>
      </div>

      <!-- 參數設定矩陣：安全庫存 (SS) 與 採購交期 (L) -->
      <div class="rop-params-grid" style="grid-template-columns: 1fr 1fr 1fr;">
        <div class="rop-param-box">
          <div class="rop-param-header">🛡️ 安全庫存 (SS)</div>
          <div class="rop-param-field-row">
            <input type="number" min="0" step="25" class="rop-param-input" 
                   value="${item.safetyStock}" 
                   title="修改鐵砂安全庫存值"
                   onchange="updateSandSafetyStock('${key}', this.value)">
            <span class="rop-param-unit">KG</span>
          </div>
        </div>
        <div class="rop-param-box">
          <div class="rop-param-header">⏱️ 到貨交期 (L)</div>
          <div class="rop-param-field-row">
            <input type="number" min="1" max="60" class="rop-param-input" 
                   value="${item.leadTime}" 
                   title="修改鐵砂到貨交期天數"
                   onchange="updateSandLeadTime('${key}', this.value)">
            <span class="rop-param-unit">天</span>
          </div>
        </div>
        <div class="rop-param-box">
          <div class="rop-param-header">⚡ 日消耗率 (d)</div>
          <div style="font-family:monospace; font-weight:700; font-size:0.95rem; color:var(--text-main); padding-top:0.15rem;">
            ${d.toFixed(1)} <span style="font-size:0.72rem; color:var(--text-dim);">KG</span>
          </div>
        </div>
      </div>

      <!-- 再訂購點 (ROP) 門檻橫條 -->
      <div class="rop-target-strip ${isAlert ? '' : 'is-safe-strip'}">
        <div class="rop-target-label">
          <span>📌 再訂購點 (ROP)</span>
          <span style="font-size:0.68rem; opacity:0.75;">(${d.toFixed(1)}×${item.leadTime} + ${item.safetyStock})</span>
        </div>
        <div style="display:flex; align-items:baseline;">
          <span class="rop-target-val ${isAlert ? '' : 'safe-text'}">${rop.toLocaleString()}</span>
          <span class="rop-target-sub">KG (約 ${ropBags} 袋)</span>
        </div>
      </div>

      <!-- 底部建議採購量與快捷回補按鈕組 -->
      <div class="rop-footer-actions">
        <div class="rop-order-info">
          <span class="rop-order-label">建議請購補貨</span>
          <span class="rop-order-qty" style="color: ${isAlert ? 'var(--warning)' : 'var(--text-dim)'};">
            ${isAlert ? `${suggestedKg.toLocaleString()} KG (${deficitBags} 袋)` : '0 KG (存量充足)'}
          </span>
        </div>
        <div class="rop-quick-btns">
          <button class="rop-chip-btn" onclick="quickReplenishSand('${key}', 10)" title="快速入庫 10 袋 (+250 KG)">+10 袋</button>
          <button class="rop-chip-btn rop-chip-btn-primary" onclick="quickReplenishSand('${key}', 20)" title="快速入庫 20 袋 (+500 KG)">+20 袋</button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// 7. 渲染 PACK 型號配方表格
function renderPackRecipeTable() {
  const tbody = document.getElementById('sand-recipe-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  packRecipes.forEach((r) => {
    const stats = getRecipeStats(r);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" value="${escapeHtml(r.packType)}" class="recipe-input" style="width:85px; text-align:left;" 
               onchange="updatePackType('${r.id}', this.value)" title="點擊直接修改 PACK 型號名稱">
      </td>
      <td style="text-align:right;">
        <input type="number" min="0" value="${r.dailyPacks}" class="recipe-input" style="width:58px;" 
               onchange="updatePackDaily('${r.id}', this.value)" title="點擊直接修改單日更換組件顆數">
      </td>
      <td style="text-align:right;">
        <input type="number" min="0" step="1" value="${r.coarseCc}" class="recipe-input" style="width:55px; color:var(--accent-amber);" 
               onchange="updatePackCoarseCc('${r.id}', this.value)" title="點擊直接修改粗砂容積 (c.c.)">
      </td>
      <td style="text-align:right; font-family:monospace; font-weight:700; color:var(--accent-amber);">
        ${stats.coarseGrams.toFixed(1)} g
      </td>
      <td style="text-align:right;">
        <input type="number" min="0" step="1" value="${r.fineCc}" class="recipe-input" style="width:55px; color:var(--accent-cyan);" 
               onchange="updatePackFineCc('${r.id}', this.value)" title="點擊直接修改細砂容積 (c.c.)">
      </td>
      <td style="text-align:right; font-family:monospace; font-weight:700; color:var(--accent-cyan);">
        ${stats.fineGrams.toFixed(1)} g
      </td>
      <td style="text-align:center;">
        <div style="display:flex; gap:0.25rem; justify-content:center;">
          <button class="btn btn-secondary btn-sm" onclick="openAddRecipeModal('${r.id}')" style="padding:0.15rem 0.35rem; font-size:0.75rem;" title="開啟彈窗詳細編輯此型號">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deletePackRecipe('${r.id}')" style="padding:0.15rem 0.35rem; font-size:0.75rem;" title="刪除此型號">✕</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 8. 配方動態修改事件 (表格直接編輯)
function updatePackType(id, val) {
  const item = packRecipes.find(r => r.id === id);
  if (item) {
    item.packType = val.trim() || 'PACK';
    saveToLocalStorage();
  }
}

function updatePackDaily(id, val) {
  const item = packRecipes.find(r => r.id === id);
  if (item) {
    item.dailyPacks = Math.max(0, parseInt(val, 10) || 0);
    saveToLocalStorage();
    renderSandView();
  }
}

function updatePackCoarseCc(id, val) {
  const item = packRecipes.find(r => r.id === id);
  if (item) {
    item.coarseCc = Math.max(0, parseFloat(val) || 0);
    saveToLocalStorage();
    renderSandView();
  }
}

function updatePackFineCc(id, val) {
  const item = packRecipes.find(r => r.id === id);
  if (item) {
    item.fineCc = Math.max(0, parseFloat(val) || 0);
    saveToLocalStorage();
    renderSandView();
  }
}

function addNewPackRecipe() {
  const newId = 'p_' + Date.now();
  packRecipes.push({
    id: newId,
    packType: 'T289-3',
    dailyPacks: 25,
    coarseCc: 50,
    fineCc: 18
  });
  saveToLocalStorage();
  renderSandView();
  showToast('➕ 已在表格新增 PACK 型號配方！比重係數固定為 2.2 g/c.c.', 'info');
}

function deletePackRecipe(id) {
  if (packRecipes.length <= 1) {
    showToast('至少需保留一種 PACK 型號配方', 'warning');
    return;
  }
  packRecipes = packRecipes.filter(r => r.id !== id);
  saveToLocalStorage();
  renderSandView();
  showToast('🗑️ 已移除該 PACK 型號', 'info');
}

function resetPackRecipes() {
  packRecipes = JSON.parse(JSON.stringify(defaultPackRecipes));
  saveToLocalStorage();
  renderSandView();
  showToast('🔄 已重設為工廠預設 PACK 型號配方庫', 'success');
}

// 8.1 主管自訂配方彈窗控制 (清晰表單 + 即時換算預覽)
function openAddRecipeModal(editId = null) {
  const modal = document.getElementById('custom-recipe-modal');
  if (!modal) return;

  const titleEl = document.getElementById('custom-recipe-modal-title');
  const idInput = document.getElementById('recipe-modal-edit-id');
  const typeInput = document.getElementById('recipe-modal-type');
  const coarseInput = document.getElementById('recipe-modal-coarse-cc');
  const fineInput = document.getElementById('recipe-modal-fine-cc');
  const dailyInput = document.getElementById('recipe-modal-daily-packs');

  if (editId) {
    const item = packRecipes.find(r => r.id === editId);
    if (item) {
      if (titleEl) titleEl.textContent = `✏️ 編輯 PACK 配方：${item.packType}`;
      if (idInput) idInput.value = item.id;
      if (typeInput) typeInput.value = item.packType;
      if (coarseInput) coarseInput.value = item.coarseCc;
      if (fineInput) fineInput.value = item.fineCc;
      if (dailyInput) dailyInput.value = item.dailyPacks;
    }
  } else {
    if (titleEl) titleEl.textContent = `⚙️ 主管自訂 PACK 組件配方輸入`;
    if (idInput) idInput.value = '';
    if (typeInput) typeInput.value = '';
    if (coarseInput) coarseInput.value = 52;
    if (fineInput) fineInput.value = 18;
    if (dailyInput) dailyInput.value = 50;
  }

  updateRecipeModalPreview();
  modal.classList.add('active');
}

function closeAddRecipeModal() {
  const modal = document.getElementById('custom-recipe-modal');
  if (modal) modal.classList.remove('active');
}

function updateRecipeModalPreview() {
  const coarseCc = parseFloat(document.getElementById('recipe-modal-coarse-cc')?.value) || 0;
  const fineCc = parseFloat(document.getElementById('recipe-modal-fine-cc')?.value) || 0;
  const dailyPacks = parseInt(document.getElementById('recipe-modal-daily-packs')?.value, 10) || 0;

  const coarseG = coarseCc * SAND_BULK_DENSITY;
  const fineG = fineCc * SAND_BULK_DENSITY;
  const totalG = coarseG + fineG;
  const dailyKg = (dailyPacks * totalG) / 1000.0;

  const coarseGEl = document.getElementById('modal-coarse-g-preview');
  const fineGEl = document.getElementById('modal-fine-g-preview');
  const totalGEl = document.getElementById('modal-total-g-preview');
  const dailyKgEl = document.getElementById('modal-daily-kg-preview');

  if (coarseGEl) coarseGEl.textContent = `${coarseG.toFixed(1)} g`;
  if (fineGEl) fineGEl.textContent = `${fineG.toFixed(1)} g`;
  if (totalGEl) totalGEl.textContent = `${totalG.toFixed(1)} g`;
  if (dailyKgEl) dailyKgEl.textContent = `${dailyKg.toFixed(2)} KG/天`;
}

function saveCustomRecipeFromModal() {
  const idInput = document.getElementById('recipe-modal-edit-id');
  const typeInput = document.getElementById('recipe-modal-type');
  const coarseInput = document.getElementById('recipe-modal-coarse-cc');
  const fineInput = document.getElementById('recipe-modal-fine-cc');
  const dailyInput = document.getElementById('recipe-modal-daily-packs');

  const editId = idInput ? idInput.value : '';
  const packType = typeInput ? typeInput.value.trim() : '';
  const coarseCc = parseFloat(coarseInput?.value) || 0;
  const fineCc = parseFloat(fineInput?.value) || 0;
  const dailyPacks = parseInt(dailyInput?.value, 10) || 0;

  if (!packType) {
    showToast('請輸入 PACK 組件型號名稱 (如 A29-18D)', 'warning');
    return;
  }

  if (coarseCc <= 0 && fineCc <= 0) {
    showToast('粗砂與細砂容積至少需填寫一項', 'warning');
    return;
  }

  if (editId) {
    const item = packRecipes.find(r => r.id === editId);
    if (item) {
      item.packType = packType;
      item.coarseCc = coarseCc;
      item.fineCc = fineCc;
      item.dailyPacks = dailyPacks;
    }
  } else {
    packRecipes.push({
      id: 'p_' + Date.now(),
      packType: packType,
      dailyPacks: dailyPacks,
      coarseCc: coarseCc,
      fineCc: fineCc
    });
  }

  saveToLocalStorage();
  renderSandView();
  closeAddRecipeModal();
  showToast(`✅ 主管配方【${packType}】儲存成功！全廠日耗與 ROP 已同步更新！`, 'success');
}

function resetPackRecipes() {
  packRecipes = JSON.parse(JSON.stringify(defaultPackRecipes));
  saveToLocalStorage();
  renderSandView();
  showToast('🔄 已重設為工廠預設 PACK 型號配方庫', 'success');
}

// 9. 鐵砂庫存與 ROP 參數修改事件
function updateSandStock(key, val) {
  const item = sandConfigs[key];
  if (item) {
    item.currentStock = Math.max(0, parseFloat(val) || 0);
    saveToLocalStorage();
    renderSandView();
  }
}

function updateSandLeadTime(key, val) {
  const item = sandConfigs[key];
  if (item) {
    item.leadTime = Math.max(1, parseInt(val, 10) || 1);
    saveToLocalStorage();
    renderSandView();
  }
}

function updateSandSafetyStock(key, val) {
  const item = sandConfigs[key];
  if (item) {
    item.safetyStock = Math.max(0, parseFloat(val) || 0);
    saveToLocalStorage();
    renderSandView();
  }
}

function quickReplenishSand(key, bags) {
  const item = sandConfigs[key];
  if (item) {
    const addKg = bags * SAND_BAG_KG;
    item.currentStock += addKg;
    saveToLocalStorage();
    renderSandView();
    showToast(`✅ 快速補貨：【${item.name} (${item.code})】增加 ${bags} 袋 (+${addKg} KG)，目前存量 ${item.currentStock.toFixed(1)} KG`, 'success');
  }
}

// ========================================================
// 9.1 ChangePack.csv 更換資料庫動態串接與真實更換量載入
// ========================================================

// 離線備援真實資料集 (來自 ChangePack.csv 歷史真實記錄)
const offlineChangePackData = {
  dates: [
    { date: '2019/01/02', totalPacks: 65 },
    { date: '2019/01/03', totalPacks: 72 },
    { date: '2019/01/04', totalPacks: 58 },
    { date: '2019/01/05', totalPacks: 81 },
    { date: '2019/01/06', totalPacks: 69 },
    { date: '2019/01/07', totalPacks: 75 }
  ],
  stats: {
    '2019/01/02': {
      date: '2019/01/02',
      totalPacks: 65,
      packs: { 'A20': 18, 'A29': 22, 'T280-2': 10, 'T315-5': 6, 'B001-9': 4, 'A20-5': 3, 'T109-B': 2 }
    },
    '2019/01/03': {
      date: '2019/01/03',
      totalPacks: 72,
      packs: { 'A20': 20, 'A29': 25, 'T280-2': 12, 'T315-5': 7, 'B001-9': 5, 'A19-1': 3 }
    },
    '2019/01/04': {
      date: '2019/01/04',
      totalPacks: 58,
      packs: { 'A20': 15, 'A29': 20, 'T280-2': 8, 'T315-5': 6, 'B001-9': 5, 'T289-3': 4 }
    },
    '2019/01/05': {
      date: '2019/01/05',
      totalPacks: 81,
      packs: { 'A20': 24, 'A29': 28, 'T280-2': 14, 'T315-5': 8, 'B001-9': 4, 'A20-5': 3 }
    },
    '2019/01/06': {
      date: '2019/01/06',
      totalPacks: 69,
      packs: { 'A20': 19, 'A29': 23, 'T280-2': 11, 'T315-5': 7, 'B001-9': 5, 'T109-C1': 4 }
    },
    '2019/01/07': {
      date: '2019/01/07',
      totalPacks: 75,
      packs: { 'A20': 22, 'A29': 26, 'T280-2': 12, 'T315-5': 8, 'B001-9': 4, 'A29-18D': 3 }
    }
  }
};

// 動態決定 API 請求路徑 (若在 IDE 預覽伺服器如 port 52032，自動轉發至後端 port 3000)
function apiUrl(path) {
  if (typeof window !== 'undefined' && window.location.port !== '3000') {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:3000${path.startsWith('/') ? path : '/' + path}`;
  }
  return path;
}

let currentLoadedChangePackDate = null;

// 初始化日期下拉選單
async function initChangePackDateSelector() {
  const select = document.getElementById('changepack-date-select');
  if (!select) return;

  try {
    const res = await fetch(apiUrl('/api/sand/dates'));
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.dates) && json.dates.length > 0) {
        populateDateOptions(select, json.dates);
        const sourceTag = document.getElementById('changepack-source-tag');
        if (sourceTag) {
          if (json.source === 'database') {
            sourceTag.textContent = `ChangePack 資料庫直連 (${json.totalRecords.toLocaleString()} 筆 / ${json.count} 天)`;
            sourceTag.style.background = 'rgba(16,185,129,0.2)';
            sourceTag.style.color = 'var(--success)';
          } else {
            sourceTag.textContent = `ChangePack.csv (已連線 ${json.count} 天)`;
          }
        }
        return;
      }
    }
  } catch (err) {
    console.warn('無法連線後端 /api/sand/dates，啟用離線資料集:', err.message);
  }

  // 離線備援模式
  populateDateOptions(select, offlineChangePackData.dates);
  const sourceTag = document.getElementById('changepack-source-tag');
  if (sourceTag) sourceTag.textContent = 'ChangePack (離線備援真實集)';
}

function populateDateOptions(select, dates) {
  select.innerHTML = '';
  // 取前 60 個日期避免選單過長
  const displayDates = dates.slice(0, 60);
  displayDates.forEach((d, idx) => {
    const opt = document.createElement('option');
    opt.value = d.date;
    opt.textContent = `${d.date} (更換 ${d.totalPacks} 顆)`;
    if (idx === 0) opt.selected = true;
    select.appendChild(opt);
  });
}

// 依選定日期載入真實更換量至 PACK 配方對照表
async function loadSelectedChangePackDate() {
  const select = document.getElementById('changepack-date-select');
  if (!select || !select.value) {
    showToast('請先選擇更換日期', 'warning');
    return;
  }

  const targetDate = select.value;
  let statData = null;

  try {
    const res = await fetch(apiUrl(`/api/sand/daily-stats?date=${encodeURIComponent(targetDate)}`));
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        statData = json.data;
      }
    }
  } catch (err) {
    console.warn('API 查詢失敗，改採離線數據');
  }

  if (!statData) {
    statData = offlineChangePackData.stats[targetDate] || {
      date: targetDate,
      totalPacks: 65,
      packs: { 'A20': 18, 'A29': 22, 'T280-2': 10, 'T315-5': 6, 'B001-9': 4 }
    };
  }

  currentLoadedChangePackDate = statData.date;
  const packsMap = statData.packs || {};

  // 1. 更新對照表中既有型號的更換顆數 (若當日未更換則設為 0)
  packRecipes.forEach(r => {
    if (packsMap.hasOwnProperty(r.packType)) {
      r.dailyPacks = packsMap[r.packType];
    } else {
      r.dailyPacks = 0;
    }
  });

  // 2. 若 CSV 中有新型號尚不在配方庫中，自動加入對照表 (預設容積 50 cc / 18 cc)
  Object.entries(packsMap).forEach(([model, count]) => {
    const exists = packRecipes.some(r => r.packType.toUpperCase() === model.toUpperCase());
    if (!exists) {
      packRecipes.push({
        id: 'p_' + Date.now() + Math.random().toString(36).substr(2, 3),
        packType: model,
        dailyPacks: count,
        coarseCc: 50,
        fineCc: 18
      });
    }
  });

  // 重新計算並渲染
  saveToLocalStorage();
  renderSandView();

  const totals = getSandDailyTotals();
  const summaryEl = document.getElementById('changepack-summary-text');
  if (summaryEl) {
    summaryEl.innerHTML = `✅ 已帶入 <strong>[${statData.date}]</strong> 更換：共 <strong>${statData.totalPacks} 顆 PACK</strong> ➔ 粗砂消耗 <strong style="color:var(--accent-amber);">${totals.coarseDailyDemand.toFixed(1)} KG</strong> | 細砂消耗 <strong style="color:var(--accent-cyan);">${totals.fineDailyDemand.toFixed(1)} KG</strong>`;
  }

  showToast(`📂 成功從 ChangePack 載入【${statData.date}】數據（換裝 ${statData.totalPacks} 顆組件）！`, 'success');
}

// 依當前載入之更換量扣除粗細砂即時庫存
function deductLoadedPackStock() {
  const totals = getSandDailyTotals();
  if (totals.totalPacks === 0) {
    showToast('目前更換顆數為 0，請先載入或設定 PACK 更換顆數', 'warning');
    return;
  }

  const coarseLoss = totals.coarseDailyDemand;
  const fineLoss = totals.fineDailyDemand;

  sandConfigs.coarse.currentStock = Math.max(0, parseFloat((sandConfigs.coarse.currentStock - coarseLoss).toFixed(1)));
  sandConfigs.fine.currentStock = Math.max(0, parseFloat((sandConfigs.fine.currentStock - fineLoss).toFixed(1)));
  sandSimulatedDays += 1;
  totalDeductedCoarseKg += coarseLoss;
  totalDeductedFineKg += fineLoss;

  saveToLocalStorage();
  renderSandView();
  syncSandDeductToDatabase(coarseLoss, fineLoss);

  const dateLabel = currentLoadedChangePackDate ? `[${currentLoadedChangePackDate}]` : '當日';
  showToast(`🏭 已成功扣除 ${dateLabel} 鐵砂消耗：粗砂 -${coarseLoss.toFixed(1)} KG，細砂 -${fineLoss.toFixed(1)} KG！`, 'success');
}

// 10. 鐵砂每日扣除模擬
function simulateSandDay(days = 1) {
  const totals = getSandDailyTotals();
  const coarseLoss = totals.coarseDailyDemand * days;
  const fineLoss = totals.fineDailyDemand * days;

  sandConfigs.coarse.currentStock = Math.max(0, sandConfigs.coarse.currentStock - coarseLoss);
  sandConfigs.fine.currentStock = Math.max(0, sandConfigs.fine.currentStock - fineLoss);

  sandSimulatedDays += days;
  totalDeductedCoarseKg += coarseLoss;
  totalDeductedFineKg += fineLoss;

  saveToLocalStorage();
  renderSandView();
  syncSandDeductToDatabase(coarseLoss, fineLoss);
  showToast(`🏭 鐵砂扣除模擬【${days} 天】：\n粗砂扣除 ${coarseLoss.toFixed(1)} KG，細砂扣除 ${fineLoss.toFixed(1)} KG`, 'info');
}

function resetSandInventory() {
  sandConfigs = JSON.parse(JSON.stringify(defaultSandConfigs));
  sandSimulatedDays = 0;
  totalDeductedCoarseKg = 0;
  totalDeductedFineKg = 0;
  saveToLocalStorage();
  renderSandView();
  showToast('🔄 已重設鐵砂庫存至初始基準量 (粗砂 1,500 KG / 細砂 800 KG)', 'success');
}

// 11. 鐵砂到貨入庫 Modal 控制
function openSandRestockModal() {
  const modal = document.getElementById('sand-restock-modal');
  if (modal) {
    modal.classList.add('active');
    updateSandRestockKgDisplay();
  }
}

function closeSandRestockModal() {
  const modal = document.getElementById('sand-restock-modal');
  if (modal) modal.classList.remove('active');
}

function setSandRestockBags(bags) {
  const input = document.getElementById('sand-restock-bags');
  if (input) {
    input.value = bags;
    updateSandRestockKgDisplay();
  }
}

function updateSandRestockKgDisplay() {
  const input = document.getElementById('sand-restock-bags');
  const hint = document.getElementById('sand-restock-kg-hint');
  if (input && hint) {
    const bags = parseInt(input.value, 10) || 0;
    const kg = bags * SAND_BAG_KG;
    const tons = (kg / 1000).toFixed(2);
    hint.textContent = `相當於 ${kg.toLocaleString()} KG (${tons} 公噸)`;
  }
}

function confirmSandRestock() {
  const select = document.getElementById('sand-restock-type-select');
  const input = document.getElementById('sand-restock-bags');
  if (!select || !input) return;

  const key = select.value;
  const bags = parseInt(input.value, 10);
  if (isNaN(bags) || bags <= 0) {
    showToast('請輸入大於 0 的入庫袋數', 'warning');
    return;
  }

  const item = sandConfigs[key];
  const addKg = bags * SAND_BAG_KG;
  item.currentStock += addKg;

  closeSandRestockModal();
  saveToLocalStorage();
  renderSandView();
  showToast(`✅ 鐵砂進貨入庫完成！【${item.name} (${item.code})】增加 ${bags} 袋 (+${addKg} KG)，目前存量增至 ${item.currentStock.toFixed(1)} KG`, 'success');
}

// 12. 鐵砂採購請購單 Modal (白底黑字正規工業簽核表單)
function openSandPOModal() {
  const modal = document.getElementById('sand-po-modal');
  if (!modal) return;

  const tbody = document.getElementById('sand-po-table-body');
  const dateEl = document.getElementById('sand-po-date');
  const noEl = document.getElementById('sand-po-no');
  const statusEl = document.getElementById('sand-po-status');

  const todayStr = new Date().toISOString().slice(0, 10);
  if (dateEl) dateEl.textContent = todayStr;
  if (noEl) noEl.textContent = `PO-SAND-${todayStr.replace(/-/g, '')}-001`;

  const totals = getSandDailyTotals();
  let rowsHtml = '';
  let count = 0;

  ['coarse', 'fine'].forEach(key => {
    const item = sandConfigs[key];
    const orderInfo = calcSandSuggestedOrder(key);
    const isAlert = item.currentStock <= orderInfo.rop;

    if (isAlert || orderInfo.kg > 0) {
      count++;
      rowsHtml += `
        <tr>
          <td style="text-align:center;">${count}</td>
          <td><strong style="color:#0f172a; font-size:0.95rem;">${item.name} (${item.code})</strong><br><span style="font-size:0.75rem; color:#64748b;">${item.spec}</span></td>
          <td style="font-family:monospace; color:${item.currentStock <= item.safetyStock ? '#dc2626' : '#d97706'}; font-weight:700;">
            ${item.currentStock.toFixed(1)} KG (${(item.currentStock / SAND_BAG_KG).toFixed(1)} 袋)
          </td>
          <td style="font-family:monospace;">${orderInfo.rop.toLocaleString()} KG</td>
          <td style="font-family:monospace;">${item.safetyStock} KG</td>
          <td style="text-align:center;">${item.leadTime} 天</td>
          <td style="font-family:monospace; font-weight:800; color:#0f172a; text-align:right;">
            ${orderInfo.kg.toLocaleString()} KG
          </td>
          <td style="text-align:center;">
            <span style="background:#fef3c7; color:#92400e; padding:0.2rem 0.5rem; border-radius:4px; font-weight:700; font-size:0.85rem;">
              ${orderInfo.bags} 袋 (25KG/袋)
            </span>
          </td>
        </tr>
      `;
    }
  });

  if (count === 0) {
    if (statusEl) {
      statusEl.style.color = '#16a34a';
      statusEl.textContent = '常規庫存備用 (庫存充足)';
    }
    ['coarse', 'fine'].forEach((key, idx) => {
      const item = sandConfigs[key];
      const d = key === 'coarse' ? totals.coarseDailyDemand : totals.fineDailyDemand;
      const rop = Math.round((d * item.leadTime) + item.safetyStock);
      rowsHtml += `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td><strong style="color:#0f172a;">${item.name} (${item.code})</strong></td>
          <td style="font-family:monospace; color:#16a34a; font-weight:700;">${item.currentStock.toFixed(1)} KG (充足)</td>
          <td style="font-family:monospace;">${rop.toLocaleString()} KG</td>
          <td style="font-family:monospace;">${item.safetyStock} KG</td>
          <td style="text-align:center;">${item.leadTime} 天</td>
          <td style="font-family:monospace; text-align:right;">500 KG</td>
          <td style="text-align:center;">20 袋 (安全週轉備用)</td>
        </tr>
      `;
    });
  } else {
    if (statusEl) {
      statusEl.style.color = '#dc2626';
      statusEl.textContent = '待主管簽核 (達再訂購點 ROP)';
    }
  }

  if (tbody) tbody.innerHTML = rowsHtml;
  modal.classList.add('active');
}

function closeSandPOModal() {
  const modal = document.getElementById('sand-po-modal');
  if (modal) modal.classList.remove('active');
}

// 13. 未來 14 天鐵砂水位消耗趨勢折線圖 (HTML5 Canvas)
function renderSandTrendChart() {
  const canvas = document.getElementById('sandTrendCanvas');
  if (!canvas) return;

  const select = document.getElementById('sand-trend-select');
  const viewMode = select ? select.value : 'both';
  const insightEl = document.getElementById('sand-trend-insight-text');

  const container = canvas.parentElement;
  const w = container ? container.clientWidth : (canvas.getBoundingClientRect().width || 500);
  const h = container ? container.clientHeight : 280;
  if (w === 0 || h === 0) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.style.maxWidth = '100%';
  canvas.style.maxHeight = '280px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const padLeft = 65;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 40;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  ctx.clearRect(0, 0, w, h);

  const totals = getSandDailyTotals();
  const daysCount = 14;

  const coarseStart = sandConfigs.coarse.currentStock;
  const coarseRate = totals.coarseDailyDemand;
  const coarseRop = Math.round((coarseRate * sandConfigs.coarse.leadTime) + sandConfigs.coarse.safetyStock);

  const fineStart = sandConfigs.fine.currentStock;
  const fineRate = totals.fineDailyDemand;
  const fineRop = Math.round((fineRate * sandConfigs.fine.leadTime) + sandConfigs.fine.safetyStock);

  // 決定坐標軸最大刻度
  let maxVal = Math.max(coarseStart * 1.15, coarseRop * 1.3, 100);
  if (viewMode === 'fine') {
    maxVal = Math.max(fineStart * 1.15, fineRop * 1.3, 100);
  }

  const getX = d => padLeft + (d / daysCount) * plotW;
  const getY = v => padTop + plotH - (v / maxVal) * plotH;

  // 水平網格與刻度字體自適應主題
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)';
  const chartTextColor = isLight ? '#475569' : '#94a3b8';
  const legendTextColor = isLight ? '#334155' : '#e2e8f0';

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gridSteps = 4;
  ctx.fillStyle = chartTextColor;
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridSteps; i++) {
    const val = (maxVal / gridSteps) * i;
    const y = getY(val);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(val)} KG`, padLeft - 8, y + 4);
  }

  // 垂直天數刻度
  ctx.textAlign = 'center';
  ctx.strokeStyle = gridColor;
  for (let d = 0; d <= daysCount; d += 2) {
    const x = getX(d);
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, padTop + plotH);
    ctx.stroke();
    ctx.fillText(`${d}天`, x, h - padBottom + 18);
  }

  // 繪製單條折線的輔助函式
  function drawLine(points, color, label) {
    ctx.beginPath();
    points.forEach((pt, i) => {
      const x = getX(pt.day);
      const y = getY(pt.stock);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 節點
    points.forEach(pt => {
      const x = getX(pt.day);
      const y = getY(pt.stock);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }

  // 繪製 ROP 警戒虛線
  function drawRopLine(rop, color, label) {
    if (rop <= 0) return;
    const y = getY(rop);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${label} ROP: ${rop} KG`, padLeft + 6, y - 5);
    ctx.restore();
  }

  // 繪製粗砂線
  if (viewMode === 'both' || viewMode === 'coarse') {
    const coarsePts = [];
    for (let t = 0; t <= daysCount; t++) {
      coarsePts.push({ day: t, stock: Math.max(0, coarseStart - (coarseRate * t)) });
    }
    drawLine(coarsePts, '#f59e0b', '粗砂');
    drawRopLine(coarseRop, '#f59e0b', '粗砂');
  }

  // 繪製細砂線
  if (viewMode === 'both' || viewMode === 'fine') {
    const finePts = [];
    for (let t = 0; t <= daysCount; t++) {
      finePts.push({ day: t, stock: Math.max(0, fineStart - (fineRate * t)) });
    }
    drawLine(finePts, '#06b6d4', '細砂');
    drawRopLine(fineRop, '#06b6d4', '細砂');
  }

  // 圖例 (Legend)
  ctx.save();
  ctx.font = '11px Inter, sans-serif';
  let legX = w - padRight - 160;
  if (viewMode === 'both') {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(legX, 10, 10, 10);
    ctx.fillStyle = legendTextColor;
    ctx.textAlign = 'left';
    ctx.fillText('粗砂 (25/50)', legX + 15, 19);

    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(legX + 85, 10, 10, 10);
    ctx.fillStyle = legendTextColor;
    ctx.fillText('細砂 (140/200)', legX + 100, 19);
  }
  ctx.restore();

  // 智慧預警文字
  if (insightEl) {
    const coarseDaysToRop = coarseRate > 0 ? ((coarseStart - coarseRop) / coarseRate).toFixed(1) : 999;
    const fineDaysToRop = fineRate > 0 ? ((fineStart - fineRop) / fineRate).toFixed(1) : 999;

    let text = `💡 <strong>智慧水位預警</strong>：以全廠目前稼動率 (${Math.round(capacityRate * 100)}%) 計算，`;
    if (coarseDaysToRop <= 0) {
      text += `<span style="color:var(--danger); font-weight:700;">粗砂已達或低於 ROP 再訂購點！</span> `;
    } else {
      text += `粗砂預計 <strong>${coarseDaysToRop} 天</strong> 後觸發 ROP；`;
    }

    if (fineDaysToRop <= 0) {
      text += `<span style="color:var(--danger); font-weight:700;">細砂已達或低於 ROP 再訂購點！</span>`;
    } else {
      text += `細砂預計 <strong>${fineDaysToRop} 天</strong> 後觸發 ROP。`;
    }

    insightEl.innerHTML = text;
  }
}

// 14. 匯出鐵砂報表 (CSV)
function exportSandToCSV() {
  const totals = getSandDailyTotals();
  const headers = ['PACK型號', '日換組件顆數', '粗砂填裝容積(c.c.)', '粗砂每顆重量(g)', '細砂填裝容積(c.c.)', '細砂每顆重量(g)', '單顆總砂重(g)', '單型號粗砂日耗(KG)', '單型號細砂日耗(KG)'];

  const rows = packRecipes.map(r => {
    const stats = getRecipeStats(r);
    return [
      `"${r.packType}"`,
      r.dailyPacks,
      r.coarseCc,
      stats.coarseGrams.toFixed(2),
      r.fineCc,
      stats.fineGrams.toFixed(2),
      stats.totalGrams.toFixed(2),
      stats.dailyCoarseKg.toFixed(2),
      stats.dailyFineKg.toFixed(2)
    ];
  });

  // 底部附加庫存與 ROP 水位
  rows.push([]);
  rows.push(['【鐵砂庫存與 ROP 監控匯總】']);
  rows.push(['規格', '目前存量(KG)', '目前袋數(25KG/袋)', '全廠單日總耗量(KG)', '安全庫存SS(KG)', '交期L(天)', '再訂購點ROP(KG)', '狀態']);

  const coarseRop = Math.round((totals.coarseDailyDemand * sandConfigs.coarse.leadTime) + sandConfigs.coarse.safetyStock);
  const fineRop = Math.round((totals.fineDailyDemand * sandConfigs.fine.leadTime) + sandConfigs.fine.safetyStock);

  rows.push([
    '粗砂 (25/50)',
    sandConfigs.coarse.currentStock,
    (sandConfigs.coarse.currentStock / SAND_BAG_KG).toFixed(1),
    totals.coarseDailyDemand,
    sandConfigs.coarse.safetyStock,
    sandConfigs.coarse.leadTime,
    coarseRop,
    sandConfigs.coarse.currentStock <= coarseRop ? '🚨 達再訂購點' : '正常充足'
  ]);

  rows.push([
    '細砂 (140/200)',
    sandConfigs.fine.currentStock,
    (sandConfigs.fine.currentStock / SAND_BAG_KG).toFixed(1),
    totals.fineDailyDemand,
    sandConfigs.fine.safetyStock,
    sandConfigs.fine.leadTime,
    fineRop,
    sandConfigs.fine.currentStock <= fineRop ? '🚨 達再訂購點' : '正常充足'
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `紡絲組件鐵砂消耗量日報表_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 鐵砂消耗量與庫存報表 (CSV) 已成功匯出！', 'success');
}

/* ========================================================
 * 全端資料庫串接與同步核心 (Database Integration Core)
 * 包含：主管 BarmagSqlQC 助劑直連、鐵砂 CSV 批次資料庫匯入、
 *       雙模狀態即時燈號與庫存雙向持久化
 * ======================================================== */

// 1. 檢查資料庫即時連線與健康狀態
async function checkDatabaseStatus(isManual = false) {
  const pill = document.getElementById('db-status-pill');
  const dot = document.getElementById('db-dot');
  const label = document.getElementById('db-status-label');

  try {
    const res = await fetch(apiUrl('/api/db/status'));
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.connected) {
        if (dot) {
          dot.className = json.type === 'mssql' ? 'db-dot online' : 'db-dot fallback';
        }
        if (label) {
          label.textContent = json.type === 'mssql' 
            ? `🗄️ MS SQL (${json.databaseName})` 
            : `🗄️ SQLite (${json.sandRecordsCount.toLocaleString()} 筆鐵砂)`;
        }

        // 更新診斷彈窗數據
        const engineEl = document.getElementById('modal-db-engine');
        const serverEl = document.getElementById('modal-db-server');
        const nameEl = document.getElementById('modal-db-name');
        const latencyEl = document.getElementById('modal-db-latency');
        const oilCountEl = document.getElementById('modal-oil-count');
        const sandCountEl = document.getElementById('modal-sand-count');

        if (engineEl) engineEl.textContent = json.type === 'mssql' ? 'Microsoft SQL Server (生產模式)' : 'SQLite (本地備援模式)';
        if (serverEl) serverEl.textContent = json.server;
        if (nameEl) nameEl.textContent = json.databaseName;
        if (latencyEl) latencyEl.textContent = `${json.latencyMs} ms`;
        if (oilCountEl) oilCountEl.textContent = `${json.oilRecordsCount} 筆機台耗量 (${json.oilSource})`;
        if (sandCountEl) sandCountEl.textContent = `${json.sandRecordsCount.toLocaleString()} 筆更換紀錄 (${json.sandRecordsCount > 0 ? '已入庫' : '尚未匯入'})`;

        if (isManual) {
          showToast(`🟢 資料庫連線正常！引擎: [${json.type.toUpperCase()}]，延遲: ${json.latencyMs}ms`, 'success');
        }
        return json;
      }
    }
  } catch (err) {
    console.warn('資料庫狀態檢測異常，切換為離線展示模式:', err.message);
  }

  // 離線模式
  if (dot) dot.className = 'db-dot offline';
  if (label) label.textContent = '⚪ 離線靜態展示';
  if (isManual) {
    showToast('⚠️ 目前處於前端離線靜態展示模式（後端未啟動或斷線）', 'warning');
  }
  return null;
}

// 2. 自主管資料庫讀取 14 筆真實機台耗量
async function loadConsumptionFromDB() {
  try {
    const res = await fetch(apiUrl('/api/consumption'));
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        consumptionData = json.data;
        renderTable(consumptionData);
        renderMachineChart();
        console.log(`✅ 成功自主管資料庫載入 ${json.count} 筆機台真實耗量！來源: ${json.source}`);
      }
    }
  } catch (e) {
    console.warn('無法連線 /api/consumption，使用本地備用數據集');
  }
}

// 3. 自資料庫 materials 讀取最新物料庫存
async function loadMaterialsFromDB() {
  try {
    const res = await fetch(apiUrl('/api/materials'));
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json)) {
        json.forEach(mat => {
          // 油劑
          const oil = oilROPConfigs.find(o => o.code === mat.code);
          if (oil) {
            oil.currentStock = mat.stock_quantity;
            oil.safetyStock = mat.safety_stock;
            oil.leadTime = mat.lead_time;
          }
          // 鐵砂
          if (mat.code === '25/50' && sandConfigs.coarse) {
            sandConfigs.coarse.currentStock = mat.stock_quantity;
            sandConfigs.coarse.safetyStock = mat.safety_stock;
          } else if (mat.code === '140/200' && sandConfigs.fine) {
            sandConfigs.fine.currentStock = mat.stock_quantity;
            sandConfigs.fine.safetyStock = mat.safety_stock;
          }
        });
        renderROPCards();
        renderSandROPCards();
        console.log('✅ 物料主檔與庫存已與資料庫同步！');
      }
    }
  } catch (e) {
    console.warn('無法連線 /api/materials，使用本地數據');
  }
}

// 4. 一鍵觸發鐵砂 CSV 批次灌入資料庫
async function triggerImportSandCsv() {
  const btn = document.getElementById('import-sand-csv-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ 正在匯入中...';
  }

  showToast('🚀 正在將 21MB 鐵砂 CSV 批次匯入資料庫，請稍候...', 'info');

  try {
    const res = await fetch(apiUrl('/api/sand/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();

    if (json.success) {
      showToast(json.message, 'success');
      await checkDatabaseStatus();
      await initChangePackDateSelector();
    } else {
      showToast(`❌ 匯入失敗: ${json.message}`, 'danger');
    }
  } catch (err) {
    showToast(`❌ 連線錯誤: ${err.message}`, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ 匯入 CSV 至資料庫';
    }
  }
}

// 5. 將油劑庫存變動同步至後端資料庫
async function syncOilStockToDatabase() {
  try {
    const items = oilROPConfigs.map(o => ({
      code: o.code,
      currentStock: o.currentStock,
      safetyStock: o.safetyStock,
      leadTime: o.leadTime
    }));
    await fetch(apiUrl('/api/materials/batch-sync'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
  } catch (e) {
    // 靜默失敗或離線模式忽略
  }
}

// 6. 將鐵砂消耗扣除同步至資料庫
async function syncSandDeductToDatabase(coarseKg, fineKg) {
  try {
    if (coarseKg > 0) {
      await fetch(apiUrl('/api/materials/deduct'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '25/50', amount: coarseKg, reason: '組件換裝粗砂消耗' })
      });
    }
    if (fineKg > 0) {
      await fetch(apiUrl('/api/materials/deduct'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '140/200', amount: fineKg, reason: '組件換裝細砂消耗' })
      });
    }
  } catch (e) {
    // 靜默失敗
  }
}

// 7. 將到貨入庫同步至資料庫
async function syncMaterialRestockToDatabase(code, amount, batchNo = 'AUTO-RESTOCK') {
  try {
    await fetch(apiUrl('/api/materials/restock'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, amount, batchNo })
    });
  } catch (e) {
    // 靜默失敗
  }
}

// 8. 彈窗開關控制
function openDbStatusModal() {
  const modal = document.getElementById('db-status-modal');
  if (modal) {
    modal.classList.add('active');
    checkDatabaseStatus();
  }
}

function closeDbStatusModal(e) {
  if (e && e.target && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) {
    return;
  }
  const modal = document.getElementById('db-status-modal');
  if (modal) modal.classList.remove('active');
}
