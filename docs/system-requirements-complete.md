# 系統完整配置需求說明

## 📊 配置需求概覽

這套系統有 **12 個 AI Agent**，分為 3 個測試層級，根據你的需求選擇配置：

| 層級 | 適用場景 | 需要配置 | Agent 可用性 |
|------|---------|---------|--------------|
| **🟢 基礎運行** | 本機開發、UI 測試 | 基礎設施 + LLM | 12/12 (Mock 模式) |
| **🟡 核心功能** | 功能驗證、整合測試 | + 2-3 個外部 API | 12/12 (部分真實) |
| **🔴 完整生產** | 正式上線、商業運營 | + 所有外部服務 | 12/12 (完全真實) |

---

## ✅ 你已完成的配置（基礎運行）

### 1. 基礎設施 ✓
```bash
# PostgreSQL 16 + pgvector
DATABASE_URL=postgres://aiseo_app:aiseo_app@localhost:5433/aiseo

# Redis 7 (BullMQ + EventBus)
REDIS_URL=redis://localhost:6379

# API Key 加密
API_KEY_ENCRYPTION_SECRET=zNesTqx+a5Iiq+hMOaxD5INFJ4lT0sy/hEm8QPr5tDg=
```

### 2. LLM 整合 ✓
```bash
# Ollama (本機 GPU 推理)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:27b
OLLAMA_PROVIDER=ollama
```

**當前狀態**：✅ 系統可啟動、UI 可訪問、12 個 Agent 可運行（Mock 模式）

---

## 🎯 各測試層級的配置需求

### 🟢 層級 1: 基礎運行（已完成）

**可以做什麼**：
- ✅ 啟動 API + Web UI
- ✅ 註冊帳號、登入系統
- ✅ 創建專案、配置關鍵字
- ✅ 執行所有 12 個 Agent（使用 Mock 數據）
- ✅ Content Writer 生成真實內容（使用 Ollama）
- ✅ 查看儀表板、圖表、報表

**限制**：
- ❌ SERP Tracker 返回模擬排名（非真實 Google 數據）
- ❌ Keyword Researcher 返回模擬搜尋量（非真實 Ahrefs 數據）
- ❌ 無法發送 Email 通知
- ❌ 無法自動備份到 S3

**適用場景**：
- 本機開發、UI/UX 調整
- 前端功能測試
- 代碼邏輯驗證

---

### 🟡 層級 2: 核心功能測試（推薦用於完整驗收）

**需要新增 2-3 個外部 API**：

#### 2.1 SERP Tracking API（必需，用於排名追蹤）

**選擇一個 Provider**：

<details>
<summary><b>選項 A: ValueSERP</b> (推薦)</summary>

```bash
# .env 新增
SERP_PROVIDER=valueserp
VALUESERP_API_KEY=your_valueserp_api_key
```

**獲取方式**：
1. 註冊：https://www.valueserp.com/
2. 免費額度：1,000 次查詢/月
3. 定價：$0.002/次（超過免費額度）
4. 取得 API Key：Dashboard → API Keys

**優勢**：
- ✅ 價格便宜（最低 $0.002/次）
- ✅ 支援全球 200+ 國家
- ✅ JSON 格式簡單易用
- ✅ 穩定性高

</details>

<details>
<summary><b>選項 B: ScaleSERP</b></summary>

```bash
SERP_PROVIDER=scaleserp
SCALESERP_API_KEY=your_scaleserp_api_key
```

**獲取方式**：
1. 註冊：https://www.scaleserp.com/
2. 免費額度：100 次查詢/月
3. 定價：$0.005/次起

</details>

<details>
<summary><b>選項 C: Google Search Console API</b> (免費但有限制)</summary>

```bash
SERP_PROVIDER=gsc
GSC_API_KEY=your_gsc_service_account_key
GSC_SITE_URL=https://your-site.com
```

**獲取方式**：
1. 在 Google Cloud Console 創建 Service Account
2. 下載 JSON key file
3. 在 Search Console 授權該 Service Account

**限制**：
- ❌ 只能查詢已驗證的網站
- ❌ 數據延遲 2-3 天
- ❌ 無法查詢競爭對手排名

</details>

#### 2.2 Keyword Metrics API（可選，增強關鍵字研究）

**Ahrefs API**：

```bash
# .env 新增
AHREFS_API_KEY=your_ahrefs_api_key
```

**獲取方式**：
1. 註冊：https://ahrefs.com/api
2. 訂閱方案：$99/月起（Standard API）
3. Dashboard → API Access → Generate Token

**提供數據**：
- 搜尋量 (Search Volume)
- 關鍵字難度 (Keyword Difficulty)
- CPC 費用
- 點擊量預估
- 流量潛力

**不配置的影響**：
- ❌ Keyword Researcher Agent 返回模擬數據
- ✅ 其他 11 個 Agent 不受影響

#### 2.3 Content Analysis API（可選，增強內容優化）

**Google Cloud Natural Language API**：

```bash
# .env 新增
GOOGLE_NLP_API_KEY=your_google_api_key
```

**獲取方式**：
1. 前往 Google Cloud Console：https://console.cloud.google.com/
2. 啟用 Natural Language API
3. 創建 API Key：APIs & Services → Credentials → Create Credentials → API Key

**免費額度**：
- 5,000 單位/月（前 $300 免費試用）
- 1 次文本分析 = 1 單位

**提供功能**：
- 實體提取 (Entity Extraction)
- 情感分析 (Sentiment Analysis)
- 語法分析 (Syntax Analysis)

**不配置的影響**：
- ❌ Technical Auditor、Content Refresher 無法進行深度語義分析
- ✅ 基本 SEO 分析仍可運行

---

### 🟡 層級 2 配置總結

**最小配置（核心功能可用）**：

```bash
# 原有配置（已完成）
DATABASE_URL=postgres://aiseo_app:aiseo_app@localhost:5433/aiseo
REDIS_URL=redis://localhost:6379
API_KEY_ENCRYPTION_SECRET=zNesTqx+a5Iiq+hMOaxD5INFJ4lT0sy/hEm8QPr5tDg=
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:27b

# 新增（核心功能）
SERP_PROVIDER=valueserp
VALUESERP_API_KEY=your_valueserp_api_key  # 必需
```

**推薦配置（完整驗收）**：

```bash
# 核心功能
SERP_PROVIDER=valueserp
VALUESERP_API_KEY=your_valueserp_api_key

# 增強功能
AHREFS_API_KEY=your_ahrefs_api_key        # 推薦
GOOGLE_NLP_API_KEY=your_google_api_key    # 推薦
```

**成本估算（每月）**：
- 最小配置：$5-20（ValueSERP，約 5,000 次查詢）
- 推薦配置：$105-120（ValueSERP + Ahrefs Standard + Google NLP 免費額度）

**可驗收功能**：
- ✅ 12/12 Agent 完整運行
- ✅ SERP Tracker 返回真實 Google 排名
- ✅ Keyword Researcher 提供真實搜尋量與難度
- ✅ Content Writer 生成 SEO 優化內容（Ollama）
- ✅ Technical Auditor 進行語義分析
- ✅ 儀表板顯示真實數據與趨勢圖

---

### 🔴 層級 3: 完整生產部署

**需要新增的服務（正式上線用）**：

#### 3.1 Email Service（通知功能）

```bash
# SMTP 配置（例如 Gmail、SendGrid、AWS SES）
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=AISEO Platform <noreply@yourcompany.com>
```

**用途**：
- 使用者註冊驗證信
- 排名警報通知
- 報表排程寄送
- 系統異常通知

**推薦 Provider**：
- **SendGrid**：免費 100 封/天，$19.95/月 40,000 封
- **AWS SES**：$0.10/1000 封（需驗證域名）
- **Gmail SMTP**：免費但有限制（500 封/天）

#### 3.2 Backup Storage（自動備份）

```bash
# S3 或 MinIO 配置
BACKUP_ENABLED=true
BACKUP_S3_BUCKET=aiseo-backups
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ACCESS_KEY_ID=your_access_key
BACKUP_S3_SECRET_ACCESS_KEY=your_secret_key

# 選項：使用 MinIO 自建
BACKUP_S3_ENDPOINT=https://minio.yourcompany.com
BACKUP_S3_FORCE_PATH_STYLE=true

# 備份排程（每天凌晨 3 點）
BACKUP_CRON=0 3 * * *
BACKUP_RETENTION_DAYS=30
```

**用途**：
- 自動 PostgreSQL 備份（加密）
- 災難復原（Disaster Recovery）
- 合規要求（GDPR、SOC2）

**推薦 Provider**：
- **AWS S3**：$0.023/GB/月（Standard）
- **Backblaze B2**：$0.005/GB/月（最便宜）
- **MinIO**：自建（免費，需要 Server）

#### 3.3 Authentication & Security

```bash
# JWT 密鑰（用於 Access + Refresh Token）
JWT_SECRET=your_random_jwt_secret_min_32_chars
JWT_REFRESH_SECRET=your_random_refresh_secret_min_32_chars

# Platform Admin（訪問跨租戶管理 API）
PLATFORM_ADMIN_SECRET=your_platform_admin_secret

# Email 驗證（生產環境強烈建議啟用）
REQUIRE_EMAIL_VERIFICATION=true
```

**生成密鑰**：
```powershell
# PowerShell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

#### 3.4 Monitoring & Alerts（可選）

```bash
# Slack Webhook（系統警報）
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Sentry（錯誤監控，需額外安裝）
SENTRY_DSN=https://your-sentry-dsn
```

---

### 🔴 層級 3 配置總結

**完整 .env 範例**（生產環境）：

```bash
# ==================== 基礎設施 ====================
NODE_ENV=production
PORT=3001
DATABASE_URL=postgres://aiseo_app:secure_password@db.yourcompany.com:5432/aiseo_prod
REDIS_URL=redis://redis.yourcompany.com:6379
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000000

# ==================== 安全 ====================
API_KEY_ENCRYPTION_SECRET=zNesTqx+a5Iiq+hMOaxD5INFJ4lT0sy/hEm8QPr5tDg=
JWT_SECRET=your_production_jwt_secret_min_32_chars
JWT_REFRESH_SECRET=your_production_refresh_secret_min_32_chars
PLATFORM_ADMIN_SECRET=your_platform_admin_secret
REQUIRE_EMAIL_VERIFICATION=true

# ==================== LLM ====================
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:27b

# ==================== 外部 API ====================
# SERP Tracking（必需）
SERP_PROVIDER=valueserp
VALUESERP_API_KEY=your_valueserp_api_key

# Keyword Metrics（推薦）
AHREFS_API_KEY=your_ahrefs_api_key

# Content Analysis（推薦）
GOOGLE_NLP_API_KEY=your_google_api_key

# ==================== Email ====================
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
SMTP_FROM=AISEO Platform <noreply@yourcompany.com>

# ==================== 備份 ====================
BACKUP_ENABLED=true
BACKUP_S3_BUCKET=aiseo-prod-backups
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ACCESS_KEY_ID=your_aws_access_key
BACKUP_S3_SECRET_ACCESS_KEY=your_aws_secret_key
BACKUP_CRON=0 3 * * *
BACKUP_RETENTION_DAYS=30

# ==================== 監控（可選）====================
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

---

## 📋 12 個 Agent 的配置依賴

| Agent | 必需配置 | 可選配置 | Mock 模式 |
|-------|---------|---------|----------|
| **1. Keyword Researcher** | - | Ahrefs API | ✅ Mock 數據 |
| **2. SERP Tracker** | SERP API | - | ✅ Mock 排名 |
| **3. Content Writer** | Ollama | Gemini | ✅ 模板生成 |
| **4. Technical Auditor** | - | Google NLP | ✅ 基礎檢測 |
| **5. Competitor Monitor** | SERP API | - | ✅ Mock 競品 |
| **6. Backlink Builder** | - | Ahrefs API | ✅ Mock 外鏈 |
| **7. Report Generator** | - | Email SMTP | ✅ 生成報表（不寄送）|
| **8. Schema Generator** | - | - | ✅ 100% 可用 |
| **9. Internal Linker** | - | - | ✅ 100% 可用 |
| **10. PageSpeed Agent** | - | - | ✅ Mock 分數 |
| **11. Local SEO** | - | - | ✅ Mock 數據 |
| **12. Content Refresher** | Ollama | Google NLP | ✅ 基礎分析 |

**總結**：
- **0 個外部 API**：12/12 Agent 可運行（Mock 模式）
- **1 個外部 API**（SERP）：10/12 Agent 真實運行
- **3 個外部 API**（SERP + Ahrefs + NLP）：12/12 Agent 完全真實

---

## 🚀 快速配置指南（根據你的目標）

### 情境 1: 我只想本機測試系統功能

**需要**：✅ 已完成（基礎設施 + Ollama）  
**操作**：直接執行 `pnpm dev`  
**結果**：12 個 Agent 可運行（Mock 數據）  

---

### 情境 2: 我要完整驗收系統（推薦）

**需要**：
1. ✅ 已完成（基礎設施 + Ollama）
2. ➕ ValueSERP API（$20/月預算）

**操作**：
```bash
# 1. 註冊 ValueSERP
# 2. 取得 API Key
# 3. 修改 .env
SERP_PROVIDER=valueserp
VALUESERP_API_KEY=你的_api_key

# 4. 重啟服務
pnpm dev

# 5. 執行測試
pnpm -C apps/api phase1:e2e
```

**結果**：
- ✅ SERP Tracker 返回真實 Google 排名
- ✅ Competitor Monitor 分析真實競品
- ✅ 儀表板顯示真實趨勢圖

---

### 情境 3: 我要正式上線運營

**需要**：
1. ✅ 基礎設施（DB + Redis + Ollama）
2. ➕ SERP API（ValueSERP）
3. ➕ Email SMTP（SendGrid）
4. ➕ Backup Storage（AWS S3）
5. ➕ JWT Secrets（生產密鑰）
6. ➕ Ahrefs API（可選，增強功能）

**操作**：
1. 複製上方「完整 .env 範例」
2. 填寫所有必需欄位
3. 設定 `NODE_ENV=production`
4. 配置 HTTPS + Domain
5. 設定監控與警報

**部署檢查清單**：
- [ ] Database 已備份
- [ ] API_KEY_ENCRYPTION_SECRET 已更換為生產密鑰
- [ ] JWT_SECRET 已設定強密碼
- [ ] REQUIRE_EMAIL_VERIFICATION=true
- [ ] BACKUP_ENABLED=true
- [ ] SMTP 已測試可發信
- [ ] Slack 警報已配置
- [ ] HTTPS 憑證已安裝
- [ ] 防火牆規則已設定

---

## 💰 成本估算（每月）

| 配置層級 | 外部服務成本 | 硬體成本 | 總計 |
|---------|-------------|---------|------|
| **基礎運行** | $0 | Server/GPU | $0（本機免費）|
| **核心功能** | $5-20（SERP）| Server/GPU | $5-20 |
| **推薦配置** | $105-120 | Server/GPU | $105-120 |
| **完整生產** | $150-200 | Production Server | $150-200 + 主機費 |

**說明**：
- SERP API：$5-20/月（5,000-10,000 次查詢）
- Ahrefs：$99/月（Standard API）
- Google NLP：免費額度內 $0，超過約 $1-5/月
- Email：SendGrid $0-20/月（100-40,000 封）
- S3 Backup：$1-5/月（依數據量）

---

## ❓ 常見問題

### Q1: 不配置 SERP API，系統能用嗎？

**A**: 可以！系統會使用 Mock Provider，返回模擬排名數據。適合：
- 本機開發測試
- UI/UX 調整
- 代碼邏輯驗證

但無法取得真實 Google 排名。

---

### Q2: Ahrefs API 太貴了，有替代方案嗎？

**A**: 有以下選擇：
1. **不配置**：Keyword Researcher 返回模擬搜尋量（其他功能不受影響）
2. **用 Google Keyword Planner**：免費但需手動導入數據
3. **用 Ubersuggest API**：約 $29/月（功能較少）
4. **自建爬蟲**：違反 Google ToS，不建議

---

### Q3: 我只想測試 Content Writer，需要配置什麼？

**A**: 只需基礎配置（已完成）：
```bash
DATABASE_URL=...
REDIS_URL=...
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:27b
```

執行：
```bash
pnpm -C apps/api smoke:ollama
```

Content Writer 會使用 Ollama 生成真實內容，不需要任何外部 API。

---

### Q4: 可以先用免費方案驗收，再升級到付費嗎？

**A**: 可以！建議策略：

**階段 1：免費驗收（$0）**
- ✅ 基礎設施 + Ollama
- ✅ 12 個 Agent Mock 模式
- ✅ UI/UX 完整測試

**階段 2：核心功能（$5-20/月）**
- ➕ ValueSERP（免費 1,000 次查詢/月，超過付費）
- ✅ SERP 真實排名
- ✅ 儀表板真實數據

**階段 3：完整功能（$105-120/月）**
- ➕ Ahrefs API
- ➕ Google NLP
- ✅ 所有功能完全啟用

---

## 📞 下一步行動

### 選項 A: 繼續用 Mock 模式
**無需配置**，系統已可完整運行（模擬數據）。

### 選項 B: 升級到核心功能（推薦）
1. 註冊 ValueSERP：https://www.valueserp.com/
2. 取得 API Key
3. 在 `.env` 新增：
   ```bash
   SERP_PROVIDER=valueserp
   VALUESERP_API_KEY=你的_api_key
   ```
4. 重啟服務：`pnpm dev`
5. 測試：`pnpm -C apps/api phase1:e2e`

### 選項 C: 準備正式上線
參考「完整 .env 範例」，依序配置所有必需服務。

---

**你現在處於「🟢 基礎運行」層級，系統已可完整測試（Mock 模式）。要升級到「🟡 核心功能」，只需新增 1 個 SERP API（約 $5-20/月）。**

需要我協助配置 ValueSERP 嗎？或是你有其他問題？
