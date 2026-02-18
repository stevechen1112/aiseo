# AISEO 企業級多代理 SEO 平台 - 使用者手冊 (User Guide)

本手冊旨在引導管理員與 SEO 專員了解與操作 AISEO 平台的功能。  
每個操作章節均附有 **📚 SEO 教學**，幫助您理解「為什麼要這樣做」，不僅會操作工具，更能建立完整的 SEO 思維。

---

## 目錄

1. [介面導覽與快速入門](#1-介面導覽與快速入門)
2. [關鍵字研究 (Keyword Research)](#21-關鍵字研究-keyword-research)
3. [內容創作 (AI Content Writer)](#22-內容創作-ai-content-writer)
4. [排名追蹤 (Rankings)](#23-serp-排名追蹤-rankings)
5. [技術審核 (Technical Audit)](#24-技術審核-technical-audit)
6. [反向連結分析 (Backlinks)](#25-反向連結分析-backlinks)
7. [企業設定與管理](#3-企業設定與管理-enterprise-settings)
8. [推薦的 SEO 工作流程 (SOP)](#6-推薦的-seo-工作流程-sop)
9. [常見問題 (FAQ)](#7-常見問題-faq)

---

## 1. 介面導覽與快速入門 (UI/UX Overview)

### 1.1 登入與儀表板 (Dashboard)

系統採用現代化深色主題 (Dark Mode) 設計，登入後您將看到主儀表板。

**介面佈局：**
- **左側導航欄 (Sidebar)**：核心功能選單，包含「儀表板」、「關鍵字」、「排名」、「內容」、「技術審核」與「設定」。
- **頂部狀態列 (Top Navigation)**：顯示當前選擇的 **專案 (Project Switcher)**、通知鈴鐺與個人頭像選單。
- **主工作區 (Main Area)**：顯示數據圖表與操作面板。

**儀表板小部件 (Widgets)**：
- **總體排名趨勢 (Ranking Trend)**：根據您的目標關鍵字，顯示近 30 天的平均排名變化。
- **核心關鍵字數據 (Keywords Summary)**：列出前 5 個高流量關鍵字的最新排名與搜尋量。
- **AI 任務動態 (Agent Activity)**：即時顯示 12 個 AI 代理人正在執行的任務 (如：正在爬取網頁、正在生成內容)。

### 1.2 建立首個專案 (Project Setup)

1. **點擊專案切換器**：
   在頂部導航欄左側，點擊當前專案名稱（或 "Select Project"），在下拉選單中選擇 **"Create Project" (建立專案)**。

2. **填寫專案資訊**：
   - **專案名稱 (Name)**：例如 "My E-commerce Shop"。
   - **目標域名 (Domain)**：輸入您的網站網址 (如 `https://example.com`)。
   - **目標國家/語言**：選擇您要優化的搜尋引擎區域 (如 `Google US - English`)。

3. **初始化設定 (Onboarding)**：
   系統會提示您輸入 **3-5 個種子關鍵字**。這將作為 AI 代理人啟動第一次研究的基礎。

> **📚 SEO 教學：什麼是種子關鍵字 (Seed Keywords)?**
> 種子關鍵字是您 SEO 策略的起點，通常是 1-3 個字的核心詞彙，直接代表您的品牌或產品。
> - **好的種子關鍵字**：`running shoes`, `電商平台`, `咖啡烘焙`
> - **避免**：過於廣泛 (如 `鞋子`)，競爭極高；或過於狹窄 (如 `紅色 Nike 男款慢跑鞋 2025`)，幾乎沒人搜尋。
> - **建議**：先列出 3-5 個代表您主要業務的關鍵詞，AI 代理人會幫您自動擴展出數百個長尾詞。

---

## 2. 核心模組操作 (Core Modules)

系統內建 12 個專業的 AI 代理人，分為四大核心模組。

### 2.1 關鍵字研究 (Keyword Research)

**介面說明**：
- **搜尋欄**：輸入關鍵字並選擇國家/地區。
- **結果表格**：包含 `Keyword`, `KD %` (難度), `Volume` (搜尋量), `Intent` (搜尋意圖: I/N/C/T)。
- **聚類圖 (Topic Clusters)**：以視覺化氣泡圖顯示關鍵字的關聯性，相互關聯的關鍵字會聚集為一個「話題群」。

**操作流程**：
1. 前往 **"Keywords" (關鍵字)** 頁面。
2. 點擊右上角的 **"Run AI Research"** 按鈕。
3. 輸入主題，AI 將自動從 SEMrush/Google 資料源擴充 100+ 個相關長尾詞。
4. 勾選有潛力的關鍵字，點擊 **"Rank Track"** 加入排名追蹤，或是 **"Create Content Plan"** 加入內容排程。

> **📚 SEO 教學：如何判斷一個關鍵字是否值得優化？**
>
> 參考表格中的三個核心指標：
>
> | 指標 | 說明 | 建議策略 |
> |---|---|---|
> | **KD % (關鍵字難度)** | 0-100 分，越高代表搜尋結果競爭越激烈 | 新網站優先選擇 KD < 30 的低競爭關鍵字 |
> | **Volume (搜尋量)** | 每月平均搜尋次數 | 平衡高流量與低競爭；長尾詞 (Volume 100-1000) 通常性價比最高 |
> | **Intent (搜尋意圖)** | I=信息型, N=導航型, C=商業型, T=交易型 | 電商優先選 **C/T**，部落格優先選 **I** |
>
> **🎯 Quick Win 策略**：優先選取 **KD < 40 且 Volume > 500** 的 **C/T 意圖**關鍵字，這是新網站最快提升排名的切入點。
>
> **聚類圖 (Topic Cluster) 的意義**：  
> SEO 的核心概念是「主題權威性 (Topical Authority)」。將關鍵字組織成「Topic Cluster」，代表您要圍繞一個核心主題 (Pillar Page) 撰寫多篇相關文章 (Cluster Content)，讓 Google 認為您的網站是該領域的專家。

### 2.2 內容創作 (AI Content Writer)

**介面說明**：
- **行事曆視圖 (Calendar)**：檢視本月計畫發布的內容，可拖拉調整發佈日期。
- **編輯器 (Editor)**：基於 TipTap 的富文本編輯器，右側帶有 **AI 助手側邊欄**。
  - 右側面板上方：`SEO Score`, `Readability`, `Word Count`
  - 右側面板下方：`AI Suggestions` 列出待改善項目，點擊可一鍵修復。

**操作流程**：
1. 前往 **"Content"** 頁面，點擊 **"New Article"**。
2. **AI 輔助寫作**：
   - 在編輯器中選取一段文字，或按下 `/` 鍵呼叫 AI 選單。
   - 選擇 **"Expand" (擴寫)**、**"Rephrase" (重寫)** 或 **"Optimize for SEO" (SEO 優化)**。
3. **SEO 評分檢查**：
   - 右側面板會即時顯示 **SEO Score (0-100)**。
   - 檢查建議項目：如「H1 標籤缺失」、「關鍵字密度過低」、「缺少 Meta Description」。
4. 完成後點擊 **"Export"** 或直接發布 (需串接 CMS)。

> **📚 SEO 教學：一篇 SEO 文章的必要元素**
>
> 請對照編輯器右側的 `AI Suggestions` 確認以下每一項：
>
> | 元素 | 說明 | 範例 |
> |---|---|---|
> | **Title Tag (標題標籤)** | 顯示在 Google 搜尋結果的藍色超連結，限 50-60 字元 | `最佳跑步鞋推薦 2025 – 專業評測` |
> | **Meta Description (摘要)** | 搜尋結果下方的灰色描述，影響點擊率 (CTR)，限 150-160 字元 | `精選 10 款適合初學者到進階跑者的跑鞋，附價格比較...` |
> | **H1 標籤** | 頁面最主要的標題，每頁**只能有一個**，需包含主關鍵字 | `<h1>2025 年最值得入手的跑步鞋</h1>` |
> | **H2/H3 小標** | 文章架構的骨幹，幫助 Google 理解文章層次 | `<h2>初學者推薦款式</h2>` |
> | **關鍵字密度** | 主關鍵字在文中出現的頻率，建議 **1-2%**，不要強行堆砌 | 1000 字文章中出現 10-20 次 |
> | **內部連結 (Internal Link)** | 連結到您網站的其他相關頁面，加強主題權威性 | `了解更多 <a href="/running-tips">跑步訓練技巧</a>` |
> | **圖片 Alt Text** | 圖片的替代描述，讓 Google 理解圖片內容，也有助於圖片搜尋 | `alt="Nike Air Zoom 男款跑步鞋側視圖"` |
>
> **💡 提示**：AI Score 達到 **80 分以上**再發布，Google 有更高機率將文章收錄至搜尋前頁。

### 2.3 SERP 排名追蹤 (Rankings)

**介面說明**：
- **趨勢圖**：顯示 Visibility Index 與平均排名的歷史曲線。點擊圖例可隱藏或單獨查看特定關鍵字的走勢。
- **關鍵字列表**：每一列代表一個關鍵字，顯示 `Current Rank`, `Change (+/-)`, `URL Found`, `SERP Features`。
- **警報設定**：點擊鈴鐺圖示可設定「排名跌出前 10 則通知我」之類的自動警報。

**操作流程**：
- **自動更新**：系統每日凌晨自動執行 SERP 查詢。
- **手動刷新**：點擊右上角的 **"Update Now"** (注意會消耗 API 配額)，代理人將即時查詢最新的 SERP 結果。
- **競爭對手分析**：點擊單一關鍵字，展開查看前 10 名競爭對手的與您的差距分析。

> **📚 SEO 教學：如何解讀排名數據？**
>
> **Visibility Index (能見度指數)**：綜合所有追蹤關鍵字的排名計算出的整體曝光度分數。分數上升代表整體 SEO 表現提升。
>
> **SERP Features (搜尋特殊功能)**：Google 在自然排名之外提供的特殊結果版塊，爭取這些位置可大幅提升流量：
>
> | Feature | 說明 | 如何取得 |
> |---|---|---|
> | **Featured Snippet (精選摘要)** | 顯示在第 0 位的答案框 | 使用問答格式 (Q&A)，直接回答常見問題 |
> | **People Also Ask** | 「大家也問了」相關問題 | 文章涵蓋相關子問題的完整回答 |
> | **Image Pack** | 圖片輪播 | 優化圖片 Alt Text & 使用高品質原創圖 |
> | **Local Pack** | 本地商家地圖 | 完善 Google 我的商家 (GMB) 資料 |
>
> **排名波動是正常現象**：Google 每天都在更新演算法，排名每天上下 1-3 名屬於正常範圍。持續觀察 **7-30 天的趨勢**，而不是每天的數字。

### 2.4 技術審核 (Technical Audit)

**介面說明**：
- **健康分數 (Health Score)**：0-100 分的網站健康度總評，分數低於 70 代表需要立即處理。
- **問題清單 (Issues)**：分為 `Critical` (紅-立即修復), `Warning` (黃-盡快修復), `Notice` (藍-優化建議)。
- **CWV 趨勢圖**：顯示 LCP / CLS / FID 三項 Core Web Vitals 的歷史變化。

**操作流程**：
1. 點擊 **"Start Audit"**。
2. 等待爬蟲完成 (進度條會顯示 Crawled/Total 頁數)。
3. **查看報告**：
   - 點擊 "Broken Links (404)" 查看死鏈清單並逐一修復或重定向。
   - 點擊 "Core Web Vitals" 查看 LCP/CLS 效能指標，對照 Google 的通過門檻。
   - 點擊 "Duplicate Content" 找出重複內容，使用 Canonical 標籤解決。
4. 下載 PDF 報告轉交給開發團隊修復。

> **📚 SEO 教學：技術 SEO 的核心問題與修復方法**
>
> **1. Core Web Vitals (CWV) — Google 的官方排名因素**
>
> | 指標 | 全稱 | 意義 | Google 的通過門檻 |
> |---|---|---|---|
> | **LCP** | Largest Contentful Paint | 最大內容區塊的載入速度 | **< 2.5 秒** |
> | **CLS** | Cumulative Layout Shift | 頁面元素的視覺穩定性 (有無跳動) | **< 0.1** |
> | **INP** | Interaction to Next Paint | 頁面對用戶操作的回應速度 | **< 200ms** |
>
> **2. 常見技術問題修復指南**
>
> | 問題 | 影響 | 修復方式 |
> |---|---|---|
> | 404 死連結 | 浪費爬蟲預算，影響用戶體驗 | 301 永久重定向到正確頁面 |
> | 重複內容 (Duplicate Content) | Google 不確定要排名哪個版本 | 使用 `<link rel="canonical">` 指向主要版本 |
> | 缺少 HTTPS | 安全信號降低，Chrome 顯示警告 | 安裝 SSL 憑證並設置全站 301 重定向 |
> | 圖片過大 | LCP 分數過低 | 壓縮圖片到 < 100KB，使用 WebP 格式 |
> | 無 Sitemap | Google 難以找到所有頁面 | 提交 `sitemap.xml` 到 Google Search Console |
>
> **優先處理順序**：先修 `Critical` (影響收錄與排名) → 再修 `Warning` → 最後優化 `Notice`。

### 2.5 反向連結分析 (Backlinks)

**介面說明**：
- **DA 分布圖**：顯示連結到您網站的外部網域的權威分數 (Domain Authority, DA 0-100) 分布。
- **新增 / 丟失 (Gained/Lost)**：比對過去 30 天新獲得與消失的反向連結。
- **Gap 分析**：比對競爭對手但您沒有的高質量連結來源。

**操作流程**：
1. 前往 **"Backlinks"** 頁面，系統每週自動更新連結資料庫。
2. 點擊 **"Gap Analysis"**，輸入競爭對手域名，找出您尚未取得的潛在高 DA 連結來源。
3. 匯出清單，作為外鏈建設 (Link Building) 的工作清單。

> **📚 SEO 教學：為什麼反向連結如此重要？**
>
> 反向連結 (Backlink) 是指其他網站連結到您網站的超連結。Google 把每一個高質量的反向連結視為「一票信任票」，是決定網站排名的最重要因素之一。
>
> **連結質量的判斷標準**：
>
> | 指標 | 好的來源 | 差的來源 |
> |---|---|---|
> | **Domain Authority (DA)** | DA > 50 的新聞媒體、教育機構 (.edu)、政府 (.gov) | DA < 10 的垃圾網站 |
> | **Relevance (相關性)** | 與您的行業高度相關的網站 | 完全不相關的網站 |
> | **Link Type** | `dofollow` 連結傳遞 SEO 權重 | `nofollow` 連結不傳遞權重  |
>
> **建立反向連結的合法方式 (White Hat)**：
> - **Guest Post (客座寫作)**：向相關媒體投稿高質量文章，換取一個連結。
> - **資源型內容 (Linkable Assets)**：製作免費工具、深度研究報告、圖表等值得被引用的內容。
> - **媒體報導 (PR)**：透過新聞稿或 HARO (Help A Reporter Out) 等平台接受媒體採訪。
> - **損壞連結建設 (Broken Link Building)**：找到競爭對手頁面上的 404 連結，提議以您的內容替代。

---

## 3. 企業設定與管理 (Enterprise Settings)

前往左下角的 **"Settings" (設定)** 圖示，進入管理面板。

### 3.1 團隊權限管理 (Team & RBAC)

**介面位置**：Settings > Team Members
- **邀請成員**：點擊 **"Invite Member"**，輸入 Email 並選擇角色。
- **角色說明**：
  - **Admin**：最高權限，可管理金流、全域設定。
  - **Manager**：專案經理，可管理內容與關鍵字，但不可刪除專案。
  - **Analyst**：唯讀權限，僅能查看報表與分析數據。

### 3.2 開發者工具 (API & Webhooks)

**介面位置**：Settings > Developer
- **API Keys**：
  - 點擊 **"Create New Key"**。
  - **注意**：金鑰 (Secret) 只會顯示一次，請務必複製保存。
- **Webhooks**：
  - 設定 **Payload URL** (您的伺服器接收端點)。
  - 勾選訂閱事件：`rankings.updated`, `audit.completed`, `content.generated`。

### 3.3 稽核與備份 (Audit & Backups)

**介面位置**：Settings > Security
- **Audit Logs**：查看「誰」在「什麼時間」做了「什麼動作」(如 User X deleted Project Y)。
- **備份還原**：
  - **Export Data**：下載當前專案的完整 JSON 備份。
  - **Restore**：上傳備份檔以還原數據 (僅限 Admin)。

---

## 6. 推薦的 SEO 工作流程 (SOP)

> **📚 SEO 教學：新網站 / 新專案的標準 SEO 作業程序**

以下是建議您每月執行一次的標準 SEO 工作流：

```
第 1 步 (第 1 週)：技術基礎審查
  └─ 執行 Technical Audit → 先修復所有 Critical 問題
  └─ 確認 Google Search Console 已連接並提交 Sitemap

第 2 步 (第 1-2 週)：關鍵字策略建立
  └─ 執行 AI Keyword Research，取得關鍵字清單
  └─ 依照 KD × Volume × Intent 篩選優先目標
  └─ 使用聚類圖組織 Topic Clusters
  └─ 將高優先級關鍵字加入排名追蹤

第 3 步 (第 2-4 週)：內容創作與優化
  └─ 依據 Topic Cluster 規劃發布行事曆 (每週 2-4 篇)
  └─ 使用 AI Content Writer 起草文章骨架
  └─ 確認每篇文章 SEO Score ≥ 80 再發布
  └─ 發布後 24 小時內在 Search Console 提交新頁面索引

第 4 步 (持續進行)：數據監控與迭代
  └─ 每週查看排名趨勢，找出快速爬升的關鍵字
  └─ 對排名 11-20 的文章進行 "On-Page 優化"（補充內容、改善標題）
  └─ 每月執行一次技術審核，確認健康分數不下滑
  └─ 每季進行連結差距分析，規劃外鏈建設目標
```

**⏱ 預期時程**：SEO 是長期投資。一般來說，新文章需要 **3-6 個月**才能在競爭性關鍵字上看到顯著排名。低競爭長尾詞可在 **4-8 週**內見效。

---

## 7. 常見問題 (FAQ)

**Q: 為什麼我的 AI 生成內容顯示「配額不足 (Quota Exceeded)」?**  
A: 每個專案或帳戶都有設定「API 呼叫上限」或「字數上限」。請聯繫您的管理員在 Settings > Usage 的「配額設定 (Rate Limits)」中調升限額。

**Q: 如何更換 AI 模型（例如從本機 Ollama 切換至 Google Gemini）?**  
A: 管理員可在系統環境變數中設定 `LLM_PROVIDER=gemini`，並填入 `GOOGLE_GENERATIVE_AI_API_KEY`，重啟服務後生效。

**Q: AI 生成的內容會不會影響 SEO (被 Google 降權)?**  
A: Google 的政策是「評估內容質量，而非內容產出方式」。只要文章對讀者有真實幫助、資訊正確、符合 E-E-A-T 原則（經驗、專業、可信度、可靠性），AI 輔助生成的內容不會被降權。**請務必在發布前由人工審查 AI 初稿的事實正確性。**

**Q: 排名突然大幅下滑，可能是什麼原因?**  
A: 常見原因依序為：① Google 核心演算法更新 (查看 Google Search Status Dashboard) ② 競爭對手發布了更高質量的內容 ③ 網站發生技術問題 (立即執行技術審核) ④ 遭受負面 SEO 攻擊 (查看反向連結頁面是否有大量垃圾連結)。

---

## 8. 尋求支援 (Support)

如果您遇到任何問題，請聯絡開發團隊或參閱開發者的 [技術說明文件](../README.md)。
