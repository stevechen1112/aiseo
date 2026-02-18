# Engineering Reference (OpenClaw)

本文件用來提醒：本專案會以 OpenClaw 作為工程實作對照（reference implementation），用來降低 Phase 0-1 的工程風險。

- 本地路徑：`C:\\Users\\User\\Desktop\\openclaw`
- 定位：僅供對照（patterns / structure / implementation hints），不作為 runtime 依賴。

建議對照主題：
- Gateway 啟動序列 + 配置驗證（Zod）
- Event system（seq、防亂序、廣播）
- Plugin discovery / registry
- Agent scope / workspace 隔離
- Cron service
- Docker sandbox（最小權限）

## OpenClaw 模組對照表（實際檔案路徑）

以下路徑以本地 OpenClaw（`C:\\Users\\User\\Desktop\\openclaw`）為準：

- 代理隔離 / Scope
	- `src\agents\agent-scope.ts`
	- `src\agents\agent-scope.test.ts`

- Sandbox（容器/權限配置）
	- `src\agents\sandbox\config.ts`
	- `src\agents\sandbox.ts`
	- `src\agents\sandbox-paths.ts`
	- `src\cli\sandbox-cli.ts`

- Cron / Scheduler
	- `src\cron\`（目錄下的 service/實作）
	- `src\agents\tools\cron-tool.ts`
	- `src\cli\cron-cli.ts`

- Config / Validation（可作為 Zod schema/guard 的參考）
	- `src\cli\program\config-guard.ts`
	- `src\channels\plugins\config-schema.ts`
	- `src\agents\models-config.ts`
	- `src\agents\models-config.providers.ts`

- Subagent pattern（生命週期/持久化/announce）
	- `src\agents\subagent-registry.ts`
	- `src\agents\subagent-registry.store.ts`
	- `src\agents\subagent-announce.ts`
	- `src\agents\subagent-announce-queue.ts`

- Browser engine
	- `src\browser\server.ts`
	- `src\browser\server-context.ts`
	- `src\browser\bridge-server.ts`

備註：OpenClaw 的檔名/路徑可能隨版本重構而變動，以上以你本機版本為準，後續若更新 OpenClaw 版本需同步校正對照表。
