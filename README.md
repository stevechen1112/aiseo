# AISEO - 企業級多代理 SEO 平台 (Enterprise Multi-Agent SEO Platform)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.x-black.svg)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-black.svg)](https://www.fastify.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)

> **專案狀態**: 全部優化任務完成 (100%)，編譯驗證通過，可進行正式部署。
> **最後更新**: 2026-02-19 — 優化 v2 交付完成（25 項功能 + 9 項 code review 修正 + 2 項收尾）。

AISEO 是一個高度自動化、基於代理人框架 (Agentic Framework) 的企業級 SEO 優化平台。系統核心由 **12 個專業 AI 代理** (6 Smart Agents + 6 Auto Tasks) 組成，能自主完成關鍵字研究、排名追蹤、內容創作、技術審核及競爭對手分析。

---

## 目錄 (Table of Contents)

- [核心亮點](#-核心亮點-core-features)
- [管理員手冊 (User Guide)](docs/user-guide.md)
- [技術棧](#️-技術棧-tech-stack)
- [專案結構](#-專案結構-mono-repo-structure)
- [快速開始](#-快速開始-getting-started)
- [常用指令速查](#-常用指令速查-scripts-reference)
- [測試策略](#-測試策略)
- [Workers & 背景服務](#-workers--背景服務)
- [LLM 整合](#-llm-整合-llm-integration)
- [Docker 基礎設施](#-docker-基礎設施)
- [資料庫](#️-資料庫-database)
- [12 代理清單](#-12-代理清單)
- [安全建議](#️-安全建議-production-checklist)
- [Windows 特別事項](#-windows-特別事項)
- [故障排除](#-故障排除-troubleshooting)
- [文件索引](#-文件索引-documentation)

---

## 🚀 核心亮點 (Core Features)

### 1. 代理人協同引擎 (Multi-Agent Orchestration)
- **12 個專業代理群**：包括 `keyword-researcher`, `content-writer`, `serp-tracker` 等 12 個具備工具呼叫功能的專業 Agent。
- **強大整合能力**：內建 SEMrush API 支持，提供精準關鍵字難度 (KD)、搜尋量及擴展關鍵字。
- **自主工作流**：支持 `content-pipeline` 與 `technical-audit` 等複雜的跨代理協作流程。
- **任務分配系統**：基於 BullMQ 的高效任務隊列，支持失敗重試與狀態追蹤。

### 2. 進階 SEO 分析 (Advanced SEO Analysis)
- **搜尋意圖識別 (Search Intent)**：自動分類關鍵字為 Informational, Commercial, Navigational 或 Transactional。
- **零成本 NLP 分析**：使用本機 LLM 取代 Google NLP API，實現實體提取、情感分析與關鍵字提取。
- **多語系支持**：優化的 CJK (中日韓) 字數統計與內容分析引擎。

### 3. 多租戶企業架構 (Enterprise Multi-tenancy)
- **Row Level Security (RLS)**：基於 PostgreSQL `FORCE RLS` 的數據物理隔離，確保租戶安全性。
- **RBAC 權限體系**：精確控制 `Admin`, `Manager`, `Analyst` 角色權限，並支持專案層級權限 (`project_memberships`)。
- **審核日誌 (Audit Logs)**：完整記錄所有敏感操作，內建公式注入防護，支援 JSON/CSV 匯出。
- **配額管理**：每租戶關鍵字上限、API 呼叫配額、爬取配額，超額自動攔截 (HTTP 429)。

### 4. 即時數據儀表板 (Real-time Dashboard)
- **次世代 UI**：使用 Next.js 15 與 Tailwind CSS 構建的響應式深色主題界面。
- **互動式圖表**：集成 Recharts、Cytoscape.js (話題聚類圖) 與 FullCalendar。
- **WebSocket 同步**：透過 `/ws/events` 實現代理狀態、排名警報與系統事件的毫秒級推送。

### 5. 高安全性與強健性 (Security & Reliability)
- **加密防護**：API Key 與 Webhook Secret 使用 AES-256-GCM 加密存儲。
- **SSRF 防御**：動態 DNS 解析校驗，防止針對內網網段的 SSRF 攻擊。
- **備份機制**：支持 S3/MinIO 端点與 SSE-S3 伺服器端加密備份，每日自動執行 + 保留策略。
- **安全掃描**：內建 OWASP ZAP baseline + `pnpm audit` 安全掃描腳本。

---

## 🛠️ 技術棧 (Tech Stack)

| 層 | 技術 | 版本 |
|---|---|---|
| **Runtime** | Node.js | >= 22.18 |
| **Package Manager** | pnpm | >= 9.x |
| **後端 Framework** | Fastify | 5.x |
| **前端 Framework** | Next.js (App Router) | 15.x |
| **ORM** | Drizzle ORM | latest |
| **資料庫** | PostgreSQL + pgvector | 16 |
| **快取 / 任務隊列** | Redis + BullMQ | 7.x |
| **認證** | JWT (Access + Refresh Tokens, Zod-validated) | — |
| **驗證** | Zod | — |
| **Billing** | Stripe Checkout + Webhooks | — |
| **Observability** | OpenTelemetry SDK + Jaeger | — |
| **Infra** | Kubernetes + Helm Chart | — |
| **Unit Tests** | Vitest (packages/core) | — |
| **UI** | shadcn/ui + Tailwind CSS + Lucide Icons | — |
| **圖表** | Recharts, Cytoscape.js, FullCalendar | — |
| **富文本編輯器** | TipTap | — |
| **E2E 測試** | Playwright | — |
| **LLM** | Ollama (本機) / Gemini (Cloud) via AI SDK | — |
| **SEO API** | SEMrush, ValueSERP, PageSpeed Insights | — |
| **容器** | Docker & Docker Compose | — |

---

## 📂 專案結構 (Mono-repo Structure)

```
AISEO/
├── apps/
│   ├── api/                    # Fastify API Server (28 route modules)
│   │   ├── src/
│   │   │   ├── server.ts       # 入口
│   │   │   ├── routes/         # 28 個路由模組 (auth, agents, keywords, billing, ...)
│   │   │   ├── middleware/     # JWT 認證 + tenant RLS
│   │   │   ├── db/            # Drizzle schema + connection pool
│   │   │   ├── outbox/        # Outbox Dispatcher (可靠事件投遞 + dashboard cache invalidation)
│   │   │   ├── backups/       # pg_dump/restore 備份邏輯
│   │   │   ├── workers/       # BullMQ workers (backup, dev) + /health on :3002
│   │   │   ├── scripts/       # 22+ 測試/驗證腳本
│   │   │   ├── quotas/        # 租戶配額管理 (Redis Lua atomic + hourly DB sync)
│   │   │   └── utils/         # AppError, JWT wrapper, requireDb helpers
│   │   └── drizzle/           # 25 個 DB Migration (0000–0024)
│   │
│   └── web/                    # Next.js 15 Dashboard
│       ├── src/app/            # App Router pages
│       ├── src/components/     # UI components
│       ├── src/lib/            # API client, auth, websocket
│       └── e2e/                # Playwright E2E tests
│
├── packages/
│   └── core/                   # 共享核心邏輯
│       └── src/
│           ├── orchestrator/   # BullMQ Flow 工作流引擎
│           ├── agent-runtime/  # 代理執行環境 + 沙盒
│           ├── agents/         # 12 個代理實作
│           ├── event-bus/      # Redis Pub/Sub 事件匯流排
│           ├── scheduler/      # Cron 排程 (BullMQ Repeatable)
│           ├── browser/        # Playwright 瀏覽器引擎
│           ├── serp/           # SERP 資料層 (ValueSERP, GSC)
│           ├── reports/        # PDF 報告產生器
│           ├── cms/            # CMS 整合 (WordPress, Shopify)
│           ├── notifications/  # 通知中心 (Slack, Email)
│           └── plugins/        # 工具註冊 + 發現
│
├── docker/
│   ├── docker-compose.yml      # 開發環境 (postgres:5433, redis:6379)
│   ├── docker-compose.prod.yml # 生產環境 (含 API + Web images)
│   └── agent-sandbox/          # Agent 容器沙盒 Dockerfile
│
├── scripts/                    # 維運腳本 (smoke, regression, security)
├── docs/                       # 文件 (deploy, handoff, UAT, runbook)
├── .env.example                # 環境變數範本 ← 必讀
├── plan-c-enterprise-seo-platform.md  # 主計畫文件 (架構/API/Schema)
└── plan-c-task-plan.md         # 任務追蹤 (138 項, 96% 完成)
```

---

## ⚡ 快速開始 (Getting Started)

### 前置條件

| 軟體 | 最低版本 | 用途 |
|---|---|---|
| Node.js | 22.18+ | Runtime |
| pnpm | 9.x+ | Package manager (含 corepack) |
| Docker Desktop | latest | PostgreSQL + Redis |
| Ollama *(可選)* | latest | 本機 LLM 推理 |

### Step 1：啟動基礎設施

```powershell
docker compose -f docker/docker-compose.yml up -d
```

> ⚠️ PostgreSQL 映射到 **host port 5433**（非預設 5432），Redis 為 6379。

### Step 2：配置環境變數

```powershell
Copy-Item .env.example .env
```

**必須修改的欄位：**

| 變數 | 說明 |
|---|---|
| `API_KEY_ENCRYPTION_SECRET` | AES-256 加密金鑰。產生方式：`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `DATABASE_URL` | 預設 `postgres://aiseo_app:aiseo_app@localhost:5433/aiseo`（開發環境可不改） |
| `REDIS_URL` | 預設 `redis://localhost:6379`（開發環境可不改） |

**可選 API Keys（按需啟用功能）：**

| 變數 | 服務 | 用途 |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini | Cloud LLM |
| `OLLAMA_BASE_URL` + `OLLAMA_MODEL` | Ollama | 本機 LLM（推薦 `gemma3:27b`） |
| `SEMRUSH_API_KEY` | SEMrush | 關鍵字指標 (KD/Volume) |
| `VALUESERP_API_KEY` | ValueSERP | SERP 排名追蹤 |

完整變數清單請見 `.env.example`。另見 `docs/quick-setup-3-steps.md` 快速配置指引。

### Step 3：安裝依賴與遷移數據

```powershell
pnpm install
pnpm -C apps/api db:migrate
```

### Step 4：啟動開發伺服器

```powershell
# API (Fastify) — 自動監聽變更
pnpm dev

# Web (Next.js) — 另開終端
pnpm -C apps/web dev
```

| 服務 | URL |
|---|---|
| Web Dashboard | http://localhost:3000 |
| API Server | http://localhost:3001 |
| Swagger / OpenAPI | http://localhost:3001/docs |
| Health Check | http://localhost:3001/health |

---

## 🔧 常用指令速查 (Scripts Reference)

### 根目錄

```powershell
pnpm dev                    # 啟動 API 開發環境
pnpm build                  # 建構所有 packages + apps
pnpm typecheck              # 全 monorepo TypeScript 型別檢查
pnpm lint                   # ESLint 全域掃描
pnpm smoke:phase0-3         # Phase 0-3 API 冒煙測試
pnpm regress:phase0-3       # Phase 0-3 回歸測試
pnpm sandbox:build          # 建構 Agent sandbox Docker image
```

### API (`apps/api`)

```powershell
# === 開發 ===
pnpm -C apps/api dev                   # tsx watch 開發模式
pnpm -C apps/api build                 # TypeScript 編譯
pnpm -C apps/api start                 # 啟動 production build

# === 資料庫 ===
pnpm -C apps/api db:generate           # 產生新 migration
pnpm -C apps/api db:migrate            # 執行 migration

# === 測試 & 驗證 ===
pnpm -C apps/api test:full:utf8        # 完整整合測試 (T1-T26, Windows 安全)
pnpm -C apps/api test:gap:utf8         # 系統缺口驗證 (A1-D1, Windows 安全)
pnpm -C apps/api test:orchestrator     # Orchestrator 多工測試
pnpm -C apps/api phase1:e2e            # Phase 1 端對端測試
pnpm -C apps/api db:rls-smoke          # RLS 隔離冒煙測試
pnpm -C apps/api rls:benchmark         # RLS 效能基準測試
pnpm -C apps/api outbox:test           # Outbox 整合測試
pnpm -C apps/api schedule:smoke        # 排程冒煙測試
pnpm -C apps/api memory:smoke          # Memory Store 冒煙測試
pnpm -C apps/api browser:smoke         # Browser Engine 冒煙測試
pnpm -C apps/api sandbox:smoke         # Sandbox 冒煙測試
pnpm -C apps/api perf:load:dashboard   # Dashboard 負載測試 (autocannon)

# === LLM / SEO 煙霧測試 ===
pnpm -C apps/api smoke:ollama          # Ollama LLM 整合
pnpm -C apps/api smoke:valueserp       # ValueSERP API 整合
pnpm -C apps/api smoke:semrush         # SEMrush API 整合
pnpm -C apps/api spike:gemini          # Gemini Spike

# === Workers (背景服務) ===
pnpm -C apps/api worker:dev            # 開發用 BullMQ workers
pnpm -C apps/api worker:backup         # 備份 worker (daily cron)
pnpm -C apps/api outbox:dispatch       # Outbox Dispatcher (輪詢投遞)
pnpm -C apps/api notify:slack          # Slack 通知訂閱
pnpm -C apps/api notify:webhooks -- all  # Webhook 投遞訂閱

# === 備份 & 還原 ===
pnpm -C apps/api backup:run            # 手動執行一次備份
pnpm -C apps/api backup:restore        # 從最新備份還原
pnpm -C apps/api backup:restore:test   # 還原驗證 (建立臨時 DB)
```

### Web (`apps/web`)

```powershell
pnpm -C apps/web dev                   # Next.js 開發模式
pnpm -C apps/web build                 # Production 建構 (standalone)
pnpm -C apps/web start                 # 啟動 standalone server
pnpm -C apps/web typecheck             # TypeScript 型別檢查
pnpm -C apps/web e2e:install           # 安裝 Playwright 瀏覽器
pnpm -C apps/web e2e                   # 執行 E2E 測試
pnpm -C apps/web e2e:ui                # Playwright UI 模式
pnpm -C apps/web perf:lighthouse:prod  # Lighthouse 效能測試
```

---

## 🧪 測試策略

本專案採多層測試策略，確保工程品質：

| 層級 | 工具 | 指令 | 覆蓋範圍 |
|---|---|---|---|
| **整合測試** | `full-integration-test.ts` | `test:full:utf8` | 26 項核心功能 (T1-T26)：EventBus, Orchestrator, Agents, Scheduler 等 |
| **缺口驗證** | `system-gap-validation.ts` | `test:gap:utf8` | 9 項基礎設施 (API/DB/RLS/Outbox/Schedule/Runtime/E2E/Backup) |
| **API 冒煙** | `smoke-phase0-3.ps1` | `pnpm smoke:phase0-3` | Bearer JWT 呼叫關鍵 API + RBAC/RLS 反向測試 |
| **回歸測試** | `regression-phase0-3.ps1` | `pnpm regress:phase0-3` | Phase 0-3 全面回歸 |
| **E2E** | Playwright | `pnpm -C apps/web e2e` | 所有 Dashboard routes (Chromium/Firefox/WebKit + Mobile) |
| **效能** | Lighthouse + autocannon | `perf:lighthouse:prod` / `perf:load:dashboard` | FCP < 1.5s, TTI < 3s, 100 並發 |
| **安全** | OWASP ZAP + pnpm audit | `scripts/security-scan.ps1` | 依賴漏洞 + Web 基線掃描 |

> **Windows 注意**：使用 `test:full:utf8` / `test:gap:utf8` 版本避免終端輸出亂碼。

測試結果輸出位置：
- 整合測試報告：`test-results/` (JSON + 文字)
- Playwright 報告：`apps/web/test-results/`
- Lighthouse 報告：`apps/web/lighthouse-report.prod.json`

---

## 🔄 Workers & 背景服務

生產環境需要啟動以下背景程序（可作為獨立 container 或 process）：

| Worker | 指令 | 功能 |
|---|---|---|
| **Backup Worker** | `pnpm -C apps/api worker:backup` | 依 `BACKUP_CRON` 每日自動 pg_dump → S3/MinIO，並清除過期備份 |
| **Outbox Dispatcher** | `pnpm -C apps/api outbox:dispatch` | 輪詢 `events_outbox` 表，確保事件可靠投遞 |
| **Dev Workers** | `pnpm -C apps/api worker:dev` | 開發模式 BullMQ worker pool |
| **Slack Notifier** | `pnpm -C apps/api notify:slack` | 訂閱 Redis 事件 → 推送 Slack |
| **Webhook Notifier** | `pnpm -C apps/api notify:webhooks -- all` | 訂閱 Redis 事件 → 投遞 Webhook endpoints |

---

## 🤖 LLM 整合 (LLM Integration)

系統透過統一的 `llm.chat` tool 介面支援多種 LLM provider：

### Ollama (本機推理 — 推薦)
```bash
# 1. 安裝 Ollama (https://ollama.ai)
ollama pull gemma3:27b

# 2. 在 .env 中設定
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:27b
OLLAMA_PROVIDER=ollama

# 3. 測試整合
pnpm -C apps/api smoke:ollama
```
- **硬體需求**: RTX 3060+ (8GB VRAM) / Apple Silicon M1+ (8GB RAM)
- **推薦模型**: `gemma3:27b`, `llama3:8b`, `mistral:7b`

### Gemini (Cloud API)
```bash
GOOGLE_GENERATIVE_AI_API_KEY=your-key
GEMINI_MODEL=gemini-1.5-flash
```

> **Fallback**: Content Writer Agent 在 LLM 失敗時自動 fallback 為模板生成。

---

## 🐳 Docker 基礎設施

### 開發環境 (`docker/docker-compose.yml`)

| 服務 | Image | Host Port | 說明 |
|---|---|---|---|
| PostgreSQL | `pgvector/pgvector:pg16` | **5433** | DB: `aiseo` + pgvector extension |
| Redis | `redis:7` | 6379 | BullMQ 任務隊列 + EventBus |

> ⚠️ PostgreSQL 使用 **port 5433**（非標準 5432），避免與本機已有 PG 衝突。

### 生產環境 (`docker/docker-compose.prod.yml`)

```powershell
docker compose -f docker/docker-compose.prod.yml up --build
```

Multi-stage build，包含 API + Web + PostgreSQL + Redis。

### Agent Sandbox

```powershell
pnpm sandbox:build    # docker build -t aiseo-agent-sandbox ./docker/agent-sandbox
```

---

## 🗄️ 資料庫 (Database)

### Migration

25 個 migration 檔案 (`apps/api/drizzle/0000–0024`)：

| 範圍 | Migrations | 說明 |
|---|---|---|
| 初始 Schema | 0000–0005 | tenants, users, memberships, projects, keywords, rank_history, page_audits, content, backlinks, agent_tasks 等 |
| Phase 2 Agents | 0006–0008 | 代理相關表 |
| Phase 3 Settings | 0009–0012 | Settings/RBAC/RLS (含 api_keys RLS WITH CHECK) |
| Phase 4 Enterprise | 0013–0021 | tenant status, email verification, quotas, webhooks, project RBAC, audit logs, automated backups, perf indexes, webhook signing |
| 補丁 | 0022–0024 | agent_memory HNSW 向量索引、Stripe billing 欄位、users.settings JSONB |

```powershell
pnpm -C apps/api db:generate   # 建立新 migration
pnpm -C apps/api db:migrate    # 執行所有未套用的 migration
```

### RLS 策略

所有業務表啟用 Row Level Security，透過 `app.current_tenant_id` session 設定隔離資料。  
Middleware 在每個 HTTP request 自動 `SET app.current_tenant_id`（從 JWT 提取）。

### 資料庫使用者

| 使用者 | 用途 | 環境變數 |
|---|---|---|
| `aiseo` | Migration (superuser) | `DATABASE_URL_MIGRATION` |
| `aiseo_app` | 應用程序 (FORCE RLS) | `DATABASE_URL` |

---

## 🤖 12 代理清單

### Smart Agents (需 LLM 推理)

| # | Agent | 功能 |
|---|---|---|
| 1 | `keyword-researcher` | 關鍵字研究 + 擴展 + 意圖分類 + Topic Cluster |
| 2 | `content-writer` | AI 內容生成 + SEO 優化 + Schema Markup |
| 3 | `competitor-monitor` | 競爭對手分析 + 內容差距 + 策略建議 |
| 4 | `backlink-builder` | 反向連結機會發現 + Outreach |
| 5 | `report-generator` | 自動報告產生 (PDF) + 排程寄送 |
| 6 | `content-refresher` | 過時內容偵測 + 更新建議 |

### Auto Tasks (規則驅動)

| # | Agent | 功能 |
|---|---|---|
| 7 | `serp-tracker` | 每日排名追蹤 + 警報 |
| 8 | `technical-auditor` | 頁面審計 + Core Web Vitals |
| 9 | `schema-agent` | Schema.org 結構化資料產生 |
| 10 | `internal-linker` | 內部連結建議 + 自動插入 |
| 11 | `pagespeed-agent` | PageSpeed 分數追蹤 |
| 12 | `local-seo` | 本地 SEO (GMB, Citations) |

---

## 🛡️ 安全建議 (Production Checklist)

- [ ] `NODE_ENV=production`
- [ ] 產生並保管 `API_KEY_ENCRYPTION_SECRET`（`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`）
- [ ] 設定獨立的 `JWT_SECRET` 與 `JWT_REFRESH_SECRET`
- [ ] 設定 `PLATFORM_ADMIN_SECRET`（平台管理 API 存取）
- [ ] 啟用 `REQUIRE_EMAIL_VERIFICATION`
- [ ] 啟用 `BACKUP_ENABLED=true` 並配置 S3/MinIO
- [ ] 執行安全掃描：`scripts/security-scan.ps1`
- [ ] 確認 RLS policy：`pnpm -C apps/api db:rls-smoke`
- [ ] 檢查 CORS 白名單

---

## 🪟 Windows 特別事項

- **UTF-8 終端**：測試腳本提供 `:utf8` 後綴版本（如 `test:full:utf8`），內建 `chcp 65001` 切換。
- **pg_dump / psql**：若本機未安裝 PostgreSQL CLI，可使用 Docker wrapper 腳本：
  ```env
  BACKUP_PGDUMP_PATH=scripts\windows\pg_dump_docker.cmd
  BACKUP_PSQL_PATH=scripts\windows\psql_docker.cmd
  ```

---

## 🔍 故障排除 (Troubleshooting)

| 症狀 | 可能原因 | 解法 |
|---|---|---|
| DB 連線失敗 | Port 不匹配 | 確認 `DATABASE_URL` 使用 port **5433** |
| Migration 失敗 | Journal 不同步 | 檢查 `apps/api/drizzle/meta/_journal.json`，重跑 `db:migrate` |
| RLS 查詢回空 | 缺少 tenant context | 確認 middleware 有 `SET app.current_tenant_id` |
| API Key 解密失敗 | 金鑰不匹配 | 確認 `API_KEY_ENCRYPTION_SECRET` 與建立時一致 |
| 終端亂碼 | Windows 編碼 | 使用 `:utf8` 版本腳本，或手動 `chcp 65001` |
| Webhook 未投遞 | Notifier 未啟動 | 啟動 `pnpm -C apps/api notify:webhooks -- all` |
| 備份失敗 | 缺少 pg_dump | 安裝 PG CLI 或配置 `BACKUP_PGDUMP_PATH` |
| Web/API mismatch | Proxy 設定 | 確認 `next.config.js` 中 `/api/*` rewrite 指向 API |

---

## 📚 文件索引 (Documentation)

| 文件 | 路徑 | 說明 |
|---|---|---|
| **使用者手冊 (New)** | `docs/user-guide.md` | **功能操作、管理員指南、FAQ** |
| 主計畫 | `plan-c-enterprise-seo-platform.md` | 完整架構設計、API 規格、Schema、風險矩陣 |
| 任務計畫 | `plan-c-task-plan.md` | Phase 0-4 任務追蹤 (138 項，96% 完成) |
| 優化任務 | `docs/optimization-task-plan.md` | 25 項優化任務 (全部完成，2026-02-18) |
| 部署指南 | `docs/deploy.md` | Docker Compose 生產部署步驟 |
| 維運交接 | `docs/handoff.md` | 服務清單、env、備份、排障 |
| 發布 Runbook | `docs/release-runbook.md` | v1.0 發布前/中/後檢查清單 |
| UAT 清單 | `docs/uat-checklist.md` | 使用者驗收測試逐項清單 |
| 快速設定 | `docs/quick-setup-3-steps.md` | 3 步驟完成 .env 配置 |
| AI SDK Spike | `docs/ai-sdk-spike-report-gemini.md` | Gemini / tool use / streaming 驗證報告 |
| 工程參考 | `docs/engineering-reference.md` | OpenClaw 架構對照 (非 runtime 依賴) |
| 系統需求 | `docs/system-requirements-complete.md` | 完整系統需求規格 |
| API 測試腳本 | `docs/http-full-product-test-script.md` | HTTP 全功能測試腳本範例 |
| 安全掃描 | `scripts/security-scan.ps1` | OWASP ZAP + npm audit |

---

## 🎯 優化 v2 — 2026-02-18 交付摘要

本次優化涵蓋 25 項計畫任務與 11 項 code review 修復，所有變更均已通過 `pnpm -r build` 全端編譯驗證。

### 主要新增項目

| 分類 | 功能 | 說明 |
|---|---|---|
| **SEC** | Zod-validated JWT wrappers | `utils/jwt.ts` 型別安全封裝，統一所有 auth 路由 |
| **SEC** | Singleton Redis/Queue | `server.ts` 模組層級共享，消除每請求建立連線 |
| **SEC** | Shared WebSocket fan-out | `subscribeAll()` + tenant Map，單一 Redis 訂閱分發 |
| **PERF** | Redis Lua atomic quota | `redisIncrQuota()` Lua 腳本，配額讀寫原子化 |
| **PERF** | Dashboard 60s Redis cache | `cache:dashboard:metrics:{tenant}:{project}` TTL 快取 |
| **PERF** | Cursor-based pagination | 游標分頁取代 OFFSET，N+1 安全 |
| **BIZ** | Stripe Billing | Checkout / Portal / Webhook，方案依 Price ID 正確對應 |
| **BIZ** | OnboardingWizard | 4-step 引導精靈，`PATCH /api/auth/me` 記錄完成狀態 |
| **BIZ** | Quota progress bars | 80%/95% 自動告警，`GET /api/tenants/usage` 百分比回傳 |
| **INFRA** | OpenTelemetry + Jaeger | `instrumentation.ts` 分散式追蹤 |
| **INFRA** | Kubernetes + Helm | `k8s/` Deployments、HPA、Ingress、Helm chart |
| **CODE** | Vitest agent tests | `packages/core` 12+ 單元測試 |
| **CODE** | `noUncheckedIndexedAccess` | tsconfig.base.json 強化型別安全 |

### Bug Fixes (Code Review)

| 嚴重度 | 檔案 | 問題 |
|---|---|---|
| 🔴 | `quotas/usage.ts` | `reserveCrawlJobsOrThrow` / `getKeywordCapacity` merge 污染導致函式損毀 |
| 🟠 | `server.ts` + `package.json` | `fastify-raw-body` 未安裝，Stripe webhook HMAC 驗證靜默失敗 |
| 🟠 | `routes/billing.ts` | checkout 完成後方案寫死為 `'pro'`，現從 subscription Price ID 正確解析 |
| 🟡 | `outbox/dispatcher.ts` | `invalidateDashboardCache` 從未被呼叫，dashboard 永遠顯示舊數據 |
| 🟡 | `server.ts` | WebSocket JWT 驗證使用 `as any` 繞過型別安全 |
| 🟢 | `server.ts` | `stopQuotaSync` / Redis 未在關閉時執行清理 |
| 🔵 | `workers/dev-workers.ts` | 新增 `/health` HTTP server on :3002，修復 K8s liveness probe |
| 🔵 | `outbox/dispatcher.ts` | cache invalidation 擴充至 `serp.rank.anomaly` + `report.ready` |
| 🔴 | `.github/workflows/ci.yml` | `secrets` context 不可用於 job-level `if`；改為 `github.event_name`/`ref` 條件 + step-level 跳過邏輯 |
| 🟠 | `lib/roi-engine.ts` → `routes/roi.ts` | CTR / seasonality 常數重複定義；改為 export 單一來源，`/api/roi/ctr-curves` 直接引用 |
| 🟢 | `dashboard/roi/page.tsx` | 行 id 使用 `Date.now()` 可碰撞；改為 `crypto.randomUUID()` |

---

*最後更新：2026-02-19*
