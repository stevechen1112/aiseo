# AISEO Web Dashboard (Frontend)

Next.js 15 驅動的 AISEO 現代化管理面板。提供直觀的界面來配置、監控及優化企業級 SEO 策略。

> **狀態**: Phase 3 Dashboard 已完成 (MVP)，E2E + Lighthouse 驗證通過。

## 功能頁面

| 路由 | 頁面 | 功能 |
|---|---|---|
| `/dashboard` | 總覽 | 實時指標、排名趨勢、代理活動時間軸、待審核項目 |
| `/dashboard/keywords` | 關鍵字 | 聚類分析 (Cytoscape.js)、Quick Win、觸發研究 |
| `/dashboard/rankings` | 排名追蹤 | 逐日排名、SERP Feature、警報設定 |
| `/dashboard/content` | 內容管理 | 內容行事曆 (FullCalendar)、審核佇列 |
| `/dashboard/content/editor` | 編輯器 | TipTap 富文本 + SEO 評分 + 可讀性分析 |
| `/dashboard/audit` | 技術審計 | 健康分數、問題清單、CWV 趨勢 |
| `/dashboard/backlinks` | 反向連結 | DA 分布、新增/丟失追蹤、Gap 分析 |
| `/dashboard/reports` | 報告中心 | PDF 下載、排程建構器、白標設定 |
| `/dashboard/agents` | 代理管理 | 12 代理狀態面板、代理日誌、排程 |
| `/dashboard/settings` | 系統設定 | Projects / API Keys / RBAC / Webhooks / Usage / Branding / Audit Logs / Backup |
| `/signup` | 註冊 | 多步驟 + Email 驗證 |
| `/login` | 登入 | JWT 認證 |
| `/tenant/[id]/dashboard/*` | 租戶隔離 | 租戶專屬 URL 視圖 |

## 技術棧

| 技術 | 版本 | 用途 |
|---|---|---|
| Next.js | 15.x | App Router + Standalone build |
| React | 18.x | UI |
| TypeScript | 5.x (strict) | 型別安全 |
| Tailwind CSS | 3.4 | Styling (dark mode) |
| shadcn/ui | latest | UI Components |
| Lucide Icons | latest | 圖示 |
| TanStack Query | v5 | 資料擷取 |
| TipTap | latest | 富文本編輯器 |
| Recharts | 2.12 | 趨勢圖 |
| Cytoscape.js | latest | 話題聚類圖 |
| FullCalendar | latest | 內容行事曆 |
| Playwright | latest | E2E 測試 |

## 專案結構

```
src/
├── app/
│   ├── dashboard/          # 所有 Dashboard 頁面
│   │   ├── layout.tsx      # Sidebar + TopNav
│   │   ├── page.tsx        # Overview
│   │   ├── keywords/       # 關鍵字瀏覽器
│   │   ├── rankings/       # 排名追蹤
│   │   ├── content/        # 內容管理 + Editor
│   │   ├── audit/          # 技術審計
│   │   ├── backlinks/      # 反向連結
│   │   ├── reports/        # 報告中心
│   │   ├── agents/         # 代理管理
│   │   └── settings/       # 系統設定 (8 tabs)
│   ├── tenant/[tenantId]/  # 租戶隔離路由
│   ├── login/              # 登入
│   ├── signup/             # 註冊 + Email 驗證
│   └── verify-email/       # Email 驗證 callback
├── components/             # 共用 UI 元件
├── hooks/                  # 自定義 hooks
├── lib/
│   ├── api.ts              # API client
│   ├── auth-context.tsx    # Auth context + useAuth
│   └── websocket.ts        # WebSocket 即時連線
├── context/                # 全域狀態
└── middleware.ts            # 路由保護 (JWT check)
```

## Scripts

```powershell
pnpm dev                    # 開發模式 (localhost:3000)
pnpm build                  # Production build (standalone)
pnpm start                  # 啟動 standalone server
pnpm typecheck              # TypeScript 型別檢查
pnpm lint                   # Next.js lint
pnpm e2e:install            # 安裝 Playwright 瀏覽器
pnpm e2e                    # 執行 E2E 測試
pnpm e2e:ui                 # Playwright UI 模式
pnpm perf:lighthouse        # Lighthouse 效能測試 (dev)
pnpm perf:lighthouse:prod   # Lighthouse 效能測試 (prod build)
```

## 環境變數

在 `.env.local` 中設定（或由 Next.js rewrite 處理）：

```bash
# 前端直接呼叫 API 的 URL（空 = same-origin /api proxy）
NEXT_PUBLIC_API_URL=http://localhost:3001

# WebSocket URL
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

> 生產環境建議使用 same-origin proxy，不設 `NEXT_PUBLIC_API_URL`。

## 認證流程

1. 使用者在 `/login` 頁面輸入帳密
2. POST `/api/auth/login` → 取得 JWT + refresh token
3. Token 存於 cookie (`aiseo_token`)
4. `middleware.ts` 在每個請求檢查 token
5. 每 14 分鐘自動 refresh
6. 登出清除所有 token → redirect `/login`
7. 租戶隔離：`/dashboard/*` 自動 redirect 到 `/tenant/<tenantId>/dashboard/*`

## E2E 測試

覆蓋所有 Dashboard routes，支援三瀏覽器 + Mobile viewports：

```powershell
# 首次安裝瀏覽器
pnpm e2e:install

# 執行
pnpm e2e

# UI 模式（選擇性執行）
pnpm e2e:ui
```

E2E 使用 route mocks 提供穩定 API 回應，不依賴 DB/Redis。

## 效能基準

Production build 效能（Lighthouse）：
- Performance: 100
- FCP: ~0.8s
- TTI: ~1.2s

```powershell
pnpm build
$env:PORT=3000; pnpm start
# 另開終端：
pnpm perf:lighthouse:prod
```
