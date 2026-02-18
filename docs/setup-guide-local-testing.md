# 本機完整測試 - 必需配置獲取指南

> 這份指南會告訴你「每一項配置要怎麼拿到」，照著做就能讓系統跑起來。

## 🎯 目標：本機完整測試（LIVE 端到端）

讓 12 個 agents + 4 個 workflows 真的跑起來，驗證功能完整性。

---

## ✅ 必需配置清單與獲取步驟

### 1️⃣ **資料庫與快取（已經有了）**

你的 Docker Compose 已經包含這些，**不用額外獲取**：

```env
DATABASE_URL=postgres://aiseo_app:aiseo_app@localhost:5433/aiseo
DATABASE_URL_MIGRATION=postgres://aiseo:aiseo@localhost:5433/aiseo
REDIS_URL=redis://localhost:6379
```

**驗證方式**：
```powershell
# 確認 docker 容器在跑
docker compose -f docker/docker-compose.yml ps

# 測試 Postgres 連線
docker exec -it aiseo-postgres psql -U aiseo -d aiseo -c "SELECT version();"

# 測試 Redis 連線
docker exec -it aiseo-redis redis-cli PING
```

---

### 2️⃣ **加密密鑰（必填）**

**用途**：加密 API keys 與 Webhook secrets（AES-256-GCM）

**如何獲取**：在 PowerShell 執行以下任一指令生成隨機 32 字節密鑰

```powershell
# 方法 1（推薦）
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 方法 2
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**輸出範例**：
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t==
```

**填入 `.env`**：
```env
API_KEY_ENCRYPTION_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t==
```

⚠️ **注意**：這把鑰匙一旦生成後不要改（改了舊的加密資料會解不開）。

---

### 3️⃣ **LLM 服務（擇一即可）**

Smart Agents 需要 LLM 進行內容生成與推理。你有兩個選擇：

#### 🔹 選項 A：使用 Ollama（本機 gemma3:27b）

**前提**：
- Ollama 已安裝並在背景執行
- 已經下載 `gemma3:27b` 模型

**驗證 Ollama 是否可用**：
```powershell
# 檢查 Ollama 服務
ollama list

# 測試 API（應該回應 "Ollama is running"）
curl http://localhost:11434
```

**需要的配置**（我會幫你接入）：
```env
# 這些欄位目前還沒有，我會在接入時新增
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:27b
LLM_PROVIDER=ollama
```

**優點**：
- ✅ 完全離線，不花錢
- ✅ 你有 RTX 5090 + 32GB VRAM，跑 27B 模型綽綽有餘

**缺點**：
- ⚠️ 生成速度較雲端慢（視硬體，單次可能 5-30 秒）
- ⚠️ 輸出品質/穩定度可能不如 Claude/GPT（特別是結構化 JSON）

---

#### 🔹 選項 B：使用 Google Gemini（雲端）

**如何獲取 API Key**：

1. 前往 [Google AI Studio](https://aistudio.google.com/apikey)
2. 登入你的 Google 帳號
3. 點擊「Create API Key」
4. 複製生成的 key（格式類似 `AIzaSyC...`）

**免費額度**：
- Gemini 1.5 Flash：每分鐘 15 次請求（RPM）
- 每日 1500 次請求
- **對測試而言通常夠用**

**填入 `.env`**：
```env
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyC_你的實際key
GEMINI_MODEL=gemini-1.5-flash
```

**優點**：
- ✅ 快速（通常 1-3 秒回應）
- ✅ 穩定的結構化輸出
- ✅ 免費額度對測試足夠

**缺點**：
- ⚠️ 需要網路連線
- ⚠️ 有用量限制（超過要付費）

---

### 4️⃣ **外部資料整合（可選，建議先跳過）**

這些 API 用於特定 agents（SERP tracker、keyword metrics 等）。**初期測試可以不提供**，系統會自動降級或使用 mock 資料。

#### SERP Provider（排名追蹤）
- **ValueSERP**：https://www.valueserp.com/ （免費試用 100 次）
- **ScaleSERP**：https://www.scaleserp.com/ （免費試用 100 次）

需要填的欄位（目前 .env.example 沒列，若需要我再補）：
```env
VALUESERP_API_KEY=你的key
# 或
SCALESERP_API_KEY=你的key
```

#### Ahrefs（關鍵字 metrics）
- **官網**：https://ahrefs.com/api
- **費用**：從 $99/月起

```env
AHREFS_API_KEY=你的key
```

#### Google NLP（Entity 分析）
- **官網**：https://cloud.google.com/natural-language
- **免費額度**：每月 5000 次分析

```env
GOOGLE_NLP_API_KEY=你的key
```

**結論**：這些對「驗證系統能跑」不是必需的，可以等基礎跑通後再補。

---

## 📝 實際操作步驟

### Step 1：準備 `.env` 檔案

```powershell
# 複製範本
Copy-Item .env.example .env

# 用你喜歡的編輯器打開（例如 VSCode）
code .env
```

### Step 2：填入必需欄位

**最小可用配置（使用 Ollama）**：
```env
# 資料庫與快取（保持原值）
DATABASE_URL=postgres://aiseo_app:aiseo_app@localhost:5433/aiseo
DATABASE_URL_MIGRATION=postgres://aiseo:aiseo@localhost:5433/aiseo
REDIS_URL=redis://localhost:6379

# 加密密鑰（執行指令生成）
API_KEY_ENCRYPTION_SECRET=你生成的base64字串

# LLM（我會幫你接入 Ollama 後填這些）
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:27b
LLM_PROVIDER=ollama

# 其他保持預設
PORT=3001
NODE_ENV=development
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000000
```

### Step 3：驗證配置

```powershell
# 1. 啟動基礎服務
docker compose -f docker/docker-compose.yml up -d

# 2. 執行 DB migration
pnpm -C apps/api db:migrate

# 3. 啟動 API（會自動讀取 .env）
pnpm -C apps/api dev

# 4. 另開終端啟動 workers
pnpm -C apps/api worker:dev

# 5. 檢查 API health
curl http://localhost:3001/health
```

如果都沒報錯，就成功了！

---

## 🎬 下一步：執行完整測試

當配置完成後，可以執行：

```powershell
# Phase 2 端到端測試（會跑 12 agents）
cd packages/core
pnpm build
cd ../../apps/api
tsx src/scripts/phase1-e2e.ts
```

或者透過 Web UI 手動觸發 workflows（需同時啟動 web）：
```powershell
pnpm -C apps/web dev
# 瀏覽器打開 http://localhost:3000
```

---

## ❓ 常見問題

### Q1：我要用 Ollama 還是 Gemini？
**答**：
- 想完全離線/不花錢 → Ollama
- 想快速穩定/方便測試 → Gemini（免費額度夠用）
- **建議**：兩個都設定，可以切換對比

### Q2：Ollama 在 Docker 裡跑，怎麼連？
**答**：如果 API 和 workers 跑在容器內，把 `OLLAMA_BASE_URL` 改為：
```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

### Q3：沒有 SERP/Ahrefs key 會怎樣？
**答**：相關 agents（serp-tracker、keyword-researcher）會：
- 降級使用 Google Suggest（免費、不用 key）
- 或回傳 mock/placeholder 資料
- **不會報錯**，但數據不會是真的

### Q4：加密密鑰忘記了可以重新生成嗎？
**答**：可以，但會導致：
- 所有已加密的 API keys 失效（需要重新輸入）
- 所有 webhook secrets 需要重新設定
- **生產環境千萬不要隨便改**

---

## 📌 總結

**本機完整測試的最小清單**：
1. ✅ Docker（Postgres + Redis）— 已經有
2. ✅ `API_KEY_ENCRYPTION_SECRET` — 執行指令生成
3. ✅ LLM（Ollama 或 Gemini）— 擇一設定
4. ⏸️ 外部整合（SERP/Ahrefs 等）— 可選，建議先跳過

**我接下來會做的事**：
1. 幫你接入 Ollama（新增 LLM provider + 工具）
2. 提供一鍵驗證腳本
3. 給你一份「執行完整測試」的操作手冊

準備好了告訴我，我就開始接入 Ollama！
