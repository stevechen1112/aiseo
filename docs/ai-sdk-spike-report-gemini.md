# AI SDK Spike Report — Google Gemini

- Date: 2026-02-16
- Scope: Phase 0 / AI SDK Spike verification (tool use + streaming + retry + token counting) in Node.js backend
- Provider: Google Gemini (via Vercel AI SDK package `ai` + `@ai-sdk/google`)

## Environment

- Local API env: `apps/api/.env`
  - `GOOGLE_GENERATIVE_AI_API_KEY` (required; intentionally left blank in repo workspace)
  - `GEMINI_MODEL` (tested with `gemini-3-pro-preview`)

## What was validated

### 1) Multi-round tool use

- Implemented a deterministic, safe toolchain stub for a content-writer-like workflow:
  - `serp_structure` (mock SERP structure summary)
  - `seo_guardrails` (keyword density + basic checks)
- Verified the backend can execute multiple tool calls across multiple steps and continue generation.

### 2) Streaming (SSE)

- Implemented a Server-Sent Events endpoint that streams text chunks and emits step-level telemetry.

Endpoint:
- `POST /spike/gemini/content-writer`

SSE events:
- `meta` (model + input)
- `step` (finishReason, toolCalls, usage)
- `chunk` (streamed text)
- `usage` (totalUsage + per-step summary)
- `done`

### 3) Retry

- Added a simple exponential backoff wrapper around the `streamText()` call (pre-stream retry).

### 4) Token counting

- Captured `totalUsage` and per-step `usage` from AI SDK streaming result.

## Repro steps

### CLI Spike

Run:
- `pnpm -C apps/api spike:gemini "<topic>"`

Expected:
- Step logs printed to stderr
- Output printed to stdout
- `totalUsage` printed at the end

### SSE Spike

Run API dev server:
- `C:\\Users\\User\\AppData\\Roaming\\npm\\pnpm.cmd -C apps/api dev`

Call endpoint (PowerShell):
- `Invoke-WebRequest -Method Post -Uri http://localhost:3001/spike/gemini/content-writer -ContentType 'application/json' -Body ( @{ topic = '...'; locale='zh-TW'; audience='SEO team' } | ConvertTo-Json )`

Expected:
- `step` events contain `toolCalls` with at least `serp_structure` and `seo_guardrails`
- `usage` event contains `totalUsage` and per-step `usage`

## Result

✅ Feasible (Go)

- Tool calling works end-to-end on Node.js backend.
- SSE streaming works and can emit step-level telemetry.
- Token usage (`totalUsage`) is available for cost tracking.
- Retry can be handled at the application layer.

## Notes / Risks

- Model availability: `GEMINI_MODEL` must be a model name enabled for the API key.
- The Spike uses safe stub tools only; production tools (web fetch, CMS publish, etc.) must be gated and permissioned.
- For production, prefer provider/client timeouts + structured error handling + dead-letter logging.
