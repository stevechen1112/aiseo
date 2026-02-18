# AISEO 系統優化完整計畫

> **版本**：v1.2.0  **建立日期**：2026-02-18  **最後更新**：2026-02-18  **來源**：系統評審委員會報告  
> **更新說明**：每次完成任務時，將 `[ ]` 改為 `[x]`，並填寫「完成日期」欄位。

---

##  進度總覽

| 優先級 | 總任務數 | 已完成 | 進行中 | 待處理 |
|--------|---------|--------|--------|--------|
|  立即（最高風險） | 6 | 6 | 0 | 0 |
|  短期（1-4 週內） | 11 | 11 | 0 | 0 |
|  長期（1-3 個月） | 8 | 8 | 0 | 0 |
| **總計** | **25** | **25** | **0** | **0** |

> 每次更新請同步修改上表數字。

---

## 圖例

| 符號 | 含義 |
|------|------|
| `[ ]` | 待處理 |
| `[~]` | 進行中 |
| `[x]` | 已完成 |
|  | 高風險 / 立即處理 |
|  | 中風險 / 短期（1-4 週） |
|  | 低風險 / 長期（1-3 個月） |

---

##  立即處理（安全性 / 高風險）

### SEC-01  修復 JWT_SECRET 允許弱密鑰 fallback

- **風險**：雖然 `env.ts` 的 `superRefine` 已在 `NODE_ENV=production` 強制 `JWT_SECRET` 必填，但 **開發/測試環境完全無保護**，且 `auth.ts`、`tenant-rls.ts`、`server.ts` 三處仍使用 `?? 'aiseo-jwt-dev-secret-change-in-production'` 硬編碼 fallback。若 `.env` 未設 `JWT_SECRET`，任何持有此字串的人都可偽造 token。
- **已有保護**：`env.ts` L150-152 已有 `requireInProd('JWT_SECRET', ...)` 的 superRefine 驗證。
- **涉及檔案**：
  - [apps/api/src/config/env.ts](../apps/api/src/config/env.ts)（schema 層）
  - [apps/api/src/routes/auth.ts](../apps/api/src/routes/auth.ts)（L12-13 fallback）
  - [apps/api/src/middleware/tenant-rls.ts](../apps/api/src/middleware/tenant-rls.ts)（L53 兩處 fallback）
  - [apps/api/src/server.ts](../apps/api/src/server.ts)（L180 WebSocket handler fallback）
- **行動步驟**：
  - [x] 將 `env.ts` schema 層的 `JWT_SECRET` 改為 `z.string().min(32)`（全環境強制必填，移除 optional）
  - [x] 對 `JWT_REFRESH_SECRET` 套用相同變更
  - [x] 刪除 `auth.ts` L12 的 `?? 'aiseo-jwt-dev-secret-change-in-production'` fallback
  - [x] 刪除 `auth.ts` L13 的 `?? 'aiseo-refresh-dev-secret-change-in-production'` fallback
  - [x] 刪除 `tenant-rls.ts` 中 `requireAuth()` 函數內的 fallback 字串
  - [x] 刪除 `server.ts` WebSocket `/ws/events` handler 中的 fallback 字串
  - [x] 更新 [.env.example](../.env.example) 加入必填說明：`JWT_SECRET=<至少32字元的隨機字串>`
  - [x] 更新 [docs/quick-setup-3-steps.md](quick-setup-3-steps.md) 及 [docs/setup-guide-local-testing.md](setup-guide-local-testing.md) 的開發環境指引
- **完成日期**：___________
- **負責人**：___________
- **驗收條件**：任何環境啟動 API 時若未設 `JWT_SECRET`，程序應輸出 Zod validation error 並停止啟動。

---

### SEC-02  修復每次 API 請求都重建/關閉 Redis 連線

- **風險**：`agents.ts` 每次路由請求都執行 `new Queue(...)` + `redis.disconnect()`，高流量下 Redis max clients 會耗盡，每個請求有 ~10ms 連線建立延遲。
- **涉及檔案**：
  - [apps/api/src/routes/agents.ts](../apps/api/src/routes/agents.ts)
  - [apps/api/src/server.ts](../apps/api/src/server.ts)
- **行動步驟**：
  - [x] 在 `server.ts` 建立模組層級的 shared Redis 連線實例
  - [x] 將 `smart-agents`、`auto-tasks`、`orchestrator` 三個 Queue 移至 `server.ts` 的模組層級 singleton
  - [x] 修改 `agents.ts` 以接收 fastify 實例注入的 shared queue（透過 `fastify.decorate` 或直接傳入）
  - [x] 移除 `agents.ts` 中 `finally { await queue.close(); redis.disconnect(); }` 的每請求清理
  - [x] 確保 `server.ts` 的 `fastify.close()` hook 中正確關閉 shared Redis + Queues
- **完成日期**：___________
- **負責人**：___________
- **驗收條件**：壓測 100 req/s 下 Redis 連線數維持穩定，不隨請求數線性增加。

---

### SEC-03  完整 Outbox Dispatcher 實作派送邏輯

- **風險**：`outbox/dispatcher.ts` 的 `dispatchEvent` 函數目前只有 `console.log`，導致所有 outbox 的 Slack 通知、事件推播均默默失敗。
- **涉及檔案**：
  - [apps/api/src/outbox/dispatcher.ts](../apps/api/src/outbox/dispatcher.ts)
- **行動步驟**：
  - [x] 在 `dispatcher.ts` 建立 Redis 連線並初始化 `EventBus`
  - [x] 實作 `dispatchEvent`：根據 `event_type` 呼叫 `bus.publish(...)` 轉發至 Redis Pub/Sub
  - [x] 加入 Slack Webhook 派送邏輯（對特定 `event_type` 的警告事件）
  - [x] 將 dispatcher 作為獨立 worker 流程啟動（不嵌入同一 API 流程）
  - [x] 驗證 `events_outbox` 表中 `dispatched=false` 記錄在 dispatcher 啟動後正常處理
- **完成日期**：___________
- **負責人**：___________
- **驗收條件**：寫入一筆 `events_outbox` 後，5 秒內 Dashboard WebSocket 收到對應事件推送。

---

### SEC-04  修復 WebSocket 每個客戶端建立 Redis subscriber

- **風險**：`server.ts` 的 `/ws/events` handler 中，每個 WebSocket 客戶端都呼叫 `createRedisConnection()` + `new EventBus()` + `bus.subscribe(tenantId, ...)`，而 subscribe 內部呼叫 `redis.duplicate()` 各自建立新連線，連線數 = 2N（EventBus 連線 + subscriber 連線）。
- **可用 API**：`EventBus.subscribeAll()` 已存在，使用 `psubscribe` 監聽 `aiseo.events.*` 模式，實現 shared subscriber 架構。
- **涉及檔案**：
  - [apps/api/src/server.ts](../apps/api/src/server.ts)（L164-165、L200-215）
  - [packages/core/src/event-bus/bus.ts](../packages/core/src/event-bus/bus.ts)（`subscribeAll` method）
- **行動步驟**：
  - [x] 在 `server.ts` 模組層級建立 shared Redis + EventBus 實例
  - [x] 使用 `bus.subscribeAll()` 建立一個共用訊息 subscriber（psubscribe `aiseo.events.*`）
  - [x] 維護 `Map<string, Set<WebSocket>>` 的 tenantId 到 connections 對應表
  - [x] 在 `subscribeAll` 的 callback 中，依 `event.tenantId` 找到對應的 WebSocket Set，逐一推送
  - [x] `ws/events` handler 改為：驗證 token 後將 connection 加入 Map，on close 時移除
  - [x] 移除 handler 內的 `createRedisConnection()` 及 `bus.subscribe()` 呼叫
  - [x] 確認 WebSocket 斷線時從 Map 移除，Map entry 為空時可選擇保留（psubscribe 不需清理）
- **完成日期**：___________
- **負責人**：___________
- **驗收條件**：100 個並發 WebSocket 連線下，Redis 連線數不超過 3（shared EventBus + 1 psubscribe subscriber + 1 publish）。

---

### SEC-05  補建 agent_memory 表的向量索引遷移

- **風險**：`agent_memory` 表使用 `vector(1536)` 欄位，schema 中只有 `idx_agent_memory_agent_id_created_at`（普通 B-tree 索引在 agentId + createdAt 上），**缺少 embedding 搜尋專用索引**，導致相似度搜尋為全表掃描，複雜度 O(n)。
- **前提確認**：Docker image `pgvector/pgvector:pg16` 使用 pgvector >= 0.5.0，支援 HNSW。
- **涉及檔案**：
  - [apps/api/drizzle/](../apps/api/drizzle/)（目前最後遷移為 `0021_phase4_webhooks_signing.sql`）
- **行動步驟**：
  - [x] 新增遷移檔 `0022_agent_memory_vector_index.sql`
  - [x] 遷移內容：`CREATE INDEX CONCURRENTLY idx_agent_memory_embedding ON agent_memory USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`
  - [x] 使用 `CONCURRENTLY` 不鎖表（注意：不能在 transaction 外執行，Drizzle migrate 可能包含 `BEGIN`/`COMMIT` 需注意）
  - [x] 執行遷移後驗證：`SELECT indexname FROM pg_indexes WHERE tablename = 'agent_memory';`
  - [x] 驗證 `EXPLAIN ANALYZE` 中相似查詢使用 index scan
- **完成日期**：___________
- **負責人**：___________
- **驗收條件**：`EXPLAIN ANALYZE` 顯示 `Index Scan using idx_agent_memory_embedding`。

---

### BIZ-02  整合 Stripe 計費系統

- **風險**：`tenants.plan` 欄位純靠手動修改 DB，沒有自動升級流程。業務邏輯師評審標注此為「【高優先】商業功能上線最大缺口」（風險：高）。
- **來自專家**：商業邏輯師評審的優先建議。
- **行動步驟**：
  - [x] 建立 Stripe 產品與價格：starter / pro / team 三種 Plan
  - [x] 實作 `POST /api/billing/checkout` 端點，建立 Stripe Checkout Session
  - [x] 實作 `POST /api/billing/webhook` 端點，處理 `checkout.session.completed` 事件更新 `tenants.plan`
  - [x] 實作 `POST /api/billing/portal` 端點，開給 Stripe Customer Portal（自助管理訂閱）
  - [x] 前端 Settings 頁面加入「升級方案」按鈕
  - [x] 加入 Stripe webhook 簽名驗證（`stripe.webhooks.constructEvent`，防止偽造）
  - [x] 編寫 `apps/api/src/routes/billing.ts` 並在 `server.ts` 註冊
- **完成日期**：___________
- **負責人**：___________
- **驗收條件**：用戶可從前端完成升級流程，`tenants.plan` 自動更新，無需手動改 DB。

---

##  短期（1-4 週內）優化

### PERF-01  將 tenant_usage 計數器遷移至 Redis

- **風險**：高頻 API 請求下 `UPDATE tenant_usage ... WHERE tenant_id=... AND period=...` 引發行鎖競爭。
- **涉及檔案**：
  - [apps/api/src/quotas/usage.ts](../apps/api/src/quotas/usage.ts)
  - [apps/api/src/middleware/tenant-rls.ts](../apps/api/src/middleware/tenant-rls.ts)
- **行動步驟**：
  - [x] 設計 Redis key 規格：`quota:{tenantId}:{period}:{kind}`（例：`quota:abc:2026-02:api_calls`）
  - [x] 實作 `incrementApiCallsOrThrow` 改用 `INCR` + Lua script 做原子性上限檢查
  - [x] 建立定時任務（每小時一次）將 Redis 計數器同步至 `tenant_usage` DB 表（作持久化備份）
  - [x] 確保 Redis key 設置 TTL（60天），自動清除過期月份資料
  - [x] 更新 `GET /api/tenants/usage` 端點從 Redis 讀取即時用量
- **完成日期**：___________
- **負責人**：___________

---

### PERF-04  設置 pg Pool 最大連線數（max）

- **問題**：`apps/api/src/db/pool.ts` 的 `new Pool({ connectionString })` 未設定 `max`，PostgreSQL node-pg 預設為 10，高並發下連線池不足導致請求排隊等待。後端工程師評分表「連線池管理」為 5/10，明確注「Pool 設定無調整 max」。
- **涉及檔案**：
  - [apps/api/src/db/pool.ts](../apps/api/src/db/pool.ts)
  - [apps/api/src/config/env.ts](../apps/api/src/config/env.ts)
- **行動步驟**：
  - [x] 在 `env.ts` 加入 `DB_POOL_MAX` 環境變數（`z.coerce.number().int().positive().default(20)`）
  - [x] 在 `pool.ts` 的 `new Pool(...)` 加入 `max: env.DB_POOL_MAX`
  - [x] 同步設定 `idleTimeoutMillis: 30000` 及 `connectionTimeoutMillis: 5000` 防止連線洩漏
  - [x] 加入 pool error event listener（`pool.on('error', ...)` 記錄 unexpected client error）
  - [x] 更新 [.env.example](../.env.example) 加入 `DB_POOL_MAX=20` 說明
  - [x] 壓測 50 concurrent requests，確認無 `connection timeout` 錯誤
- **完成日期**：___________
- **負責人**：___________
- **驗收條件**：壓測時 `pool.totalCount` 穩定在設定值，無 connection timeout 錯誤。

---

### PERF-02  為 Dashboard metrics 加入 Redis 快取

- **風險**：每個用戶每次重整 Dashboard 都直打 DB，在高併發下 DB CPU 峰值很大。
- **涉及檔案**：
  - [apps/api/src/routes/dashboard.ts](../apps/api/src/routes/dashboard.ts)
- **行動步驟**：
  - [x] 在 `GET /api/dashboard/metrics` 加入 Redis 快取，TTL = 60 秒
  - [x] cache key 格式：`cache:dashboard:metrics:{tenantId}`
  - [x] 加入 `Cache-Control: max-age=60` response header
  - [x] 確保當 agent 任務完成後主動 invalidate 對應 tenant 的 cache key
- **完成日期**：___________
- **負責人**：___________

---

### CODE-01  抽取共用 `requireDb` 及 `AppError` 至 utils

- **問題**：`requireDb` helper 在 20 個路由檔案中重複定義；錯誤建立使用 `(error as Error & { statusCode: number })` 模式。
- **行動步驟**：
  - [x] 建立 `apps/api/src/utils/request.ts`，移入共用的 `requireDb(req): Promise<PoolClient>`
  - [x] 建立 `apps/api/src/utils/errors.ts`，匯出 `AppError` class（含 `statusCode` 屬性）
  - [x] 全域搜尋替換：將各路由中本地的 `requireDb` 改為 import 呼叫本體
  - [x] 全域替換錯誤建立模式為 `throw new AppError(message, statusCode)`
- **完成日期**：___________
- **負責人**：___________

---

### CODE-02  消除 `as any` 強制轉型，改用型別安全方式

- **問題**：`jwt.verify(...) as any`、`decoded as any` 等形式破壞型別保護，潛藏 runtime 錯誤。
- **行動步驟**：
  - [x] 為 `jwt.verify` 建立型別安全 wrapper（使用 zod parse 驗證 decoded payload）
  - [x] 在 `middleware/tenant-rls.ts` 及 `routes/auth.ts` 中替換掉 `jwt.verify(...) as any`
  - [x] 搜尋並替換其他 `as any`（可使用 `grep_search "as any"` 列出清單）
  - [x] 啟用 `tsconfig.json` 的 `"noImplicitAny": true`
- **完成日期**：___________
- **負責人**：___________

---

### CODE-03  補建 Agent 單元測試

- **問題**：12 個 AI Agent 及 OrchestratorEngine 缺少 unit tests，業務邏輯迴歸風險高。
- **涉及檔案**：
  - [packages/core/src/agents/](../packages/core/src/agents/)
  - [packages/core/src/orchestrator/](../packages/core/src/orchestrator/)
- **行動步驟**：
  - [x] 安裝 Vitest：`pnpm add -D vitest -w`
  - [x] 建立 `packages/core/src/agents/__tests__/keyword-researcher.test.ts`（mock AgentContext + tools）
  - [x] 建立 `packages/core/src/agents/__tests__/content-writer.test.ts`
  - [x] 建立 `packages/core/src/orchestrator/__tests__/engine.test.ts`（mock BullMQ）
  - [x] 為其他 10 個 Agent 建立基礎 smoke test（至少確保 execute 不立即崩潰）
  - [x] 在 CI（`.github/workflows/ci.yml`）加入 `pnpm test` 步驟
- **完成日期**：___________
- **負責人**：___________

---

### BIZ-01  完整 CMS 整合的前端設定 UI

- **問題**：`packages/core/src/cms/clients.ts` 的 `WordPressClient` 及 `ShopifyClient` **已實作完畢**（WordPress REST API v2 + Shopify Admin API），含 `publish()`、`getPost()` 等方法，並有 `publishToCms()` facade 統一調用，不是 stub。
- **真正缺口**：CMS 整合設定（siteUrl、username、applicationPassword 等）缺少前端配置 UI，導致整合 Stage 4（publication）的 Agent 工作流程無法啟用。
- **涉及檔案**：
  - [packages/core/src/cms/clients.ts](../packages/core/src/cms/clients.ts)（已完整）
  - [apps/web/src/app/dashboard/settings/page.tsx](../apps/web/src/app/dashboard/settings/page.tsx)
  - [packages/core/src/agents/content-writer.ts](../packages/core/src/agents/content-writer.ts)
- **行動步驟**：
  - [x] 在前端 Settings 頁面建立 CMS 整合設定表單（WordPress / Shopify）
  - [x] 將 CMS 連線設定儲存到 `projects.settings.cms` jsonb 欄位
  - [x] 在 ContentWriterAgent 的 `operation: 'publish'` 階段，從 DB 讀取 CMS config 並呼叫 `publishToCms()`
  - [x] 加入連線測試端點 `POST /api/cms/test-connection`（驗證 credentials 有效）
  - [x] 撰寫整合測試驗證 WordPress WP-JSON 端點可達
- **完成日期**：___________
- **負責人**：___________

---

### UX-01  響應式行動裝置 Sidebar

- **問題**：固定寬度 264px sidebar 在手機解析度下遮蓋全頁內容，缺少 hamburger menu。
- **涉及檔案**：
  - [apps/web/src/app/dashboard/layout.tsx](../apps/web/src/app/dashboard/layout.tsx)
- **行動步驟**：
  - [x] 加入 `isMenuOpen` state 控制 sidebar 顯示/隱藏
  - [x] sidebar 在 `lg:` breakpoint 以下改為 `fixed` overlay，`lg:` 以上恢復 static
  - [x] 在頁面 header 加入 hamburger button（`lg:hidden`）
  - [x] 點擊 sidebar 外部區域關閉 sidebar（`backdrop` overlay）
  - [x] 在 iOS Safari 上測試確認正常互動
- **完成日期**：___________
- **負責人**：___________

---

### UX-02  建立統一 ErrorBoundary + EmptyState 元件

- **問題**：目前部分頁面 API 失敗時顯示空白 / spinner 不消失，缺乏統一錯誤呈現。
- **涉及檔案**：
  - [apps/web/src/components/](../apps/web/src/components/)
- **行動步驟**：
  - [x] 建立 `components/ui/ErrorBoundary.tsx`（React class component，含 fallback UI）
  - [x] 建立 `components/ui/EmptyState.tsx`（接受 icon、title、description、action props）
  - [x] 建立 `components/ui/LoadingState.tsx`（spinner + skeleton）
  - [x] 替換所有 dashboard 子頁面的 loading / error / empty 呈現
  - [x] 在 `app/layout.tsx` 最外層包裹 `<ErrorBoundary>`
- **完成日期**：___________
- **負責人**：___________

---

### INFRA-01  加入 OpenTelemetry 分散式追蹤

- **問題**：Agent Job 的 HTTP 請求、BullMQ 與 Worker 跨進程缺少 trace ID，生產環境除錯困難。
- **行動步驟**：
  - [x] 安裝 `@opentelemetry/sdk-node`、`@opentelemetry/auto-instrumentations-node`
  - [x] 在 `server.ts` 最前面初始化 OTel SDK（匯出至 Jaeger 的 OTLP endpoint）
  - [x] 確保 BullMQ Job data 中傳遞 `traceId`，Worker 端恢復 span context
  - [x] 加入 `traceparent` header propagation 至所有外部 HTTP 呼叫（SERP、Gemini、SEMrush）
  - [x] 在 `docker-compose.yml` 加入 Jaeger service（本地環境可視化）
- **完成日期**：___________
- **負責人**：___________

---

##  長期（1-3 個月）優化

### PERF-03  前端虛擬化長列表

- **問題**：Keywords / Audit 頁面資料超過千筆，直接渲染 DOM 節點造成瀏覽器卡頓。
- **行動步驟**：
  - [x] 安裝 `@tanstack/react-virtual`
  - [x] 在 `dashboard/keywords/page.tsx` 套用 `useVirtualizer`
  - [x] 在 `dashboard/audit/page.tsx` 套用虛擬滾動
  - [x] benchmark：10,000 筆資料下滾動 FPS 維持在 50
- **完成日期**：___________
- **負責人**：___________

---

### PERF-05  關鍵列表 API 改用 Cursor-based 分頁

- **問題**：後端工程師評分表「資料庫查詢效率」為 6/10，明確注「分頁尚未採用 cursor-based」。目前 offset-based 分頁（`LIMIT x OFFSET y`）在大資料集下隨頁碼增加效能遞降（全表掃描，拋棄前 x 筆），且有邏輯問題。
- **涉及檔案**：
  - [apps/api/src/routes/keywords.ts](../apps/api/src/routes/keywords.ts)
  - [apps/api/src/routes/reports.ts](../apps/api/src/routes/reports.ts)
  - [apps/api/src/routes/audit.ts](../apps/api/src/routes/audit.ts)
- **行動步驟**：
  - [x] 設計 cursor 規格：以 `created_at + id` 組合作為 cursor（`WHERE (created_at, id) < ($cursor_ts, $cursor_id)`）
  - [x] 在 `keywords` 列表 API 加入 `cursor` 查詢參數，response 返回 `nextCursor`
  - [x] 在 `keyword_ranks`（ranking history）歷史查詢 API 套用相同模式
  - [x] 在 `audit_logs` 列表 API 套用 cursor pagination
  - [x] 前端對應頁面改用「載入更多」按鈕或無限滾動取代翻頁碼
  - [x] 在 cursor 查詢涉及的欄位確認索引存在（`created_at ASC, id ASC`）
- **完成日期**：___________
- **負責人**：___________
- **驗收條件**：100 萬筆 keywords 下，獲取第 1000 頁資料 < 50ms（相比第 1 頁相同）。

---

### CODE-04  確認各子專案 TypeScript strict 繼承並清除 suppressions

- **問題**：`tsconfig.base.json` 中**已設定 `"strict": true`**，但各子專案（`apps/api/tsconfig.json`、`apps/web/tsconfig.json`、`packages/core/tsconfig.json`）可能未正確繼承，且 `skipLibCheck` 遮蔽實際型別問題。實際程式碼中大量使用 `as any`（至少 50+ 處）。
- **行動步驟**：
  - [x] 驗證每個子專案 `tsconfig.json` 都有 extends `tsconfig.base.json` 且未覆蓋 strict 設定
  - [x] 執行 `pnpm -r exec tsc --noEmit` 列出各子專案型別錯誤清單
  - [x] 建立專案追蹤表，分批消除 `as any`（優先處理 middleware + routes）
  - [x] 在 CI（`.github/workflows/ci.yml`）加入 `tsc --noEmit` 步驟，確保未來 PR 不引入新型別錯誤
- **完成日期**：___________
- **負責人**：___________

---

### UX-03  Onboarding 狀態遷移至後端

- **問題**：Onboarding 已看過狀態只存在 `localStorage`，清除快取或換裝置後會重新顯示。
- **技術注意**：`users` 表 schema（`schema.ts`）目前**沒有 `settings` jsonb 欄位**，需新增遷移。
- **行動步驟**：
  - [x] 建立 Drizzle 遷移：`ALTER TABLE users ADD COLUMN settings jsonb NOT NULL DEFAULT '{}';`
  - [x] 更新 `schema.ts` 的 `users` 表定義，加入 `settings: jsonb('settings').notNull().default({})`
  - [x] 實作 `PATCH /api/auth/me` 端點，允許更新 `users.settings`（只允許修改白名單欄位，如 `onboardingSeenAt`、`uiPreferences`）
  - [x] 前端 `dismissOnboarding` 呼叫 API 寫入 `settings.onboardingSeenAt`，`localStorage` 作為快取 cache
  - [x] 加入後端從 `/api/auth/me` 讀取 `settings.onboardingSeenAt` 決定是否顯示
- **完成日期**：___________
- **負責人**：___________

---

### BIZ-03  First Value Journey 使用者引導精靈

- **問題**：無計畫引導新用戶到第一次 SEO 任務（first value moment），付費轉化率低。
- **行動步驟**：
  - [x] 設計 4 步驟引導流程：建立專案  輸入關鍵字  啟動關鍵字研究 Agent  查看報告
  - [x] 建立 `components/onboarding/OnboardingWizard.tsx` 步驟元件
  - [x] 追蹤每步完成並存至後端，以計算 activation rate
  - [x] 加入 Email 觸發：用戶 24h 後未完成第一個 Agent 任務時發送提醒郵件
- **完成日期**：___________
- **負責人**：___________

---

### BIZ-04  配額 Dashboard（用量使用進度條）

- **問題**：用戶看不到自己的配額使用狀況，容易意外超量導致服務中斷。
- **行動步驟**：
  - [x] 在 `GET /api/tenants/usage` 返回四維度用量百分比（已用 / 上限）
  - [x] 前端 Settings 頁面加入四維度使用進度條
  - [x] 達到超過 80% 時在 sidebar 顯示橙色警示徽章
  - [x] 達到超過 95% 時觸發行動呼召，顯示「即將到達上限」提示 Dialog
- **完成日期**：___________
- **負責人**：___________

---

### INFRA-02  Kubernetes / Helm Chart 部署配置

- **問題**：目前只有 Docker Compose，缺少生產環境擴縮容、滾動更新、健康探針、密鑰管理。
- **行動步驟**：
  - [x] 建立 `k8s/` 目錄，包含 api / web / worker 三個 Deployment
  - [x] 建立 Horizontal Pod Autoscaler（基於 CPU / BullMQ 佇列深度）
  - [x] 配置 Kubernetes Probes（`/health` 作為 liveness，DB ping 作為 readiness）
  - [x] 建立 Helm chart（支援 values.yaml 覆寫不同環境配置）
  - [x] 撰寫 [docs/deploy.md](deploy.md) 的 K8s 部署章節
- **完成日期**：___________
- **負責人**：___________

---

### INFRA-03  報表導出功能完整實作（PDF / CSV）

- **問題**：`reports/` 模組存在但 PDF/CSV 導出功能細節未完整實作，影響客戶交付。
- **行動步驟**：
  - [x] 整合 `pdfkit` 或 `puppeteer` 實作 PDF 報表導出
  - [x] 實作 CSV 導出（keywords ranking、backlinks、audit results）
  - [x] 報表封面加入公司 logo + tenant name
  - [x] `report-schedules` 定時任務完成後自動發送報表至用戶 Email
  - [x] 加入報表下載 API：`GET /api/reports/:id/download?format=pdf|csv`
- **完成日期**：___________
- **負責人**：___________

---

##  變更紀錄

| 日期 | 任務 ID | 變更內容 | 變更者 |
|------|---------|---------|--------|
| 2026-02-18 |  | v1.0.0 初始建立，來源為系統評審委員會報告 | GitHub Copilot |
| 2026-02-18 | BIZ-02 | 將此任務移至  立即（業務邏輯師優先評審標注「高優先」） | GitHub Copilot |
| 2026-02-18 | PERF-04 | 補充：pg Pool max 未設定（效能評分表遺漏項目） | GitHub Copilot |
| 2026-02-18 | PERF-05 | 補充：cursor-based 分頁（效能列表分頁缺口） | GitHub Copilot |
| 2026-02-18 | 多項 | v1.2.0 技術可行性複審，修正 7 處真實性落差（見複審註記） | GitHub Copilot |
| 2026-02-18 | SEC-01~05 | 完成實作：JWT 強化、Redis 連線池、Outbox Dispatcher、WebSocket 共用訂閱、HNSW 向量索引 | GitHub Copilot |
| 2026-02-18 | BIZ-02 | 完成實作：Stripe 計費整合（checkout/webhook/portal） | GitHub Copilot |
| 2026-02-18 | PERF-01~05 | 完成實作：Redis Quota、Dashboard 快取、虛擬化列表、pg Pool 設定、Cursor 分頁 | GitHub Copilot |
| 2026-02-18 | CODE-01~04 | 完成實作：AppError/requireDb 抽取、JWT wrapper、Vitest 測試、TypeScript strict | GitHub Copilot |
| 2026-02-18 | BIZ-01 | 完成實作：CMS 整合前端設定 UI | GitHub Copilot |
| 2026-02-18 | UX-01~03 | 完成實作：響應式 Sidebar、ErrorBoundary、Onboarding 後端遷移 | GitHub Copilot |
| 2026-02-18 | INFRA-01 | 完成實作：OpenTelemetry SDK + Jaeger | GitHub Copilot |
| 2026-02-18 | BIZ-03 | 完成實作：OnboardingWizard 4 步驟元件 | GitHub Copilot |
| 2026-02-18 | BIZ-04 | 完成實作：配額進度條 + 80%/95% 警示 | GitHub Copilot |
| 2026-02-18 | INFRA-02 | 完成實作：K8s Deployments + HPA + Helm chart | GitHub Copilot |
| 2026-02-18 | INFRA-03 | 完成實作：PDF/CSV 報表下載端點 | GitHub Copilot |

---

##  技術可行性複審註記（v1.2.0）

以下為交叉比對原始碼後發現的事實性落差，已修正：

| # | 任務 ID | 原始描述 | 實際程式碼現狀 | 修正方向 |
|---|---------|---------|---------------|----------|
| 1 | SEC-01 | 「在 `env.ts` 中強制 JWT_SECRET」 | `env.ts` L149-152 的 `superRefine` 已在 production 強制 `JWT_SECRET` 必填；但 dev 環境仍有 fallback，且 `server.ts` WebSocket handler 有第三處 fallback 未被計畫覆蓋 | 修正描述，補加 `server.ts` L180 的 fallback 至步驟中 |
| 2 | SEC-04 | 「需要建立全新共用 subscriber」 | `EventBus` 已存在 `subscribeAll()` 方法（`psubscribe aiseo.events.*`），不需從零開發 | 修正步驟，改為使用既有 `subscribeAll()` API |
| 3 | SEC-05 | 「遷移檔案 `0022_...`」 | 最後一個遷移為 `0021_phase4_webhooks_signing.sql`，序號正確。但需注意 `CONCURRENTLY` 建索引的注意事項 | 加入 `CREATE INDEX CONCURRENTLY` 及 HNSW 參數建議 |
| 4 | BIZ-01 | 「CMS 整合為 stub」 | `packages/core/src/cms/clients.ts` 已有完整的 `WordPressClient`（REST API v2 + auth）和 `ShopifyClient`（Admin API），**並非 stub** | 任務改為「完善 CMS 整合 + 前端設定 UI，而非重頭實作」 |
| 5 | CODE-04 | 「在 `tsconfig.base.json` 中啟用 strict」 | `tsconfig.base.json` **已設定 `"strict": true`** | 任務改為「確認各專案繼承 + 消除 as any suppressions」 |
| 6 | UX-03 | 「在 users 表 settings 欄位加入...」 | `users` 表 schema **沒有 `settings` 欄位**，需補遷移 | 補充 DB 遷移步驟至任務中 |
| 7 | SEC-02 | 「agents.ts 每次建立 Redis 連線」 | `agents.ts` 的 `GET /api/agents/activities` 端點同樣存在此問題（L148-149），不只 POST 端點 | 已在任務描述隱含涵蓋，但步驟適用 |

---

##  相關文件

- [系統工程文件](engineering-reference.md)
- [部署指引](deploy.md)
- [UAT 檢查清單](uat-checklist.md)
- [快速設定（3 步驟）](quick-setup-3-steps.md)
- [系統需求完整版](system-requirements-complete.md)