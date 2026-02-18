/**
 * AISEO 企業級 SEO 平台 — 完整端到端整合測試
 *
 * 測試範圍：
 *   T1  SEMrush API — 關鍵詞搜尋量、KD、CPC（phrase_this + phrase_kdi）
 *   T2  LLM NLP   — 實體提取、情感分析、關鍵詞、主題（Ollama 零成本）
 *   T3  ValueSERP — Google SERP 排名追蹤
 *   T4  Keyword Researcher Agent — SEMrush 擴展 + 意圖分類
 *   T5  Content Writer Agent — LLM 文章產出 + CJK 字數 + SEO 評分
 *   T6  邊界 / 錯誤處理 — 空輸入、不存在的關鍵字、極短文本
 *   T7  PageSpeed Insights API — 真實 Lighthouse 分數 + CWV
 *   T8  SERP Tracker Agent — ValueSERP 即時排名追蹤
 *   T9  Schema Agent — 真實 HTML 結構化資料偵測
 *   T10 Technical Auditor — PSI + Cheerio Meta 檢查
 *   T11 Web Crawler — 真實網站爬取
 *   T12 SEMrush Domain Analytics — 網域流量 + 關鍵字
 *   T13 Multi-Agent Workflow — Keyword Researcher → Content Writer + EventBus
 *   T14 Error Handling & Recovery — 預期錯誤 + 不中斷後續流程
 *   T15 Orchestrator Multi-task — BullMQ Flow 併發 + Retry + EventBus(Redis)
 *   T16 Google Suggest — 自動完成建議（免 API Key）
 *   T17 HTTP Fetch Tool — 沙箱 HTTP 存取
 *   T18 Tool Registry — 權限驗證 + 沙箱安全
 *   T19 DAG Parser — YAML 工作流 DAG 解析 + 循環偵測
 *   T20 Agent Workspace — 隔離工作空間建立與清理
 *   T21 Workflow Definitions — 4 種預定義工作流驗證
 *   T22 CompetitorMonitor Agent — 競爭對手分析（SEMrush + LLM）
 *   T23 InternalLinker Agent — 內部連結分析（爬取 + 圖譜）
 *   T24 ContentRefresher Agent — 內容新鮮度檢測
 *   T25 CronScheduler — 排程管理（Redis）
 *   T26 EventBus 多租戶隔離 — Redis Pub/Sub 頻道隔離驗證
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { FlowProducer, type FlowJob } from 'bullmq';

// ── env ──────────────────────────────────────────────────────────
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const envPath = resolve(__dirname, '../../../../.env');
config({ path: envPath });

import {
  AgentRegistry,
  BaseAgent,
  CORE_VERSION,
  createRedisConnection,
  EventBus as RedisEventBus,
  OrchestratorEngine,
  ToolRegistry,
  // DAG parser
  parseDagYaml,
  detectCycles,
  // Agent workspace
  createIsolatedWorkspace,
  // Tool registry utilities
  createDefaultToolRegistry,
  assertUrlHostAllowed,
  getEffectiveNetworkAllowlist,
  // Workflow definitions
  createSeoContentPipelineFlow,
  createMonitoringFlow,
  createAuditFlow,
  createLocalSeoFlow,
  getWorkflowDefinition,
  // Scheduler
  CronScheduler,
  // Additional agents
  InternalLinkerAgent,
  CompetitorMonitorAgent,
  ContentRefresherAgent,
  PageSpeedAgent,
  type AgentContext,
  type EventBus as EventBusType,
  type ToolContext,
  type StartFlowInput,
} from '@aiseo/core';
import { semrushKeywordIdeasTool, semrushKeywordMetricsTool, semrushDomainOverviewTool, semrushDomainOrganicTool } from '@aiseo/core';
import { llmNlpAnalyzeTool } from '@aiseo/core';
import { llmChatTool } from '@aiseo/core';
import { googleSuggestTool } from '@aiseo/core';
import { httpFetchTool } from '@aiseo/core';
import { pagespeedInsightsTool } from '@aiseo/core';
import { webCrawlerTool } from '@aiseo/core';
import { KeywordResearcherAgent, ContentWriterAgent, SerpTrackerAgent, SchemaAgent, TechnicalAuditorAgent } from '@aiseo/core';

// ── helpers ──────────────────────────────────────────────────────
class InMemoryEventBus {
  options = {} as any;
  prefix = 'test';
  private readonly events: unknown[] = [];

  async publish(event: unknown): Promise<unknown> {
    this.events.push(event);
    return event;
  }

  subscribe() {
    return { start: async () => {}, stop: async () => {} };
  }

  subscribeAll() {
    return { start: async () => {}, stop: async () => {} };
  }

  getEvents() {
    return this.events;
  }
}

const eventBusRaw = new InMemoryEventBus();
const eventBus = eventBusRaw as unknown as EventBusType;

const ctx: ToolContext = {
  tenantId: 'test-tenant',
  projectId: 'test-project',
  agentId: 'test-agent',
  workspacePath: '/tmp/test-workspace',
};

// ── Log file setup ───────────────────────────────────────────────
const logDir = resolve(__dirname, '../../../../test-results');
mkdirSync(logDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logFilePath = resolve(logDir, `full-integration-${ts}.log`);
const jsonFilePath = resolve(logDir, `full-integration-${ts}.json`);
writeFileSync(logFilePath, '');

// ── Plain-text output (console + file tee) ───────────────────────
const log = (msg = '') => {
  console.log(msg);
  try { appendFileSync(logFilePath, msg + '\n'); } catch { /* ignore */ }
};
const hr = () => log('\u2500'.repeat(64));
const section = (title: string) => { hr(); log(`  ${title}`); hr(); };

// ── Assertion tracker ────────────────────────────────────────────
interface Assertion { name: string; pass: boolean; detail: string }
const assertions: Assertion[] = [];
function assert(name: string, pass: boolean, detail = '') {
  assertions.push({ name, pass, detail });
  log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' \u2014 ' + detail : ''}`);
}

// ── Timing ───────────────────────────────────────────────────────
const globalStart = Date.now();
const durations: Record<string, number> = {};
function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const s = Date.now();
  return fn().finally(() => { durations[label] = Date.now() - s; });
}

// ==================================================================
// Report header
// ==================================================================
log('================================================================');
log('  AISEO \u4f01\u696d\u7d1a SEO \u5e73\u53f0 \u2014 \u5b8c\u6574\u7aef\u5230\u7aef\u6574\u5408\u6e2c\u8a66\u5831\u544a');
log('================================================================');
log();

// -- 1. Timestamp --
log(`\u57f7\u884c\u6642\u9593: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
log(`     UTC: ${new Date().toISOString()}`);
log(`Core Version: ${CORE_VERSION}`);
log(`Log File: ${logFilePath}`);
log();

// -- 2. Environment --
section('\u74b0\u5883\u8cc7\u8a0a');
const nodeVersion = process.version;
const platform = `${process.platform} ${process.arch}`;
let pnpmVersion = 'unknown';
try { pnpmVersion = execSync('corepack pnpm --version', { encoding: 'utf-8' }).trim(); } catch { /* ignore */ }
log(`  Node.js     : ${nodeVersion}`);
log(`  OS          : ${platform}`);
log(`  pnpm        : ${pnpmVersion}`);
log(`  Ollama Model: ${process.env.OLLAMA_MODEL || '(not set)'}`);
log(`  Ollama URL  : ${process.env.OLLAMA_BASE_URL || '(not set)'}`);
log(`  SEMrush DB  : ${process.env.SEMRUSH_DATABASE || '(not set)'}`);
log(`  SEMrush Key : ${process.env.SEMRUSH_API_KEY ? process.env.SEMRUSH_API_KEY.slice(0, 8) + '...' : '(not set)'}`);
log(`  ValueSERP   : ${process.env.VALUESERP_API_KEY ? process.env.VALUESERP_API_KEY.slice(0, 8) + '...' : '(not set)'}`);
log();

// ==================================================================
// T1: SEMrush keyword metrics
// ==================================================================
section('T1  SEMrush \u95dc\u9375\u8a5e\u6307\u6a19');

const testKeywords = ['SEO \u4f18\u5316', 'Next.js', '\u5185\u5bb9\u8425\u9500', 'AI \u5199\u4f5c'];
log(`  \u8f38\u5165: ${testKeywords.join(', ')}  (\u5171 ${testKeywords.length} \u7d44)`);
log();

let semrushMetrics: any[] = [];
try {
  const result = await timed('T1', () =>
    semrushKeywordMetricsTool.execute({ keywords: testKeywords, database: 'tw' }, ctx)
  );
  semrushMetrics = result.metrics;

  log(`  \u56de\u50b3 ${result.metrics.length} / ${testKeywords.length} \u7b46`);
  if (result.metrics.length < testKeywords.length) {
    const returned = new Set(result.metrics.map((m) => m.keyword));
    const missing = testKeywords.filter((k) => !returned.has(k));
    log(`  \u7f3a\u5931: ${missing.join(', ')} (SEMrush tw \u8cc7\u6599\u5eab\u7121\u6b64\u95dc\u9375\u5b57\u8cc7\u6599)`);
  }
  log();

  result.metrics.forEach((m, i) => {
    log(`  ${i + 1}. ${m.keyword}`);
    log(`     \u641c\u5c0b\u91cf: ${m.searchVolume.toLocaleString()}/\u6708  KD: ${m.keywordDifficulty}/100  CPC: $${m.cpc.toFixed(2)}  \u7af6\u722d\u5ea6: ${(m.competition * 100).toFixed(1)}%`);
  });
  log();

  assert('T1-01 API \u56de\u50b3\u81f3\u5c11 1 \u7b46', result.metrics.length >= 1, `got ${result.metrics.length}`);
  assert('T1-02 searchVolume \u70ba\u975e\u8ca0\u6574\u6578', result.metrics.every((m) => Number.isInteger(m.searchVolume) && m.searchVolume >= 0), '');
  assert('T1-03 KD \u7bc4\u570d 0-100', result.metrics.every((m) => m.keywordDifficulty >= 0 && m.keywordDifficulty <= 100), '');
  assert('T1-04 CPC \u70ba\u975e\u8ca0\u6578', result.metrics.every((m) => m.cpc >= 0), '');
} catch (error) {
  assert('T1-01 API \u56de\u50b3\u81f3\u5c11 1 \u7b46', false, String(error));
}
log();

// ==================================================================
// T2: LLM NLP
// ==================================================================
section('T2  LLM NLP \u667a\u80fd\u5206\u6790 (Ollama \u96f6\u6210\u672c)');

const analysisText = '\u4f01\u4e1a\u7ea7 SEO \u5e73\u53f0\u7ed3\u5408\u4e86\u4eba\u5de5\u667a\u80fd\u6280\u672f\uff0c\u5305\u62ec Next.js \u6846\u67b6\u3001Ollama LLM \u5185\u5bb9\u751f\u6210\u3001SEMrush API \u5173\u952e\u8bcd\u5206\u6790\u548c ValueSERP \u6392\u540d\u8ffd\u8e2a\uff0c\u4e3a\u4f01\u4e1a\u63d0\u4f9b\u5168\u65b9\u4f4d\u7684\u641c\u7d22\u5f15\u64ce\u4f18\u5316\u89e3\u51b3\u65b9\u6848\u3002\u8be5\u5e73\u53f0\u652f\u6301\u81ea\u52a8\u5316\u5185\u5bb9\u521b\u4f5c\u3001\u667a\u80fd\u5173\u952e\u8bcd\u7814\u7a76\u3001\u7ade\u4e89\u5bf9\u624b\u76d1\u63a7\u7b49 12 \u79cd AI Agent \u529f\u80fd\u3002';
log(`  \u8f38\u5165\u6587\u672c (${analysisText.length} \u5b57): "${analysisText.slice(0, 60)}..."`);
log();

try {
  const nlpResult = await timed('T2', () =>
    llmNlpAnalyzeTool.execute(
      { text: analysisText, features: ['entities', 'sentiment', 'keywords', 'topics'], language: 'zh-TW' },
      ctx,
    )
  );

  const entities = nlpResult.entities ?? [];
  log(`  \u5be6\u9ad4: ${entities.length} \u9805`);
  entities.slice(0, 8).forEach((e) => log(`    - ${e.name} (${e.type}) salience=${(e.salience * 100).toFixed(1)}%`));
  log();

  const sent = nlpResult.sentiment;
  if (sent) {
    log(`  \u60c5\u611f: score=${sent.score.toFixed(2)} label=${sent.label} magnitude=${sent.magnitude.toFixed(2)}`);
  }
  log(`  \u95dc\u9375\u8a5e: ${(nlpResult.keywords ?? []).slice(0, 8).join(', ')}`);
  log(`  \u4e3b\u984c: ${(nlpResult.topics ?? []).join(', ')}`);
  log();

  assert('T2-01 \u5be6\u9ad4 >= 3 \u500b', entities.length >= 3, `got ${entities.length}`);
  assert('T2-02 \u60c5\u611f\u5206\u6578 -1~1', !!sent && sent.score >= -1 && sent.score <= 1, sent ? `score=${sent.score}` : 'no sentiment');
  const salienceSum = entities.reduce((s, e) => s + e.salience, 0);
  assert('T2-03 salience \u7e3d\u548c \u2248 1.0', Math.abs(salienceSum - 1) < 0.15, `sum=${salienceSum.toFixed(3)}`);
  assert('T2-04 \u95dc\u9375\u8a5e >= 3 \u500b', (nlpResult.keywords ?? []).length >= 3, `got ${(nlpResult.keywords ?? []).length}`);
} catch (error) {
  assert('T2-01 \u5be6\u9ad4 >= 3 \u500b', false, String(error));
}
log();

// ==================================================================
// T3: ValueSERP
// ==================================================================
section('T3  ValueSERP Google \u6392\u540d\u8ffd\u8e64');

const serpQuery = 'Next.js \u6559\u5b66';
const serpUrl = 'https://nextjs.org';
log(`  \u67e5\u8a62: "${serpQuery}"  \u76ee\u6a19: ${serpUrl}`);
log();

try {
  const params = new URLSearchParams({
    api_key: process.env.VALUESERP_API_KEY || '',
    q: serpQuery,
    location: 'Taiwan',
    google_domain: 'google.com.tw',
    gl: 'tw',
    hl: 'zh-tw',
    num: '20',
  });

  const serpData: any = await timed('T3', async () => {
    const resp = await fetch(`https://api.valueserp.com/search?${params.toString()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  });

  const organics = (serpData.organic_results ?? []) as any[];
  log(`  \u7e3d\u7d50\u679c\u6578: ${serpData.search_information?.total_results?.toLocaleString() ?? 'N/A'}`);
  log(`  Credits: ${serpData.request_info?.credits_used ?? 'N/A'}`);
  log();

  organics.slice(0, 5).forEach((r: any, i: number) => {
    log(`  ${i + 1}. ${r.title ?? 'N/A'}`);
    log(`     ${r.link ?? 'N/A'}`);
  });
  log();

  const targetIdx = organics.findIndex((r: any) => r.link?.includes(new URL(serpUrl).hostname));
  log(`  \u76ee\u6a19\u6392\u540d: ${targetIdx >= 0 ? `\u7b2c ${targetIdx + 1} \u4f4d` : '\u672a\u9032\u524d 20 \u540d'}`);
  log();

  assert('T3-01 \u56de\u50b3\u81f3\u5c11 5 \u7b46\u81ea\u7136\u7d50\u679c', organics.length >= 5, `got ${organics.length}`);
  assert('T3-02 \u6bcf\u7b46\u542b title + link', organics.slice(0, 5).every((r: any) => r.title && r.link), '');
} catch (error) {
  assert('T3-01 \u56de\u50b3\u81f3\u5c11 5 \u7b46\u81ea\u7136\u7d50\u679c', false, String(error));
}
log();

// ==================================================================
// T4: Keyword Researcher Agent
// ==================================================================
section('T4  Keyword Researcher Agent (\u6574\u5408)');

const registry = new ToolRegistry();
registry.register(semrushKeywordMetricsTool);
registry.register(semrushKeywordIdeasTool);
registry.register(semrushDomainOverviewTool);
registry.register(semrushDomainOrganicTool);
registry.register(llmNlpAnalyzeTool);
registry.register(llmChatTool);
registry.register(googleSuggestTool);
registry.register(pagespeedInsightsTool);
registry.register(webCrawlerTool);

const agentCtx: AgentContext = {
  ...ctx,
  workspacePath: '/tmp/test',
  tools: registry,
  eventBus,
};
const keywordAgent = new KeywordResearcherAgent();

const seedKeyword = 'AI \u5185\u5bb9\u521b\u4f5c\u5de5\u5177';
log(`  \u7a2e\u5b50\u95dc\u9375\u8a5e: "${seedKeyword}"`);
log();

try {
  const kwResult = await timed('T4', () =>
    keywordAgent.run(
      { seedKeyword, locale: 'zh-TW', country: 'tw', maxKeywords: 30 },
      agentCtx,
    )
  );

  log(`  \u7e3d\u95dc\u9375\u8a5e: ${kwResult.keywords.length}`);
  log();

  log('  Top 10 \u95dc\u9375\u8a5e:');
  kwResult.keywords.slice(0, 10).forEach((kw, i) => log(`    ${i + 1}. ${kw}`));
  log();

  if (kwResult.entities?.length) {
    log('  \u5be6\u9ad4:');
    kwResult.entities.slice(0, 5).forEach((e) => log(`    - ${e.name} (${e.type})`));
    log();
  }

  if (kwResult.intents?.length) {
    log('  \u641c\u5c0b\u610f\u5716:');
    kwResult.intents.slice(0, 12).forEach((i) =>
      log(`    - ${i.keyword} \u2192 ${i.intent} (${Math.round(i.confidence * 100)}%)`)
    );
    log();
  }

  assert('T4-01 \u95dc\u9375\u8a5e >= 10 \u7d44', kwResult.keywords.length >= 10, `got ${kwResult.keywords.length}`);
  assert('T4-02 \u542b\u7a2e\u5b50\u95dc\u9375\u8a5e', kwResult.keywords.includes(seedKeyword), '');
  assert('T4-03 \u5be6\u9ad4\u5df2\u63d0\u53d6', (kwResult.entities?.length ?? 0) >= 1, `got ${kwResult.entities?.length ?? 0}`);
  assert('T4-04 \u610f\u5716\u5df2\u5206\u985e', (kwResult.intents?.length ?? 0) >= 1, `got ${kwResult.intents?.length ?? 0}`);
  assert('T4-05 \u610f\u5716 confidence 0~1',
    (kwResult.intents ?? []).every((i) => i.confidence >= 0 && i.confidence <= 1), '');
  const intentTypes = new Set((kwResult.intents ?? []).map((i) => i.intent));
  assert('T4-06 \u81f3\u5c11 2 \u7a2e\u610f\u5716\u985e\u578b', intentTypes.size >= 2, `types: ${[...intentTypes].join(', ')}`);
} catch (error) {
  assert('T4-01 \u95dc\u9375\u8a5e >= 10 \u7d44', false, String(error));
}
log();

// ==================================================================
// T5: Content Writer Agent
// ==================================================================
section('T5  Content Writer Agent (AI \u5167\u5bb9\u751f\u6210)');

const contentAgent = new ContentWriterAgent();
const contentTopic = 'Next.js \u6027\u80fd\u4f18\u5316\u6700\u4f73\u5b9e\u8df5';
const contentKeywords = ['Next.js', 'SSR', 'ISR', '\u6027\u80fd\u4f18\u5316', 'Web Vitals'];
log(`  \u4e3b\u984c: "${contentTopic}"`);
log(`  \u95dc\u9375\u8a5e: ${contentKeywords.join(', ')}`);
log();

try {
  const cr = await timed('T5', () =>
    contentAgent.run(
      { topic: contentTopic, keywords: contentKeywords, tone: 'professional', format: 'blog', targetWordCount: 1200 },
      agentCtx,
    )
  );

  log(`  \u6a19\u984c: ${cr.title}`);
  log(`  \u5b57\u6578: ${cr.totalWordCount} (CJK-aware)`);
  log(`  SEO \u5206\u6578: ${cr.seoScore}/100`);
  log(`  \u53ef\u8b80\u6027: ${cr.readabilityScore}/100`);
  log();

  // SEO Scoring formula breakdown
  log('  SEO \u8a55\u5206\u516c\u5f0f\u5206\u89e3 (calculateSeoScore):');
  log('    +20  \u6a19\u984c\u542b\u4e3b\u95dc\u9375\u8a5e');
  log('    +15  Meta Description \u542b\u4e3b\u95dc\u9375\u8a5e');
  log('    +25  \u4e3b\u95dc\u9375\u8a5e\u5bc6\u5ea6 1-2% (\u6216 +15 if 0.5-1%)');
  log('    +20  \u526f\u95dc\u9375\u8a5e\u51fa\u73fe\u6578 (\u6bcf\u500b +5, max 20)');
  log('    +20  \u5b57\u6578 1200-2500 (\u6216 +10 if >= 800)');
  log('    = max 100');
  log();

  // Manual verification
  const fullContent = cr.sections.map((s) => s.content).join(' ');
  const contentLower = fullContent.toLowerCase();
  const primary = contentKeywords[0].toLowerCase();
  const titleHasPrimary = cr.title.toLowerCase().includes(primary);
  const metaHasPrimary = cr.metaDescription.toLowerCase().includes(primary);
  const occurrences = (contentLower.match(new RegExp(primary, 'g')) ?? []).length;
  const density = (occurrences / Math.max(1, cr.totalWordCount)) * 100;
  const secHits = contentKeywords.slice(1).filter((k) => contentLower.includes(k.toLowerCase())).length;

  log('  \u624b\u52d5\u9a57\u8b49 SEO \u8a55\u5206:');
  log(`    \u6a19\u984c\u542b "${contentKeywords[0]}": ${titleHasPrimary ? 'YES (+20)' : 'NO (+0)'}`);
  log(`    Meta \u542b "${contentKeywords[0]}": ${metaHasPrimary ? 'YES (+15)' : 'NO (+0)'}`);
  log(`    \u5bc6\u5ea6: ${density.toFixed(2)}% (\u51fa\u73fe ${occurrences} \u6b21 / ${cr.totalWordCount} \u5b57)${density >= 1 && density <= 2 ? ' (+25)' : density >= 0.5 ? ' (+15)' : ' (+0)'}`);
  log(`    \u526f\u95dc\u9375\u8a5e\u547d\u4e2d: ${secHits}/${contentKeywords.length - 1} (+${Math.min(20, secHits * 5)})`);
  log(`    \u5b57\u6578: ${cr.totalWordCount} ${cr.totalWordCount >= 1200 && cr.totalWordCount <= 2500 ? '(+20)' : cr.totalWordCount >= 800 ? '(+10)' : '(+0)'}`);
  let expectedScore = 0;
  if (titleHasPrimary) expectedScore += 20;
  if (metaHasPrimary) expectedScore += 15;
  if (density >= 1 && density <= 2) expectedScore += 25;
  else if (density >= 0.5) expectedScore += 15;
  expectedScore += Math.min(20, secHits * 5);
  if (cr.totalWordCount >= 1200 && cr.totalWordCount <= 2500) expectedScore += 20;
  else if (cr.totalWordCount >= 800) expectedScore += 10;
  expectedScore = Math.min(100, expectedScore);
  log(`    \u624b\u52d5\u8a08\u7b97: ${expectedScore}  \u5831\u544a\u503c: ${cr.seoScore}  ${expectedScore === cr.seoScore ? 'MATCH' : 'MISMATCH'}`);
  log();

  log('  \u5927\u7db1:');
  cr.outline.forEach((h) => log(`    - ${h}`));
  log();
  log('  \u7ae0\u7bc0\u5b57\u6578:');
  cr.sections.forEach((s) => log(`    - ${s.title} (${s.wordCount} \u5b57)`));
  log();
  log(`  Meta Description (${cr.metaDescription.length} \u5b57):`);
  log(`    "${cr.metaDescription.length > 120 ? cr.metaDescription.slice(0, 120) + '...' : cr.metaDescription}"`);
  log();

  assert('T5-01 \u5b57\u6578 >= 1000', cr.totalWordCount >= 1000, `got ${cr.totalWordCount}`);
  assert('T5-02 SEO >= 70', cr.seoScore >= 70, `got ${cr.seoScore}`);
  assert('T5-03 \u5927\u7db1 >= 5 \u6bb5', cr.outline.length >= 5, `got ${cr.outline.length}`);
  assert('T5-04 \u7ae0\u7bc0\u6578 >= 3', cr.sections.length >= 3, `got ${cr.sections.length}`);
  assert('T5-05 \u6a19\u984c\u975e\u7a7a', cr.title.length > 0, '');
  assert('T5-06 Meta 80-200 \u5b57', cr.metaDescription.length >= 80 && cr.metaDescription.length <= 200,
    `len=${cr.metaDescription.length}`);
  assert('T5-07 SEO \u5206\u6578\u8207\u624b\u52d5\u8a08\u7b97\u4e00\u81f4', expectedScore === cr.seoScore,
    `expected=${expectedScore} actual=${cr.seoScore}`);
} catch (error) {
  assert('T5-01 \u5b57\u6578 >= 1000', false, String(error));
}
log();

// ==================================================================
// T6: Edge cases / error handling
// ==================================================================
section('T6  \u908a\u754c\u8207\u932f\u8aa4\u8655\u7406');

// T6-01: SEMrush empty array
log('  T6-01: SEMrush \u50b3\u5165\u7a7a\u95dc\u9375\u8a5e\u9663\u5217');
try {
  const emptyResult = await timed('T6-01', () =>
    semrushKeywordMetricsTool.execute({ keywords: [], database: 'tw' }, ctx)
  );
  assert('T6-01 \u7a7a\u8f38\u5165\u4e0d\u5d29\u6f70', true, `\u56de\u50b3 ${emptyResult.metrics?.length ?? 0} \u7b46`);
} catch (error) {
  // Throwing is acceptable for empty input
  assert('T6-01 \u7a7a\u8f38\u5165\u4e0d\u5d29\u6f70', true, `\u62cb\u51fa\u4f8b\u5916 (\u53ef\u63a5\u53d7): ${String(error).slice(0, 80)}`);
}
log();

// T6-02: Nonexistent keyword
log('  T6-02: SEMrush \u67e5\u8a62\u4e0d\u5b58\u5728\u7684\u96a8\u6a5f\u5b57\u4e32');
try {
  const randomKw = `xyzqwerty${Date.now()}nonexistent`;
  const noResult = await timed('T6-02', () =>
    semrushKeywordMetricsTool.execute({ keywords: [randomKw], database: 'tw' }, ctx)
  );
  const count = noResult.metrics?.length ?? 0;
  assert('T6-02 \u4e0d\u5b58\u5728\u95dc\u9375\u5b57\u56de\u50b3 0 \u7b46', count === 0, `got ${count}`);
} catch (error) {
  assert('T6-02 \u4e0d\u5b58\u5728\u95dc\u9375\u5b57\u56de\u50b3 0 \u7b46', false, String(error).slice(0, 120));
}
log();

// T6-03: LLM NLP very short text
log('  T6-03: LLM NLP \u50b3\u5165\u6975\u77ed\u6587\u672c');
try {
  const shortResult = await timed('T6-03', () =>
    llmNlpAnalyzeTool.execute({ text: 'Hi', features: ['entities', 'sentiment'] }, ctx)
  );
  assert('T6-03 \u6975\u77ed\u6587\u672c\u4e0d\u5d29\u6f70', true, `entities=${shortResult.entities?.length ?? 0}`);
} catch (error) {
  assert('T6-03 \u6975\u77ed\u6587\u672c\u4e0d\u5d29\u6f70', false, String(error).slice(0, 120));
}
log();

// ==================================================================
// T7: PageSpeed Insights API (Real Lighthouse)
// ==================================================================
section('T7  PageSpeed Insights API (\u771f\u5be6 Lighthouse)');

const psiTestUrl = 'https://example.com';
log(`  URL: ${psiTestUrl}  \u7b56\u7565: mobile`);
log();

try {
  const psiResult = await timed('T7', () =>
    pagespeedInsightsTool.execute({ url: psiTestUrl, strategy: 'mobile' }, ctx)
  );

  log(`  Performance  : ${psiResult.lighthouseScores.performance}/100`);
  log(`  Accessibility: ${psiResult.lighthouseScores.accessibility}/100`);
  log(`  Best Practices: ${psiResult.lighthouseScores.bestPractices}/100`);
  log(`  SEO          : ${psiResult.lighthouseScores.seo}/100`);
  log();
  log(`  Core Web Vitals:`);
  log(`    LCP : ${Math.round(psiResult.coreWebVitals.lcp)}ms`);
  log(`    FID : ${Math.round(psiResult.coreWebVitals.fid)}ms`);
  log(`    CLS : ${psiResult.coreWebVitals.cls.toFixed(3)}`);
  log(`    FCP : ${Math.round(psiResult.coreWebVitals.fcp)}ms`);
  log(`    TTFB: ${Math.round(psiResult.coreWebVitals.ttfb)}ms`);
  log(`    TBT : ${Math.round(psiResult.coreWebVitals.tbt)}ms`);
  log();
  if (psiResult.fieldData) {
    log(`  Field Data: ${psiResult.fieldData.overallCategory}`);
  } else {
    log(`  Field Data: (\u4e0d\u53ef\u7528 \u2014 \u6d41\u91cf\u4e0d\u8db3)`);
  }
  log(`  Opportunities: ${psiResult.opportunities.length}`);
  log(`  Diagnostics : ${psiResult.diagnostics.length}`);
  log();

  assert('T7-01 Performance 0-100', psiResult.lighthouseScores.performance >= 0 && psiResult.lighthouseScores.performance <= 100, `${psiResult.lighthouseScores.performance}`);
  assert('T7-02 SEO 0-100', psiResult.lighthouseScores.seo >= 0 && psiResult.lighthouseScores.seo <= 100, `${psiResult.lighthouseScores.seo}`);
  assert('T7-03 LCP >= 0', psiResult.coreWebVitals.lcp >= 0, `${psiResult.coreWebVitals.lcp}`);
  assert('T7-04 CLS >= 0', psiResult.coreWebVitals.cls >= 0, `${psiResult.coreWebVitals.cls}`);
} catch (error) {
  assert('T7-01 Performance 0-100', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T8: SERP Tracker Agent (ValueSERP)
// ==================================================================
section('T8  SERP Tracker Agent (ValueSERP \u5373\u6642\u6392\u540d)');

const serpTracker = new SerpTrackerAgent();
const serpTrackerKeyword = 'Next.js \u6559\u5b78';
log(`  \u95dc\u9375\u5b57: "${serpTrackerKeyword}"  \u8ffd\u8e64: nextjs.org`);
log();

try {
  const serpResult = await timed('T8', () =>
    serpTracker.run(
      { keyword: serpTrackerKeyword, locale: 'zh-TW', trackDomain: 'nextjs.org', numResults: 10 },
      agentCtx,
    )
  );

  log(`  \u641c\u5c0b\u6642\u9593: ${serpResult.searchedAt}`);
  log(`  \u7e3d\u7d50\u679c\u6578: ${serpResult.totalResults}`);
  log();

  log('  Top 5 organic:');
  serpResult.organicResults.slice(0, 5).forEach((r) => {
    log(`    ${r.position}. ${r.title.slice(0, 60)}`);
    log(`       ${r.domain}`);
  });
  log();

  if (serpResult.featuredSnippet) {
    log(`  Featured Snippet: ${serpResult.featuredSnippet.title.slice(0, 60)}`);
  }
  if (serpResult.peopleAlsoAsk?.length) {
    log(`  People Also Ask: ${serpResult.peopleAlsoAsk.slice(0, 3).join(' | ')}`);
  }
  if (serpResult.trackedPosition) {
    const tp = serpResult.trackedPosition;
    log(`  \u8ffd\u8e64 ${tp.domain}: \u4f4d\u7f6e=${tp.position ?? '\u672a\u9032\u524d10'} top10=${tp.inTop10} top3=${tp.inTop3}`);
  }
  log();

  assert('T8-01 organic \u7d50\u679c >= 5', serpResult.organicResults.length >= 5, `got ${serpResult.organicResults.length}`);
  assert('T8-02 \u6bcf\u7b46\u542b title+link', serpResult.organicResults.slice(0, 5).every(r => r.title && r.link), '');
  assert('T8-03 position \u70ba\u6b63\u6574\u6578', serpResult.organicResults.every(r => r.position > 0 && Number.isInteger(r.position)), '');
  assert('T8-04 trackedPosition \u5df2\u56de\u50b3', !!serpResult.trackedPosition, '');
} catch (error) {
  assert('T8-01 organic \u7d50\u679c >= 5', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T9: Schema Agent (Real HTML Structured Data Detection)
// ==================================================================
section('T9  Schema Agent (\u771f\u5be6\u7d50\u69cb\u5316\u8cc7\u6599\u5075\u6e2c)');

const schemaAgent = new SchemaAgent(eventBus);
const schemaTestUrl = 'https://www.google.com';
log(`  URL: ${schemaTestUrl}  \u64cd\u4f5c: detect`);
log();

try {
  const schemaResult = await timed('T9', () =>
    schemaAgent.run(
      { operation: 'detect', url: schemaTestUrl },
      agentCtx,
    )
  );

  log(`  \u5075\u6e2c\u5230 Schema: ${schemaResult.summary.totalSchemasDetected} \u500b`);
  log(`  \u6709\u6548: ${schemaResult.summary.validSchemas}  \u7121\u6548: ${schemaResult.summary.invalidSchemas}`);
  log();

  if (schemaResult.detectedSchemas?.length) {
    schemaResult.detectedSchemas.slice(0, 5).forEach((s, i) => {
      log(`    ${i + 1}. ${s.type} (${s.format}) ${s.isValid ? 'VALID' : 'INVALID'}`);
      if (s.validationErrors.length) log(`       errors: ${s.validationErrors.join(', ')}`);
    });
    log();
  }

  assert('T9-01 detect \u4e0d\u5d29\u6f70', true, `schemas=${schemaResult.summary.totalSchemasDetected}`);
  assert('T9-02 \u56de\u50b3 summary', schemaResult.summary.totalSchemasDetected >= 0, '');
} catch (error) {
  assert('T9-01 detect \u4e0d\u5d29\u6f70', false, String(error).slice(0, 200));
}
log();

// T9 generate test
log('  T9-gen: Schema generate (Article, json-ld)');
try {
  const genResult = await timed('T9-gen', () =>
    schemaAgent.run(
      {
        operation: 'generate',
        schemaType: 'Article',
        outputFormat: 'json-ld',
        data: { headline: 'Test Article', image: 'https://example.com/img.jpg', datePublished: '2024-01-01', author: { '@type': 'Person', name: 'Tester' } },
      },
      agentCtx,
    )
  );

  assert('T9-03 generate \u7522\u51fa code', (genResult.generatedSchema?.code?.length ?? 0) > 10, `len=${genResult.generatedSchema?.code?.length ?? 0}`);
  assert('T9-04 generate isValid', genResult.generatedSchema?.isValid === true, '');
} catch (error) {
  assert('T9-03 generate \u7522\u51fa code', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T10: Technical Auditor (Real PSI + Cheerio)
// ==================================================================
section('T10  Technical Auditor (PSI + Cheerio)');

const techAuditor = new TechnicalAuditorAgent();
const auditUrl = 'https://example.com';
log(`  URL: ${auditUrl}  \u6aa2\u67e5: lighthouse, meta, links`);
log();

try {
  const auditResult = await timed('T10', () =>
    techAuditor.run(
      { url: auditUrl, checks: ['lighthouse', 'meta', 'links'] },
      agentCtx,
    )
  );

  if (auditResult.lighthouseScores) {
    log(`  Lighthouse:`);
    log(`    Performance  : ${auditResult.lighthouseScores.performance}/100`);
    log(`    SEO          : ${auditResult.lighthouseScores.seo}/100`);
    log(`    Accessibility: ${auditResult.lighthouseScores.accessibility}/100`);
    log(`    Best Practices: ${auditResult.lighthouseScores.bestPractices}/100`);
  }
  log(`  CWV: LCP=${Math.round(auditResult.coreWebVitals.lcp ?? 0)}ms FID=${Math.round(auditResult.coreWebVitals.fid ?? 0)}ms CLS=${(auditResult.coreWebVitals.cls ?? 0).toFixed(3)}`);
  log(`  Issues: ${auditResult.summary.totalIssues} (critical=${auditResult.summary.criticalCount} warning=${auditResult.summary.warningCount} info=${auditResult.summary.infoCount})`);
  log(`  Broken Links: ${auditResult.brokenLinks.length}`);
  log(`  Missing Meta: ${auditResult.missingMetaTags.length > 0 ? auditResult.missingMetaTags.join(', ') : '(none)'}`);
  log();

  if (auditResult.issues.length > 0) {
    log('  Issues (top 5):');
    auditResult.issues.slice(0, 5).forEach((iss) => {
      log(`    [${iss.severity}] ${iss.title}`);
    });
    log();
  }

  assert('T10-01 audit \u4e0d\u5d29\u6f70', true, '');
  assert('T10-02 lighthouseScores \u5df2\u56de\u50b3', !!auditResult.lighthouseScores, '');
  assert('T10-03 CWV LCP >= 0', (auditResult.coreWebVitals.lcp ?? 0) >= 0, `lcp=${auditResult.coreWebVitals.lcp}`);
  assert('T10-04 meta \u6aa2\u67e5\u5df2\u57f7\u884c', Array.isArray(auditResult.missingMetaTags), '');
} catch (error) {
  assert('T10-01 audit \u4e0d\u5d29\u6f70', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T11: Web Crawler Plugin (Real Crawl)
// ==================================================================
section('T11  Web Crawler (\u771f\u5be6\u722c\u53d6)');

const crawlTarget = 'https://example.com';
log(`  \u76ee\u6a19: ${crawlTarget}  maxPages=3  maxDepth=1`);
log();

try {
  const crawlResult = await timed('T11', () =>
    webCrawlerTool.execute({ url: crawlTarget, maxPages: 3, maxDepth: 1, delayMs: 100 }, ctx)
  );

  log(`  Pages: ${crawlResult.stats.totalPages}`);
  log(`  Internal links: ${crawlResult.stats.totalInternalLinks}`);
  log(`  External links: ${crawlResult.stats.totalExternalLinks}`);
  log(`  Errors: ${crawlResult.errors.length}`);
  log(`  Duration: ${crawlResult.stats.durationMs}ms`);
  log();

  crawlResult.pages.slice(0, 3).forEach((p, i) => {
    log(`    ${i + 1}. ${p.url}`);
    log(`       title="${p.title.slice(0, 50)}" words=${p.wordCount} h1=${p.h1.length} jsonLd=${p.jsonLdSchemas.length}`);
  });
  log();

  assert('T11-01 crawl >= 1 page', crawlResult.pages.length >= 1, `got ${crawlResult.pages.length}`);
  assert('T11-02 page \u542b title', crawlResult.pages.every(p => typeof p.title === 'string'), '');
  assert('T11-03 page \u542b wordCount', crawlResult.pages.every(p => typeof p.wordCount === 'number'), '');
  assert('T11-04 stats \u5b8c\u6574', crawlResult.stats.totalPages >= 1 && crawlResult.stats.durationMs > 0, '');
} catch (error) {
  assert('T11-01 crawl >= 1 page', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T12: SEMrush Domain Analytics
// ==================================================================
section('T12  SEMrush Domain Analytics');

const domainTarget = 'google.com';
log(`  Domain: ${domainTarget}`);
log();

try {
  const overview = await timed('T12-overview', () =>
    semrushDomainOverviewTool.execute({ domain: domainTarget, database: 'tw' }, ctx)
  );

  log(`  Domain Overview:`);
  log(`    Organic Keywords: ${overview.organicKeywords.toLocaleString()}`);
  log(`    Organic Traffic : ${overview.organicTraffic.toLocaleString()}`);
  log(`    Organic Cost    : $${overview.organicCost.toLocaleString()}`);
  log(`    Paid Keywords   : ${overview.paidKeywords.toLocaleString()}`);
  log(`    Paid Traffic    : ${overview.paidTraffic.toLocaleString()}`);
  log();

  assert('T12-01 organicKeywords >= 0', overview.organicKeywords >= 0, `got ${overview.organicKeywords}`);
  assert('T12-02 organicTraffic >= 0', overview.organicTraffic >= 0, `got ${overview.organicTraffic}`);
} catch (error) {
  assert('T12-01 organicKeywords >= 0', false, String(error).slice(0, 200));
}

try {
  const organic = await timed('T12-organic', () =>
    semrushDomainOrganicTool.execute({ domain: domainTarget, database: 'tw', limit: 5 }, ctx)
  );

  log(`  Top Organic Keywords:`);
  organic.keywords.slice(0, 5).forEach((k, i) => {
    log(`    ${i + 1}. "${k.keyword}" pos=${k.position} vol=${k.searchVolume} traffic=${k.traffic}`);
  });
  log();

  assert('T12-03 domain_organic \u56de\u50b3 >= 1', organic.keywords.length >= 1, `got ${organic.keywords.length}`);
  assert('T12-04 keyword \u542b position', organic.keywords.every(k => k.position > 0), '');
} catch (error) {
  assert('T12-03 domain_organic \u56de\u50b3 >= 1', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T13: Multi-Agent Workflow (Keyword Researcher → Content Writer)
// ==================================================================
section('T13  Multi-Agent \u5de5\u4f5c\u6d41\u5354\u4f5c (Keyword Researcher \u2192 Content Writer)');

const workflowSeed = 'Next.js \u6027\u80fd\u4f18\u5316';
log(`  Seed: "${workflowSeed}"`);
log();

try {
  const eventsBefore = eventBusRaw.getEvents().length;

  const workflowResult = await timed('T13', async () => {
    const kw = await keywordAgent.run(
      { seedKeyword: workflowSeed, locale: 'zh-TW', country: 'tw', maxKeywords: 30 },
      agentCtx,
    );

    const workflowKeywords = kw.keywords.slice(0, 5);
    const content = await contentAgent.run(
      {
        topic: `${workflowSeed}\u6700\u4f73\u5be6\u8df5`,
        keywords: workflowKeywords,
        tone: 'professional',
        format: 'blog',
        targetWordCount: 1200,
      },
      agentCtx,
    );

    return { kw, workflowKeywords, content };
  });

  log(`  Keywords: ${workflowResult.workflowKeywords.join(', ')}`);
  log(`  Content title: ${workflowResult.content.title}`);
  log(`  WordCount: ${workflowResult.content.totalWordCount}`);
  log();

  assert('T13-01 \u5de5\u4f5c\u6d41\u5b8c\u6574\u57f7\u884c', true, '');
  assert('T13-02 \u95dc\u9375\u5b57\u6709\u50b3\u905e\u5230 ContentWriter',
    workflowResult.content.primaryKeyword === (workflowResult.workflowKeywords[0] ?? workflowResult.content.topic),
    `primary=${workflowResult.content.primaryKeyword}`,
  );
  assert('T13-03 \u95dc\u9375\u5b57\u6578\u91cf >= 3', workflowResult.workflowKeywords.length >= 3, `got ${workflowResult.workflowKeywords.length}`);
  assert('T13-04 \u6587\u7ae0\u5b57\u6578 >= 800', workflowResult.content.totalWordCount >= 800, `got ${workflowResult.content.totalWordCount}`);

  const eventsAfter = eventBusRaw.getEvents().length;
  const delta = eventsAfter - eventsBefore;
  const eventTypes = eventBusRaw.getEvents().slice(eventsBefore).map((e: any) => e?.type).filter(Boolean);
  assert('T13-05 EventBus \u6709\u65b0\u4e8b\u4ef6', delta > 0, `delta=${delta}`);
  assert('T13-06 \u542b started/completed \u4e8b\u4ef6',
    eventTypes.includes('agent.task.started') && eventTypes.includes('agent.task.completed'),
    `types=${Array.from(new Set(eventTypes)).join(', ')}`,
  );
} catch (error) {
  assert('T13-01 \u5de5\u4f5c\u6d41\u5b8c\u6574\u57f7\u884c', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T14: Error Handling & Recovery
// ==================================================================
section('T14  \u932f\u8aa4\u8655\u7406\u8207\u6062\u5fa9 (Error Handling & Recovery)');

// T14-01: ContentWriter invalid input
try {
  await timed('T14-01', () =>
    contentAgent.run(
      { topic: '', keywords: [], tone: 'professional', format: 'blog', targetWordCount: 300 },
      agentCtx,
    )
  );
  assert('T14-01 \u7a7a topic \u61c9\u62cb\u932f', false, 'did not throw');
} catch {
  assert('T14-01 \u7a7a topic \u61c9\u62cb\u932f', true, '');
}

// T14-02: SERP tracker invalid input
try {
  await timed('T14-02', () => serpTracker.run({ keyword: '' as any }, agentCtx));
  assert('T14-02 \u7a7a keyword \u61c9\u62cb\u932f', false, 'did not throw');
} catch {
  assert('T14-02 \u7a7a keyword \u61c9\u62cb\u932f', true, '');
}

// T14-03: Recovery — after failures, tools still work
try {
  const r = await timed('T14-03', () => semrushKeywordMetricsTool.execute({ keywords: ['Next.js'], database: 'tw' }, ctx));
  assert('T14-03 \u932f\u8aa4\u5f8c\u4ecd\u53ef\u7e7c\u7e8c\u57f7\u884c', Array.isArray(r.metrics), `metrics=${r.metrics.length}`);
} catch (error) {
  assert('T14-03 \u932f\u8aa4\u5f8c\u4ecd\u53ef\u7e7c\u7e8c\u57f7\u884c', false, String(error).slice(0, 200));
}

// Verify failure events were published
try {
  const recentTypes = eventBusRaw.getEvents().slice(-10).map((e: any) => e?.type).filter(Boolean);
  assert('T14-04 \u5931\u6557\u4e8b\u4ef6\u5df2\u767c\u4f48', recentTypes.includes('agent.task.failed'), `types=${Array.from(new Set(recentTypes)).join(', ')}`);
} catch (error) {
  assert('T14-04 \u5931\u6557\u4e8b\u4ef6\u5df2\u767c\u4f48', false, String(error).slice(0, 120));
}

log();

// ==================================================================
// T15: Orchestrator Multi-task Collaboration (BullMQ + Redis)
// ==================================================================
section('T15  Orchestrator \u591a\u5de5\u5354\u4f5c (BullMQ Flow + Redis)');

type T15SleepInput = {
  tenantId: string;
  projectId: string;
  ms: number;
  token: string;
  failOnce?: boolean;
};

type T15SleepOutput = {
  token: string;
  ms: number;
  attempt: number;
};

let t15Active = 0;
let t15MaxActive = 0;
const t15Attempts = new Map<string, number>();

class T15SleepAgent extends BaseAgent<T15SleepInput, T15SleepOutput> {
  readonly id = 'test.sleep';
  readonly description = 'Test agent for orchestrator concurrency/retry validation.';

  protected async execute(input: T15SleepInput, _agentCtx: AgentContext): Promise<T15SleepOutput> {
    t15Active++;
    t15MaxActive = Math.max(t15MaxActive, t15Active);
    try {
      const attempt = (t15Attempts.get(input.token) ?? 0) + 1;
      t15Attempts.set(input.token, attempt);

      if (input.failOnce && attempt === 1) {
        throw new Error(`intentional failOnce token=${input.token}`);
      }

      await new Promise((r) => setTimeout(r, Math.max(0, input.ms)));
      return { token: input.token, ms: input.ms, attempt };
    } finally {
      t15Active--;
    }
  }
}

const redisUrlT15 = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const prefixT15 = `aiseo-fulltest-${Date.now()}`;
log(`  REDIS_URL: ${redisUrlT15}`);
log(`  prefix   : ${prefixT15}`);
log();

try {
  const redis = createRedisConnection({ url: redisUrlT15 });

  await Promise.race([
    redis.ping(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout (2s)')), 2000)),
  ]);
  assert('T15-00 Redis reachable', true, '');

  const redisEventBus = new RedisEventBus({ redis, prefix: prefixT15 });
  const t15Events: any[] = [];
  const sub = redisEventBus.subscribeAll((evt) => t15Events.push(evt));
  await sub.start();

  const agents = new AgentRegistry();
  agents.register(new T15SleepAgent());

  const orchestrator = new OrchestratorEngine({ redis, prefix: prefixT15, agents });
  const workerOrch = orchestrator.createDevWorker('orchestrator', { concurrency: 2 });
  const workerSmart = orchestrator.createDevWorker('smartAgents', { concurrency: 5 });
  const producer = new FlowProducer({ connection: redis, prefix: prefixT15 });

  const buildFlow = (tenantId: string, projectId: string, flowToken: string): FlowJob => {
    const children: FlowJob[] = [];
    for (let i = 0; i < 10; i++) {
      children.push({
        name: 'test.sleep',
        queueName: 'smart-agents',
        data: { tenantId, projectId, ms: 400, token: `${flowToken}-ok-${i}` } satisfies T15SleepInput,
      });
    }

    children.push({
      name: 'test.sleep',
      queueName: 'smart-agents',
      data: { tenantId, projectId, ms: 50, token: `${flowToken}-retry-1`, failOnce: true } satisfies T15SleepInput,
      opts: { attempts: 2 },
    });

    return {
      name: 'test.flow',
      queueName: 'orchestrator',
      data: { tenantId, projectId, token: flowToken },
      children,
    };
  };

  const tenants = [
    { tenantId: 'tenant-A', projectId: 'project-1' },
    { tenantId: 'tenant-B', projectId: 'project-2' },
  ];

  const submitted = await timed('T15', () =>
    Promise.all(tenants.map((t, idx) => producer.add(buildFlow(t.tenantId, t.projectId, `flow-${idx + 1}`)))),
  );

  assert('T15-01 flows submitted', submitted.length === 2, `got ${submitted.length}`);

  await timed('T15-wait', async () => {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const status = await orchestrator.getFlowStatus();
      const inFlight =
        status.orchestrator.waiting + status.orchestrator.active + status.orchestrator.delayed +
        status.smartAgents.waiting + status.smartAgents.active + status.smartAgents.delayed +
        status.autoTasks.waiting + status.autoTasks.active + status.autoTasks.delayed;
      if (inFlight === 0) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('timeout waiting for queues to drain');
  });

  log(`  maxActive (agent): ${t15MaxActive}`);
  log(`  events captured  : ${t15Events.length}`);
  log();

  assert('T15-02 maxActive >= 3 (parallelism)', t15MaxActive >= 3, `maxActive=${t15MaxActive}`);

  const jobEvents = t15Events.filter((e) => e?.payload?.kind === 'job');
  const countA = jobEvents.filter((e) => e?.tenantId === 'tenant-A').length;
  const countB = jobEvents.filter((e) => e?.tenantId === 'tenant-B').length;
  assert('T15-03 events for tenant-A', countA > 0, `count=${countA}`);
  assert('T15-04 events for tenant-B', countB > 0, `count=${countB}`);

  const retryFails = jobEvents.filter(
    (e) => e?.type === 'agent.task.failed' && e?.payload?.jobName === 'test.sleep' && e?.payload?.willRetry === true,
  );
  assert('T15-05 retry emits failed(willRetry=true)', retryFails.length >= 1, `got ${retryFails.length}`);

  const completedRetry = jobEvents.filter(
    (e) => e?.type === 'agent.task.completed' &&
      e?.payload?.jobName === 'test.sleep' &&
      String(e?.payload?.result?.output?.token ?? '').includes('retry-1'),
  );
  assert('T15-06 retry job eventually completed', completedRetry.length >= 1, `got ${completedRetry.length}`);

  // Cleanup
  await sub.stop().catch(() => undefined);
  await producer.close().catch(() => undefined);
  await workerSmart.close().catch(() => undefined);
  await workerOrch.close().catch(() => undefined);
  await orchestrator.close().catch(() => undefined);
  await redis.quit().catch(() => undefined);
} catch (error) {
  assert('T15-00 Redis reachable', false, String(error).slice(0, 200));
}

log();

// ==================================================================
// T16: Google Suggest (no API key needed)
// ==================================================================
section('T16  Google Suggest (自動完成建議)');

const suggestQuery = 'Next.js';
log(`  查詢: "${suggestQuery}"  locale=zh-TW`);
log();

try {
  const suggestResult = await timed('T16', () =>
    googleSuggestTool.execute({ query: suggestQuery, locale: 'zh-TW' }, ctx)
  );

  log(`  建議數量: ${suggestResult.suggestions.length}`);
  suggestResult.suggestions.slice(0, 10).forEach((s, i) => log(`    ${i + 1}. ${s}`));
  log();

  assert('T16-01 回傳 suggestions 陣列', Array.isArray(suggestResult.suggestions), '');
  assert('T16-02 suggestions >= 3', suggestResult.suggestions.length >= 3, `got ${suggestResult.suggestions.length}`);
  assert('T16-03 每項為字串', suggestResult.suggestions.every(s => typeof s === 'string' && s.length > 0), '');
} catch (error) {
  assert('T16-01 回傳 suggestions 陣列', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T17: HTTP Fetch Tool
// ==================================================================
section('T17  HTTP Fetch Tool (沙箱 HTTP 存取)');

const fetchUrl = 'https://example.com';
log(`  URL: ${fetchUrl}`);
log();

try {
  const fetchResult = await timed('T17', () =>
    httpFetchTool.execute({ url: fetchUrl }, ctx)
  );

  log(`  Status: ${fetchResult.status} ${fetchResult.statusText}`);
  log(`  Content-Type: ${fetchResult.contentType}`);
  log(`  Body length: ${fetchResult.text.length} bytes`);
  log();

  assert('T17-01 status 200', fetchResult.status === 200, `${fetchResult.status}`);
  assert('T17-02 ok = true', fetchResult.ok === true, '');
  assert('T17-03 body 含 HTML', fetchResult.text.toLowerCase().includes('<html') || fetchResult.text.toLowerCase().includes('<!doctype'), '');
} catch (error) {
  assert('T17-01 status 200', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T18: Tool Registry Permission Enforcement
// ==================================================================
section('T18  Tool Registry 權限驗證');

try {
  const defaultReg = createDefaultToolRegistry();
  const toolList = defaultReg.list();
  log(`  已註冊工具: ${toolList.length} 個`);
  toolList.forEach(t => log(`    - ${t.id} [${t.permissions.networkAllowlist?.join(', ') ?? 'unrestricted'}]`));
  log();

  assert('T18-01 預設工具 >= 10', toolList.length >= 10, `got ${toolList.length}`);

  // Tool not found
  let notFoundThrown = false;
  try { defaultReg.get('nonexistent-tool-xyz'); } catch { notFoundThrown = true; }
  assert('T18-02 Tool not found 拋錯', notFoundThrown, '');

  // URL allowlist enforcement
  let blockedThrown = false;
  try {
    assertUrlHostAllowed(new URL('https://evil.com'), ['api.semrush.com', 'google.com']);
  } catch { blockedThrown = true; }
  assert('T18-03 URL allowlist 攔截非授權域', blockedThrown, '');

  // Allowed URL passes
  let allowedOk = false;
  try {
    assertUrlHostAllowed(new URL('https://api.semrush.com/endpoint'), ['api.semrush.com', 'google.com']);
    allowedOk = true;
  } catch { /* ignore */ }
  assert('T18-04 授權域通過驗證', allowedOk, '');

  // Allowlist intersection
  const toolPerms = { networkAllowlist: ['api.semrush.com', 'google.com'] };
  const ctxWithPolicy: ToolContext = {
    ...ctx,
    toolPolicy: { networkAllowlist: ['google.com', 'api.openai.com'] },
  };
  const effective = getEffectiveNetworkAllowlist(toolPerms, ctxWithPolicy);
  assert('T18-05 allowlist 交集正確', effective?.length === 1 && effective[0] === 'google.com', `got ${effective?.join(',')}`);
} catch (error) {
  assert('T18-01 預設工具 >= 10', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T19: DAG Parser (YAML workflow DAG parsing + cycle detection)
// ==================================================================
section('T19  DAG 工作流解析器');

// Valid DAG
try {
  const validYaml = `nodes:
  - id: research
    dependsOn: []
  - id: planning
    dependsOn: [research]
  - id: production
    dependsOn: [planning]
  - id: monitoring
    dependsOn: [production]
`;
  const dag = parseDagYaml(validYaml);
  log(`  Valid DAG: ${dag.nodes.length} nodes`);
  dag.nodes.forEach(n => log(`    - ${n.id} → [${(n.dependsOn ?? []).join(', ')}]`));
  log();

  assert('T19-01 有效 DAG 解析正確', dag.nodes.length === 4, `got ${dag.nodes.length}`);
  assert('T19-02 依賴關係正確', dag.nodes[1].dependsOn?.[0] === 'research', `${dag.nodes[1].dependsOn}`);
} catch (error) {
  assert('T19-01 有效 DAG 解析正確', false, String(error).slice(0, 200));
}

// Cycle detection
try {
  const cycleYaml = `nodes:
  - id: a
    dependsOn: [b]
  - id: b
    dependsOn: [c]
  - id: c
    dependsOn: [a]`;
  parseDagYaml(cycleYaml);
  assert('T19-03 循環偵測拋錯', false, 'did not throw');
} catch (error) {
  const isCycleError = String(error).includes('Cycle');
  assert('T19-03 循環偵測拋錯', isCycleError, String(error).slice(0, 100));
}

// Duplicate node
try {
  const dupYaml = `nodes:
  - id: a
  - id: a`;
  parseDagYaml(dupYaml);
  assert('T19-04 重複節點拋錯', false, 'did not throw');
} catch (error) {
  assert('T19-04 重複節點拋錯', String(error).includes('Duplicate'), String(error).slice(0, 100));
}

// Missing dependency
try {
  const missingYaml = `nodes:
  - id: a
    dependsOn: [nonexistent]`;
  parseDagYaml(missingYaml);
  assert('T19-05 缺失依賴拋錯', false, 'did not throw');
} catch (error) {
  assert('T19-05 缺失依賴拋錯', String(error).includes('Missing') || String(error).includes('not found'), String(error).slice(0, 100));
}
log();

// ==================================================================
// T20: Agent Workspace Isolation
// ==================================================================
section('T20  Agent Workspace 隔離');

try {
  const ws = await createIsolatedWorkspace({ agentId: 'test-agent', runId: 'test-run-001' });
  log(`  Path: ${ws.path}`);
  log(`  Agent: ${ws.agentId}  Run: ${ws.runId}`);
  log();

  const wsExists = existsSync(ws.path);
  assert('T20-01 工作空間已建立', wsExists, ws.path);
  assert('T20-02 agentId 正確', ws.agentId === 'test-agent', '');
  assert('T20-03 runId 正確', ws.runId === 'test-run-001', '');

  await ws.cleanup();
  const existsAfterCleanup = existsSync(ws.path);
  assert('T20-04 cleanup 已移除目錄', !existsAfterCleanup, '');
} catch (error) {
  assert('T20-01 工作空間已建立', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T21: Workflow Definitions (4 predefined workflows + registry)
// ==================================================================
section('T21  Workflow 定義驗證');

const wfQueueNames = { orchestrator: 'orchestrator', smartAgents: 'smart-agents', autoTasks: 'auto-tasks' };
const wfInput: StartFlowInput = {
  tenantId: 'test-tenant',
  projectId: 'test-project',
  seedKeyword: 'SEO 優化',
  competitorUrls: ['https://competitor.example.com'],
  expectedNAP: { name: 'Test Biz', address: '123 Test St', phone: '123-456-7890' },
  location: 'Taipei',
};

try {
  const seoFlow = createSeoContentPipelineFlow(wfInput, wfQueueNames);
  log(`  SEO Content Pipeline: name="${seoFlow.name}" children=${seoFlow.children?.length ?? 0}`);
  assert('T21-01 SEO Pipeline 含子任務', !!seoFlow.name && (seoFlow.children?.length ?? 0) > 0, `children=${seoFlow.children?.length}`);
} catch (error) {
  assert('T21-01 SEO Pipeline 含子任務', false, String(error).slice(0, 200));
}

try {
  const monFlow = createMonitoringFlow(wfInput, wfQueueNames);
  log(`  Monitoring Pipeline: name="${monFlow.name}" children=${monFlow.children?.length ?? 0}`);
  assert('T21-02 Monitoring Flow 含子任務', !!monFlow.name && (monFlow.children?.length ?? 0) > 0, `children=${monFlow.children?.length}`);
} catch (error) {
  assert('T21-02 Monitoring Flow 含子任務', false, String(error).slice(0, 200));
}

try {
  const auditFlow = createAuditFlow(wfInput, wfQueueNames);
  log(`  Comprehensive Audit: name="${auditFlow.name}" children=${auditFlow.children?.length ?? 0}`);
  assert('T21-03 Audit Flow 含子任務', !!auditFlow.name && (auditFlow.children?.length ?? 0) > 0, `children=${auditFlow.children?.length}`);
} catch (error) {
  assert('T21-03 Audit Flow 含子任務', false, String(error).slice(0, 200));
}

try {
  const localFlow = createLocalSeoFlow(wfInput, wfQueueNames);
  log(`  Local SEO: name="${localFlow.name}" children=${localFlow.children?.length ?? 0}`);
  assert('T21-04 Local SEO Flow 含子任務', !!localFlow.name && (localFlow.children?.length ?? 0) > 0, `children=${localFlow.children?.length}`);
} catch (error) {
  assert('T21-04 Local SEO Flow 含子任務', false, String(error).slice(0, 200));
}

try {
  const wfDef = getWorkflowDefinition('seo-content-pipeline');
  assert('T21-05 getWorkflowDefinition 回傳定義', !!wfDef && !!wfDef.name, `name=${wfDef?.name}`);

  const invalidWf = getWorkflowDefinition('nonexistent-workflow');
  assert('T21-06 不存在的 workflow 回傳 null', invalidWf === null, `got ${invalidWf}`);
} catch (error) {
  assert('T21-05 getWorkflowDefinition 回傳定義', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T22: CompetitorMonitor Agent
// ==================================================================
section('T22  CompetitorMonitor Agent (競爭分析)');

const compAgent = new CompetitorMonitorAgent();
const compDomain = 'shopify.com';
const ownDomain = 'woocommerce.com';
log(`  競爭對手: ${compDomain}  自己: ${ownDomain}`);
log();

try {
  const compResult = await timed('T22', () =>
    compAgent.run(
      { competitorDomain: compDomain, ownDomain, analysisType: ['keywords', 'traffic'] },
      agentCtx,
    )
  );

  log(`  分析時間: ${compResult.analyzedAt}`);
  log(`  Keyword Gaps: ${compResult.keywordGaps?.length ?? 0}`);
  log(`  建議: ${compResult.recommendations?.length ?? 0}`);
  if (compResult.trafficEstimate) {
    log(`  Organic Traffic: ${compResult.trafficEstimate.organicTraffic.toLocaleString()}`);
  }
  log();

  assert('T22-01 分析完成', !!compResult.analyzedAt, '');
  assert('T22-02 含建議或分析結果',
    (compResult.recommendations?.length ?? 0) > 0 || (compResult.keywordGaps?.length ?? 0) > 0,
    `recommendations=${compResult.recommendations?.length} gaps=${compResult.keywordGaps?.length}`);
} catch (error) {
  assert('T22-01 分析完成', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T23: InternalLinker Agent
// ==================================================================
section('T23  InternalLinker Agent (內部連結分析)');

const linkerAgent = new InternalLinkerAgent(eventBus);
const linkerUrl = 'https://example.com';
log(`  URL: ${linkerUrl}  操作: analyze  maxPages=3`);
log();

try {
  const linkResult = await timed('T23', () =>
    linkerAgent.run(
      { operation: 'analyze', siteUrl: linkerUrl, maxDepth: 1, maxPages: 3 },
      agentCtx,
    )
  );

  log(`  Pages: ${linkResult.crawlSummary.totalPages}`);
  log(`  Internal Links: ${linkResult.crawlSummary.totalInternalLinks}`);
  log(`  Orphan Pages: ${linkResult.crawlSummary.orphanPages}`);
  log(`  Duration: ${linkResult.crawlSummary.crawlDuration}ms`);
  log();

  assert('T23-01 crawl 完成', linkResult.crawlSummary.totalPages >= 1, `pages=${linkResult.crawlSummary.totalPages}`);
  assert('T23-02 crawlSummary 完整', typeof linkResult.crawlSummary.avgLinksPerPage === 'number', '');
} catch (error) {
  assert('T23-01 crawl 完成', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T24: ContentRefresher Agent
// ==================================================================
section('T24  ContentRefresher Agent (內容新鮮度)');

const refresherAgent = new ContentRefresherAgent(eventBus);
const refreshUrl = 'https://example.com';
log(`  URL: ${refreshUrl}  操作: check  staleThreshold=90 days`);
log();

try {
  const refreshResult = await timed('T24', () =>
    refresherAgent.run(
      { operation: 'check', urls: [refreshUrl], staleThresholdDays: 90 },
      agentCtx,
    )
  );

  log(`  Total Pages: ${refreshResult.summary.totalPages}`);
  log(`  Fresh: ${refreshResult.summary.freshPages}  Stale: ${refreshResult.summary.stalePages}`);
  log(`  High Priority: ${refreshResult.summary.highPriorityUpdates}`);
  log();

  assert('T24-01 check 完成', typeof refreshResult.summary.totalPages === 'number', '');
  assert('T24-02 summary 完整', 'freshPages' in refreshResult.summary && 'stalePages' in refreshResult.summary, '');
} catch (error) {
  assert('T24-01 check 完成', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T25: CronScheduler (Redis, env-gated)
// ==================================================================
section('T25  CronScheduler 排程管理 (Redis)');

const redisUrlScheduler = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
try {
  const redisSched = createRedisConnection({ url: redisUrlScheduler });
  await Promise.race([
    redisSched.ping(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('ping timeout (2s)')), 2000)),
  ]);

  const prefixSched = `aiseo-sched-test-${Date.now()}`;
  const scheduler = new CronScheduler({ redis: redisSched, prefix: prefixSched });

  // Upsert
  await scheduler.upsertSchedule({
    id: 'test-sched-1',
    cron: '0 9 * * 1',
    timezone: 'Asia/Taipei',
    flowName: 'seo-content-pipeline',
    input: { tenantId: 'test-tenant', projectId: 'test-project', seedKeyword: 'test keyword' },
    enabled: true,
  });

  const list = await scheduler.listSchedules();
  log(`  排程數量: ${list.length}`);
  list.forEach(s => log(`    - id=${s.id ?? 'N/A'} pattern=${s.pattern} tz=${s.tz}`));
  log();

  assert('T25-01 排程已建立', list.length >= 1, `got ${list.length}`);
  assert('T25-02 排程含 cron pattern', list.some(s => s.pattern === '0 9 * * 1'), `patterns=${list.map(s => s.pattern).join(',')}`);

  // Remove
  await scheduler.removeSchedule('test-sched-1');
  const listAfter = await scheduler.listSchedules();
  assert('T25-03 排程已刪除', listAfter.length === 0, `got ${listAfter.length}`);

  await scheduler.close();
  await redisSched.quit().catch(() => undefined);
} catch (error) {
  assert('T25-01 排程已建立', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// T26: EventBus Multi-Tenant Channel Isolation (Redis)
// ==================================================================
section('T26  EventBus 多租戶隔離 (Redis Pub/Sub)');

try {
  const redisEvt = createRedisConnection({ url: redisUrlScheduler });
  await Promise.race([
    redisEvt.ping(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('ping timeout (2s)')), 2000)),
  ]);

  const prefixEvt = `aiseo-evt-test-${Date.now()}`;
  const bus = new RedisEventBus({ redis: redisEvt, prefix: prefixEvt });

  const evtA: unknown[] = [];
  const evtB: unknown[] = [];
  const evtAll: unknown[] = [];

  const subA = bus.subscribe('tenant-A', (e) => evtA.push(e));
  const subB = bus.subscribe('tenant-B', (e) => evtB.push(e));
  const subAll = bus.subscribeAll((e) => evtAll.push(e));

  await subA.start();
  await subB.start();
  await subAll.start();

  // Wait for subscriptions to settle
  await new Promise(r => setTimeout(r, 300));

  await bus.publish({ type: 'system.test', tenantId: 'tenant-A', payload: { msg: 'hello-A' } } as any);
  await bus.publish({ type: 'system.test', tenantId: 'tenant-B', payload: { msg: 'hello-B' } } as any);

  // Allow messages to propagate
  await new Promise(r => setTimeout(r, 600));

  log(`  tenant-A events: ${evtA.length}`);
  log(`  tenant-B events: ${evtB.length}`);
  log(`  subscribeAll events: ${evtAll.length}`);
  log();

  assert('T26-01 tenant-A 收到自己的事件', evtA.length >= 1, `got ${evtA.length}`);
  assert('T26-02 tenant-B 收到自己的事件', evtB.length >= 1, `got ${evtB.length}`);
  assert('T26-03 tenant-A 未收到 tenant-B 事件',
    evtA.every((e: any) => e?.tenantId !== 'tenant-B'),
    '',
  );
  assert('T26-04 subscribeAll 收全部', evtAll.length >= 2, `got ${evtAll.length}`);

  await subA.stop().catch(() => undefined);
  await subB.stop().catch(() => undefined);
  await subAll.stop().catch(() => undefined);
  await redisEvt.quit().catch(() => undefined);
} catch (error) {
  assert('T26-01 tenant-A 收到自己的事件', false, String(error).slice(0, 200));
}
log();

// ==================================================================
// Summary + Log Output
// ==================================================================
const totalDuration = Date.now() - globalStart;
const passCount = assertions.filter((a) => a.pass).length;
const failCount = assertions.filter((a) => !a.pass).length;

log();
log('================================================================');
log('  測試總結');
log('================================================================');
log();

// Coverage map
log('  測試覆蓋範圍:');
log('    ┌─────────────────────────────────────────────────────────┐');
log('    │ Layer              │ Sections                           │');
log('    ├─────────────────────────────────────────────────────────┤');
log('    │ 外部工具/API       │ T1 T3 T7 T11 T12 T16 T17          │');
log('    │ AI Agent (5+3)     │ T4 T5 T8 T9 T10 T22 T23 T24       │');
log('    │ 工作流引擎         │ T15 T19 T21                        │');
log('    │ 排程系統           │ T25                                │');
log('    │ 事件匯流排         │ T13 T26                            │');
log('    │ 基礎設施           │ T18 T20                            │');
log('    │ NLP / LLM          │ T2                                 │');
log('    │ 多工 / 併發        │ T15                                │');
log('    │ 錯誤復原           │ T6 T14                             │');
log('    └─────────────────────────────────────────────────────────┘');
log();

// Timing
log('  耗時摘要:');
for (const [label, ms] of Object.entries(durations)) {
  log(`    ${label.padEnd(14)} ${(ms / 1000).toFixed(1)}s`);
}
log(`    ${'TOTAL'.padEnd(14)} ${(totalDuration / 1000).toFixed(1)}s`);
log();

// Assertion table
log(`  斷言結果: ${passCount} PASS / ${failCount} FAIL / ${assertions.length} TOTAL`);
log();
assertions.forEach((a) => {
  log(`    ${a.pass ? 'PASS' : 'FAIL'}  ${a.name}${a.detail ? '  (' + a.detail + ')' : ''}`);
});
log();

if (failCount > 0) {
  log('  失敗項目:');
  assertions.filter((a) => !a.pass).forEach((a) => {
    log(`    FAIL  ${a.name}  ${a.detail}`);
  });
  log();
}

// Untested (honest disclosure)
log('  未覆蓋項目 (需獨立伺服器/DB 環境):');
log('    - API HTTP 路由層 (Auth, RBAC, Projects, Content CRUD, Webhooks, Audit)');
log('    - PostgreSQL RLS 多租戶隔離 (需真實 DB)');
log('    - Outbox Dispatcher (需 DB + polling)');
log('    - Quota System / Usage Metering (需 DB)');
log('    - Backup/Restore (需 pg_dump + S3/MinIO)');
log('    - BacklinkBuilderAgent (需 Ahrefs API Key)');
log('    - ReportGeneratorAgent (需 GA4/GSC 整合)');
log('    - LocalSeoAgent (需 GMB 整合)');
log('    - Docker Sandbox (需 Docker daemon)');
log('    - Browser Engine (需 Playwright Chromium)');
log('    - CMS Clients (需 WordPress/Shopify 實例)');
log();

// Cost
log('  月度成本:');
log('    SEMrush      $125/月 (Standard 方案, 關鍵詞指標 + KD + 擴展)');
log('    ValueSERP    $0-10/月 (100 次免費 / 超用付費)');
log('    Ollama LLM   $0/月 (本機 GPU 推理)');
log('    LLM NLP      $0/月 (取代 Google NLP API)');
log('    ──────────────────');
log('    合計          $125-135/月');
log();

// Verdict
if (failCount === 0) {
  log('  結論: ALL PASS — 企業級 SEO 平台所有可測試核心功能驗證通過。');
} else {
  log(`  結論: ${failCount} 項測試失敗，需修復後重測。`);
}

log();
log(`  Log 文字報告: ${logFilePath}`);
log(`  Log JSON 報告: ${jsonFilePath}`);
log();
log('================================================================');
log('  報告結束');
log('================================================================');

// ── Write JSON results ───────────────────────────────────────────
const jsonReport = {
  meta: {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
    coreVersion: CORE_VERSION,
    ollamaModel: process.env.OLLAMA_MODEL || '',
    redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    logFile: logFilePath,
    jsonFile: jsonFilePath,
  },
  summary: {
    totalAssertions: assertions.length,
    passed: passCount,
    failed: failCount,
    totalDurationMs: totalDuration,
    sections: Object.keys(durations).length,
  },
  durations,
  assertions: assertions.map(a => ({ name: a.name, pass: a.pass, detail: a.detail })),
  failedAssertions: assertions.filter(a => !a.pass).map(a => ({ name: a.name, detail: a.detail })),
};

try {
  writeFileSync(jsonFilePath, JSON.stringify(jsonReport, null, 2), 'utf-8');
  console.log(`\nJSON report written to: ${jsonFilePath}`);
} catch (err) {
  console.error(`Failed to write JSON report: ${err}`);
}

console.log(`Text report written to: ${logFilePath}`);
