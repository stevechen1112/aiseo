# AISEO API Server (Backend)

AISEO 平台的後端核心，基於 Fastify 5 打造，負責 AI 代理編排、多租戶隔離、安全性校驗及數據持久化。

## 核心特性

### 1. 代理編排引擎 (Agent Orchestrator)
- **架構**: 基於 BullMQ (Redis) 的異步工作流引擎。
- **類型**:
  - `smart-agents`: 需 AI 推理（關鍵字研究、內容撰寫、競爭分析等）
  - `auto-tasks`: 規則驅動（排名追蹤、頁面審計、Schema 產生等）
- **Plugin 系統**: 所有代理為標準化插件，可擴展。

### 2. 多租戶安全性 (Enterprise Isolation)
- **FORCE RLS**: PostgreSQL 行級安全，Middleware 自動 `SET app.current_tenant_id`。
- **Project RBAC**: `project_memberships` 表控制專案層級存取。
- **Audit Logging**: 完整 CRUD 操作記錄，支援 JSON/CSV 匯出。
- **SSRF 守護**: `assertSafeOutboundUrl` 校驗 Webhook 目標。

### 3. API & 整合
- **Swagger**: 自動產生 OpenAPI 3.0 文檔，位於 `/docs`。
- **Webhook Signing**: 租戶獨立加密簽名，版本化校驗。
- **配額管理**: API 呼叫 / SERP / 爬取 / 關鍵字配額，超額回 429。

## 路由模組 (28 個)

| 模組 | 路徑 | 功能 |
|---|---|---|
| `auth` | `/api/auth/*` | 註冊/登入/JWT refresh/登出/Email 驗證 |
| `projects` | `/api/projects/*` | 專案 CRUD |
| `keywords` | `/api/keywords/*` | 關鍵字管理 + 研究 |
| `content` | `/api/content/*` | 內容管理 + SEO 評分 |
| `review` | `/api/review/*` | Human-in-the-Loop 審核 |
| `cms` | `/api/cms/*` | CMS 發布 (WordPress/Shopify) |
| `agents` | `/api/agents/*` | 代理狀態/日誌/觸發 |
| `flows` | `/api/flows/*` | BullMQ Flow 工作流觸發 |
| `workflows` | `/api/workflows/*` | 工作流狀態查詢 |
| `schedules` | `/api/schedules/*` | Cron 排程管理 |
| `serp` | `/api/serp/*` | SERP 追蹤 |
| `serp-schedule` | `/api/serp-schedule/*` | SERP 排程 |
| `alerts` | `/api/alerts/*` | 排名警報 |
| `backlinks` | `/api/backlinks/*` | 反向連結分析 |
| `dashboard` | `/api/dashboard/*` | Dashboard 指標 (含 Redis cache) |
| `reports` | `/api/reports/*` | 報告 + PDF 下載 |
| `report-schedules` | `/api/report-schedules/*` | 報告排程 |
| `rbac` | `/api/rbac/*` | 使用者/角色/project_memberships |
| `api-keys` | `/api/api-keys/*` | API Key 管理 (AES-256 加密) |
| `webhooks` | `/api/webhooks/*` | Webhook CRUD + 投遞日誌 |
| `audit` | `/api/audit/*` | 審計日誌查詢 + 匯出 |
| `backup` | `/api/backup/*` | 備份匯出/匯入 |
| `notifications` | `/api/notifications/*` | 通知設定 |
| `tenants` | `/api/tenants/*` | 租戶用量/品牌設定 |
| `platform-tenants` | `/api/platform/*` | 平台管理 (需 admin secret) |
| `events` | `/api/events/*` | Outbox 事件 |
| `dev` | `/api/dev/*` | 開發輔助工具 |

## 資料庫

- **ORM**: Drizzle ORM
- **Migrations**: 22 個 (`drizzle/0000–0021`)，涵蓋 Phase 0-4 全部 Schema 演進
- **兩組連線**:
  - `DATABASE_URL` → `aiseo_app` (FORCE RLS，應用程序用)
  - `DATABASE_URL_MIGRATION` → `aiseo` (superuser，migration 用)

## Scripts 速查

```powershell
# 開發
pnpm dev                    # tsx watch
pnpm build                  # TypeScript 編譯
pnpm start                  # production 啟動

# 資料庫
pnpm db:generate            # 產生 migration
pnpm db:migrate             # 執行 migration

# 測試 (推薦使用 :utf8 版本避免 Windows 亂碼)
pnpm test:full:utf8         # 完整整合測試 T1-T26
pnpm test:gap:utf8          # 缺口驗證 A1-D1
pnpm test:orchestrator      # Orchestrator 多工
pnpm phase1:e2e             # Phase 1 E2E
pnpm db:rls-smoke           # RLS 隔離
pnpm rls:benchmark          # RLS 效能
pnpm outbox:test            # Outbox 整合
pnpm schedule:smoke         # 排程冒煙
pnpm memory:smoke           # Memory Store
pnpm browser:smoke          # Browser Engine
pnpm sandbox:smoke          # Sandbox
pnpm perf:load:dashboard    # 負載測試

# LLM / SEO API
pnpm smoke:ollama           # Ollama
pnpm smoke:valueserp        # ValueSERP
pnpm smoke:semrush          # SEMrush
pnpm spike:gemini           # Gemini

# Workers (背景服務)
pnpm worker:dev             # 開發 workers
pnpm worker:backup          # 備份 worker (daily cron)
pnpm outbox:dispatch        # Outbox 事件投遞
pnpm notify:slack           # Slack 通知
pnpm notify:webhooks -- all # Webhook 投遞

# 備份
pnpm backup:run             # 手動備份
pnpm backup:restore         # 從最新備份還原
pnpm backup:restore:test    # 還原驗證
```

## 必要環境變數

| 變數 | 必須 | 說明 |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL (aiseo_app, RLS) |
| `DATABASE_URL_MIGRATION` | ✅ | PostgreSQL (aiseo, superuser) |
| `REDIS_URL` | ✅ | Redis 連線 |
| `API_KEY_ENCRYPTION_SECRET` | ✅ | AES-256 加密金鑰 (production 必換) |
| `JWT_SECRET` | 建議 | JWT 簽名金鑰 |
| `JWT_REFRESH_SECRET` | 建議 | Refresh token 簽名金鑰 |
| `PLATFORM_ADMIN_SECRET` | 建議 | `/api/platform/*` 存取 |
| `OLLAMA_BASE_URL` | 可選 | Ollama LLM 端點 |
| `SEMRUSH_API_KEY` | 可選 | SEMrush 關鍵字指標 |
| `VALUESERP_API_KEY` | 可選 | ValueSERP 排名追蹤 |
| `BACKUP_ENABLED` | 可選 | 啟用自動備份 (`true`) |
| `BACKUP_S3_*` | 可選 | S3/MinIO 備份配置 |

完整列表見根目錄 `.env.example`。

## 部署建議

1. **Production 建構**: `pnpm build` → `pnpm start`（或用 `docker/docker-compose.prod.yml`）
2. **記憶體**: 建議 API container 至少 2GB RAM（多代理 + LLM 呼叫）
3. **Workers**: 備份/Outbox/通知需分別啟動（見 Scripts 速查）
4. **日誌**: 內建 Pino logger，建議接入 ELK 或 Datadog
