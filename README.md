# 🏭 畢業專題：紡絲助劑與鐵砂智能庫存管理系統 (Smart Inventory System)

本專題專為化纖紡絲與製造工廠研發，結合**「紡絲助劑批號與有效期限追蹤」**、**「鐵砂研磨耗材目數規格管理」**、**「先進先出 (FIFO) 智能庫存預警」**與**「業界最高標準三層式安全資料庫連線」**，具備雙層角色權限控制 (RBAC) 與零安全漏洞保證。

---

## 📸 系統功能展示實測截圖

### 1. 庫存總覽看板與物料卡片 (紡絲助劑 & 鐵砂)
![庫存總覽看板](C:\Users\Bernie\.gemini\antigravity-ide\brain\973f6ad3-b0bc-48b4-bd97-8b8e12a59dbb\dashboard_overview_1789366928638.png)

### 2. 智能預警雷達 (低庫存缺口計算 & 30天即期 FIFO 建議)
![智能預警雷達](C:\Users\Bernie\.gemini\antigravity-ide\brain\973f6ad3-b0bc-48b4-bd97-8b8e12a59dbb\alert_radar_tab_1789366939860.png)

### 3. 生產領料申請與主管審核出庫中心
![領料審核中心](C:\Users\Bernie\.gemini\antigravity-ide\brain\973f6ad3-b0bc-48b4-bd97-8b8e12a59dbb\requisition_audit_tab_1789366951767.png)

---

## ⚡ 系統如何開啟與使用？

### 方式 A：免安裝任何環境，點擊立即使用 (離線雙模引擎)
直接點擊在瀏覽器開啟：
👉 **[開啟系統首頁 (index.html)](file:///c:/Users/Bernie/.gemini/antigravity/畢業專題/public/index.html)**
> 網頁內建智慧模擬引擎，所有的進貨登記、領料申請、主管審核、智能預警計算與 SQL 注入攻防演示皆可 100% 正常操作！

### 方式 B：一鍵啟動 Node.js 後端伺服器
在檔案總管中雙擊 **[啟動系統.bat](file:///c:/Users/Bernie/.gemini/antigravity/畢業專題/啟動系統.bat)**，將自動啟動伺服器並在瀏覽器連線 `http://localhost:3000`。

---

## 🔑 雙層角色權限設計 (RBAC)

系統右上角提供**「一鍵切換操作身分」**功能，專題口試時可即時切換演示：

| 角色身分 | 代表帳號 | 可操作之業務權限 |
| :--- | :--- | :--- |
| **倉儲主管 (管理員)** | `admin` | 審核產線領料申請（核准扣庫存 / 駁回）、維護物料規格主檔、查看安全稽核日誌 |
| **產線技術員 (現場)** | `operator_bernie` | 庫存即時盤點、登記供應商進貨入庫、提交生產領料出庫申請單 |

---

## 🛡️ 資料庫連線安全性與漏洞防護 (畢業專題口試必備)

1. **三層式架構隔離**：前端瀏覽器不直接連線資料庫，必須經過後端 API（Express）過濾與驗證。
2. **防範 SQL 注入 (Anti-SQLi)**：物料查詢、進出庫寫入 100% 採用 **Prepared Statements 參數化預編譯查詢**，即使在搜尋框輸入 `' OR '1'='1` 也只會作為純文字比對。
3. **環境變數隔離 (`.env`)**：資料庫連線帳密置於 `.env`，由 `.gitignore` 自動排除，避免上傳 GitHub 洩密。
4. **防範水平與垂直越權 (IDOR / Broken Access Control)**：領料單審核與物料維護強制在後端驗證 `role === 'admin'`，一般人員無法跨權操作。
5. **密碼安全**：採用 **Bcrypt 10 輪加鹽雜湊**，防範離線彩虹表攻擊。
