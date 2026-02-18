# AISEO（HTTP 使用者角度）全功能測試腳本

本文件提供一份「從使用者角度」驗證 AISEO 的全功能測試方式：

- **自動化（推薦）**：用 Playwright 走完整流程（可 mock 後端缺失 API）。
- **人工驗收（UAT）**：用瀏覽器逐步點擊，對照期待結果。

> 目標：用同一份腳本快速檢視 Web（HTTP）端的主要功能是否正常，包含 Agents/Keywords/Content/Reports/Settings 等核心模組。

---

## A. 自動化測試（Mock 後端）— 推薦

### 前置條件

- Node.js + pnpm（專案已可 `pnpm install`）

### 執行指令

在 repo 根目錄執行：

- 安裝瀏覽器（只需一次）
  - `corepack pnpm -C apps/web e2e:install`

- 執行「全功能」腳本（會自動起 Web dev server）
  - `corepack pnpm -C apps/web exec playwright test -g "Full product HTTP user journey"`

### 覆蓋範圍（自動化）

自動化腳本位於：

- [apps/web/e2e/full-product.spec.ts](../apps/web/e2e/full-product.spec.ts)

它會以「已登入」的狀態走完整流程（不需真後端）：

1. Dashboard Overview：頁面載入、指標區塊可渲染
2. Agents：Run / Pause / Resume（使用 schedule mocks 驗證互動）
3. Keywords：Quick Win Optimize、Keyword Research Trigger
4. Content：打開 Editor、修改 Title、送出保存（HTTP POST）
5. Reports：Save Template、Generate Now、Create Schedule、Remove Schedule
6. Settings：API Keys → Create key（驗證產生 secret 區塊）

> Mock 端點定義集中在 [apps/web/e2e/utils.ts](../apps/web/e2e/utils.ts)；若 UI 新增了 API 呼叫而測試出現 501，通常代表要補一個 mock。

---

## B. 自動化測試（LIVE：連真後端）

如果要用真後端驗證登入/WS/真資料流程，可使用既有 LIVE UAT 測試：

- [apps/web/e2e/live-uat.spec.ts](../apps/web/e2e/live-uat.spec.ts)

### 前置條件

- 本地已啟動 API + DB + Redis（並能用 3001 存取）
- Web 端環境變數指向正確 API（例如 `AISEO_API_URL`）

### 執行（示例）

- `set LIVE_E2E=1`
- `set AISEO_API_URL=http://localhost:3001`
- `corepack pnpm -C apps/web exec playwright test -g "LIVE UAT"`

> LIVE 測試會真的呼叫 `/api/auth/register`、`/api/auth/login` 並檢查 WebSocket。

---

## C. 人工驗收（UAT）— 瀏覽器點擊版

以 `http://localhost:3000` 進入後，依序驗證：

1. Overview
   - 看到 Dashboard Overview
   - 指標區塊沒有明顯錯誤訊息（例如 Failed to load）

2. Agents
   - 進入 Agent Status Panel
   - 任一 Agent 可 Run / Pause / Resume（看狀態 badge 變化）

3. Keywords
   - Quick Win Opportunities 可點 Optimize，看到成功提示
   - Keyword Research Trigger 輸入 seed keyword 點 Trigger Research（看到 queued/running/結果提示；若 WS 未啟用至少應 queued）

4. Content
   - Content Management 頁面可顯示列表/狀態
   - 進入 Article Editor：修改 Title 後按 Save

5. Reports
   - Custom Report Builder：輸入 Template name → Save Template
   - 既有 Template：Generate Now 成功
   - Schedule：填 email recipients → Create Schedule → Scheduled Reports 出現條目

6. Settings
   - API Keys：輸入 name → Create key → 出現 New API key（可 Copy / Dismiss）

---

## 常見問題

- **Playwright 顯示 `Command "playwright" not found`**
  - 請使用 `corepack pnpm -C apps/web exec playwright ...`（不要直接打 `playwright ...`）。

- **看到 501 (Not Implemented)**
  - 在 mock 模式下代表 UI 呼叫了尚未 mock 的 API；請在 [apps/web/e2e/utils.ts](../apps/web/e2e/utils.ts) 補對應 path。
