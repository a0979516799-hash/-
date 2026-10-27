/**
 * ========================================================
 * 畢業專題：漏洞攻防實驗室 (Live Security Testing Lab)
 * 具備「真後端連線」與「離線即時模擬」雙模引擎
 * ========================================================
 */

// 1. SQL 注入攻擊對比測試
async function runSqliTest() {
  const inputEl = document.getElementById('sqli-input');
  const payload = inputEl.value.trim();

  if (!payload) {
    showToast('請輸入或選擇一組 SQL 測試 Payload', 'warning');
    return;
  }

  const btn = document.getElementById('btn-run-sqli');
  btn.disabled = true;
  btn.innerText = '正在發送測試請求...';

  const vulBox = document.getElementById('vul-sqli-result');
  const secBox = document.getElementById('sec-sqli-result');

  vulBox.innerHTML = '<div style="color:var(--text-dim);">執行中...</div>';
  secBox.innerHTML = '<div style="color:var(--text-dim);">執行中...</div>';

  try {
    let data;
    // 嘗試向後端請求
    try {
      const res = await fetch('/api/demo/sqli-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: payload })
      });
      if (res.ok) {
        data = await res.json();
      }
    } catch (netErr) {
      // 若無後端伺服器（純本機瀏覽模式），啟動內建客戶端攻防模擬引擎
      data = simulateSqliEngine(payload);
    }

    if (!data || !data.success) {
      data = simulateSqliEngine(payload);
    }

    // 渲染脆弱版本結果 (未參數化拼接)
    const vul = data.vulnerableArchitecture;
    let vulHtml = `
      <div style="color:${vul.secretLeaked ? 'var(--danger)' : 'var(--warning)'}; font-weight:700; margin-bottom:0.5rem;">
        ${vul.status}
      </div>
      <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">
        執行 SQL: <code style="color:#f87171;">${escapeHtml(vul.sqlExecuted)}</code>
      </div>
      <div style="font-size:0.82rem;">回傳筆數: <strong>${vul.resultCount}</strong> 筆</div>
    `;

    if (vul.error) {
      vulHtml += `<div style="color:var(--danger); font-size:0.8rem; margin-top:0.4rem;">資料庫語法報錯: ${escapeHtml(vul.error)}</div>`;
    } else if (vul.results && vul.results.length > 0) {
      vulHtml += `<div style="margin-top:0.5rem; max-height:120px; overflow-y:auto; font-size:0.78rem;">`;
      vul.results.forEach(r => {
        vulHtml += `
          <div style="padding:0.25rem 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            • [${r.is_secret === 1 ? '<span style="color:#ef4444; font-weight:bold;">機密遭竊!</span>' : '公開'}] 
            <strong>${escapeHtml(r.title)}</strong>: ${escapeHtml(r.content ? r.content.slice(0, 30) : '')}...
          </div>
        `;
      });
      vulHtml += `</div>`;
    }
    vulBox.innerHTML = vulHtml;

    // 渲染安全版本結果 (參數化查詢 Prepared Statements)
    const sec = data.safeArchitecture;
    let secHtml = `
      <div style="color:var(--success); font-weight:700; margin-bottom:0.5rem;">
        ${sec.status}
      </div>
      <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">
        參數化模板: <code style="color:#38bdf8;">${escapeHtml(sec.sqlExecuted)}</code><br>
        綁定參數 (Bound Params): <code style="color:#a7f3d0;">${escapeHtml(JSON.stringify(sec.boundParameter))}</code>
      </div>
      <div style="font-size:0.82rem;">精確比對筆數: <strong>${sec.resultCount}</strong> 筆</div>
      <div style="font-size:0.78rem; color:var(--text-dim); margin-top:0.5rem;">
        💡 註：資料庫引擎已在編譯階段鎖定查詢語法，任何輸入皆僅作為「純字串內容」，駭客無法竄改 SQL 邏輯。
      </div>
    `;
    secBox.innerHTML = secHtml;

    showToast('SQL 注入測試完成！請觀察兩側對照。', 'success');
  } catch (err) {
    showToast('測試過程發生異常: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerText = '⚡ 發動對比測試';
  }
}

// 內建客戶端離線 SQL 模擬引擎 (免伺服器亦可 100% 演示攻防原理)
function simulateSqliEngine(payload) {
  const allNotes = [
    { id: 1, title: '系統最高機密日誌', content: '此為管理者專屬機密文件，包含資料庫金鑰與最高管理權限資訊。', is_secret: 1 },
    { id: 2, title: '畢業專題研究筆記', content: '今日研究主題：OWASP Top 10 安全連線架構與防禦機制實作。', is_secret: 0 },
    { id: 3, title: '資料庫安全連線心得', content: '1. 切勿直接拼接 SQL。 2. 帳密放置於 .env 並使用 .gitignore。', is_secret: 0 }
  ];

  const dangerousSql = `SELECT id, title, content, is_secret FROM notes WHERE title LIKE '%${payload}%'`;

  // 檢查是否包含經典 SQL 注入 Payload 特徵
  const isAttack = /(\bor\b.*=.*|'|union\b|--)/i.test(payload);
  let vulResults = [];
  let secretLeaked = false;

  if (isAttack) {
    // 注入成功：回傳包含私密項目的所有資料
    vulResults = [...allNotes];
    secretLeaked = true;
  } else {
    // 普通搜尋
    vulResults = allNotes.filter(n => n.title.includes(payload) && n.is_secret === 0);
  }

  // 安全參數化結果：只會精準比對整個字串，絕不外洩機密
  const secResults = allNotes.filter(n => n.title.includes(payload) && n.is_secret === 0);

  return {
    success: true,
    userInput: payload,
    safeArchitecture: {
      method: 'Prepared Statements (參數化查詢 / 預編譯)',
      sqlExecuted: 'SELECT id, title, content, is_secret FROM notes WHERE title LIKE ? AND is_secret = 0',
      boundParameter: [`%${payload}%`],
      resultCount: secResults.length,
      results: secResults,
      status: '✅ 攻擊無效！惡意字元被當作普通文字比對，機密資料完好無損。'
    },
    vulnerableArchitecture: {
      method: 'Raw String Concatenation (傳統危險字串拼接)',
      sqlExecuted: dangerousSql,
      resultCount: vulResults.length,
      results: vulResults,
      secretLeaked: secretLeaked,
      status: secretLeaked 
        ? '🚨 嚴重漏洞！SQL 語法遭竄改，機密資料已完全外洩！' 
        : '⚠️ 此寫法存在高風險注入隱患。'
    }
  };
}

// 快速帶入 SQL Payload
function setSqliPayload(val) {
  const input = document.getElementById('sqli-input');
  input.value = val;
  runSqliTest();
}

// 2. XSS 跨站腳本攻擊前端防禦展示
function runXssTest() {
  const input = document.getElementById('xss-input').value;
  if (!input) {
    showToast('請輸入 XSS 測試程式碼', 'warning');
    return;
  }

  const vulBox = document.getElementById('vul-xss-result');
  const secBox = document.getElementById('sec-xss-result');

  // 1. 脆弱展示
  vulBox.innerHTML = `
    <div style="color:var(--danger); font-weight:700; margin-bottom:0.4rem;">⚠️ 危險寫法 (直接放入 innerHTML)</div>
    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">若惡意腳本包含 &lt;img onerror=...&gt; 或內嵌事件，將直接於使用者瀏覽器觸發！</div>
    <div style="border:1px dashed rgba(239,68,68,0.4); padding:0.5rem; border-radius:4px; font-size:0.82rem; background:rgba(239,68,68,0.05);">
      ${input}
    </div>
  `;

  // 2. 安全展示
  secBox.innerHTML = `
    <div style="color:var(--success); font-weight:700; margin-bottom:0.4rem;">✅ 安全實作 (使用 textContent / 安全跳脫)</div>
    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">HTML 標籤已全數轉譯為實體字符，杜絕腳本執行：</div>
    <div id="safe-xss-text-node" style="border:1px dashed rgba(16,185,129,0.4); padding:0.5rem; border-radius:4px; font-size:0.82rem; background:rgba(16,185,129,0.05); font-family:monospace;">
    </div>
  `;
  document.getElementById('safe-xss-text-node').textContent = input;

  showToast('XSS 渲染防護對比完成！', 'success');
}

// 快速帶入 XSS Payload
function setXssPayload(val) {
  document.getElementById('xss-input').value = val;
  runXssTest();
}

// 3. 暴力破解與 Rate Limit 測試
let bruteForceCount = 0;
async function testBruteForceRateLimit() {
  const statusEl = document.getElementById('brute-force-status');
  const btn = document.getElementById('btn-brute-test');
  bruteForceCount++;

  statusEl.innerHTML = `<span style="color:var(--warning);">正在進行第 ${bruteForceCount} 次連續惡意密碼猜解...</span>`;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'WrongPassword_' + bruteForceCount })
    });

    const data = await res.json();

    if (res.status === 429) {
      renderBruteBlockUI(statusEl, btn, data.message);
    } else {
      statusEl.innerHTML = `
        <div style="color:var(--text-muted); font-size:0.85rem;">
          第 ${bruteForceCount} 次嘗試：回應 ${res.status} (${data.message})
        </div>
        <div style="font-size:0.78rem; color:var(--text-dim); margin-top:0.2rem;">
          繼續點擊以達到限制門檻 (15 次)...
        </div>
      `;
    }
  } catch (err) {
    // 離線模擬支援：第 5 次就展示攔截效果
    if (bruteForceCount >= 5) {
      renderBruteBlockUI(statusEl, btn, '🚨 登入嘗試次數過多，為確保帳戶安全已暫時限制此 IP 的存取 (HTTP 429 Too Many Requests)。');
    } else {
      statusEl.innerHTML = `
        <div style="color:var(--text-muted); font-size:0.85rem;">
          第 ${bruteForceCount} 次嘗試：密碼錯誤 (剩餘 ${5 - bruteForceCount} 次觸發防禦)
        </div>
      `;
    }
  }
}

function renderBruteBlockUI(statusEl, btn, msg) {
  statusEl.innerHTML = `
    <div style="color:var(--danger); font-weight:800; font-size:1.05rem;">
      🚨 防禦成功觸發！HTTP 429 Too Many Requests
    </div>
    <div style="color:var(--text-muted); font-size:0.85rem; margin-top:0.3rem;">
      ${msg}
    </div>
    <div style="color:var(--accent-cyan); font-size:0.8rem; margin-top:0.3rem;">
      ✔ 系統已主動將此攻擊行為記錄至安全稽核日誌 (security_logs)。
    </div>
  `;
  btn.disabled = true;
  btn.innerText = '已觸發安全封鎖 (冷卻中)';
  showToast('Rate Limit 防火牆成功攔截暴力破解！', 'danger');
}

// 工具：跳脫 HTML 字符
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
