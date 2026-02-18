# 🎯 立即可用：3 步驟完成配置

## 當前狀態
你的 `.env` 檔案已存在，基礎配置都有了。只需要補 3 個欄位就能運行完整測試。

---

## 📝 需要修改的欄位

### 1️⃣ 更換加密密鑰（必須）

**當前值**（不安全）：
```env
API_KEY_ENCRYPTION_SECRET=dev-secret-change-me
```

**改成**（已為你生成）：
```env
API_KEY_ENCRYPTION_SECRET=zNesTqx+a5Iiq+hMOaxD5INFJ4lT0sy/hEm8QPr5tDg=
```

---

### 2️⃣ 新增 Ollama 配置（必須）

在檔案末尾**加上**這 3 行：

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:27b
LLM_PROVIDER=ollama
```

---

### 3️⃣ （可選）新增 Gemini 備用

如果你想能切換到雲端 LLM（更快/更穩定），也可以加上：

```env
GOOGLE_GENERATIVE_AI_API_KEY=你的key（留空也可以先測試）
GEMINI_MODEL=gemini-1.5-flash
```

---

## ⚡ 快速操作命令

### 方式 A：手動編輯（推薦）

```powershell
# 用 VSCode 打開 .env
code .env

# 修改上述 3 處，存檔
```

### 方式 B：自動追加（PowerShell）

```powershell
# 備份原檔
Copy-Item .env .env.backup

# 更新加密密鑰
(Get-Content .env) -replace 'API_KEY_ENCRYPTION_SECRET=.*', 'API_KEY_ENCRYPTION_SECRET=zNesTqx+a5Iiq+hMOaxD5INFJ4lT0sy/hEm8QPr5tDg=' | Set-Content .env

# 追加 Ollama 配置
@"

# LLM Service (Ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:27b
LLM_PROVIDER=ollama
"@ | Add-Content .env

# 確認結果
Get-Content .env
```

---

## ✅ 驗證配置

修改完成後，執行以下命令確認一切正常：

```powershell
# 1. 確認 Docker 服務
docker compose -f docker/docker-compose.yml ps

# 2. 確認 Ollama
ollama list
# 應該看到 gemma3:27b

# 3. 測試 DB 連線
pnpm -C apps/api db:migrate

# 4. 啟動 API（會讀取 .env）
pnpm -C apps/api dev
# 另開終端執行：
curl http://localhost:3001/health
# 應該回應 {"status":"ok"}
```

---

## 🎬 下一步：執行完整測試

當上述驗證都通過後，就可以跑完整的端到端測試了。

我接下來會：
1. **接入 Ollama provider**（讓 Smart Agents 真的能用 gemma3:27b）
2. **建立驗證腳本**（一鍵測試 12 agents + 4 workflows）
3. **提供測試報告**（可追溯的 log/artifacts）

---

## ❓ 疑難排解

### Q: 如果 workers 跑在 Docker 容器內？
改用：
```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

### Q: 想切回 Gemini 怎麼辦？
把 `LLM_PROVIDER` 改成：
```env
LLM_PROVIDER=gemini
```

### Q: 可以兩個都設定嗎？
可以！系統會根據 `LLM_PROVIDER` 決定用哪一個。你可以隨時切換對比。

---

**現在就動手修改 `.env`，完成後告訴我，我會立即開始接入 Ollama！**
