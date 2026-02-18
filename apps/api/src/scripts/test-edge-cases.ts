/**
 * AISEO — 邊界條件與高 KD 壓力測試
 *
 * 驗證系統在極端輸入下的穩健度與輸出品質：
 *
 *   EC1  高競爭關鍵字 (KD > 70)     ContentWriter 仍能產出 >= 800 字且 SEO >= 50
 *   EC2  長尾關鍵字 (>5 詞)         KeywordResearcher 正常展開不崩潰
 *   EC3  超長關鍵字 (>80 字元)      系統截斷/容錯，不拋出未捕捉例外
 *   EC4  特殊字元關鍵字             HTML 特殊字元 / 表情符號 不崩潰
 *   EC5  重複關鍵字列表             去重後正常生成
 *   EC6  空 / 極短關鍵字            優雅處理 (有意義的錯誤或 fallback)
 *   EC7  繁簡混用輸入               系統以正體字回應 (zh-TW 優先)
 *   EC8  KD=90+ 極高競爭            ContentWriter 生成 >= 600 字（不崩潰）
 *   EC9  關鍵字意圖衝突偵測         不同 intent 的相似關鍵字應分群
 *   EC10 純英文關鍵字               可正常生成繁中內容
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
config({ path: resolve(__dirname, '../../../../.env') });

import {
  createDefaultToolRegistry,
  ContentWriterAgent,
  KeywordResearcherAgent,
  type AgentContext,
} from '@aiseo/core';

// ── Output infra ────────────────────────────────────────────────
const logDir = resolve(__dirname, '../../../../test-results');
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logFilePath = resolve(logDir, `edge-cases-${ts}.log`);
const jsonFilePath = resolve(logDir, `edge-cases-${ts}.json`);

const logLines: string[] = [];
function log(msg = '') { console.log(msg); logLines.push(msg); appendFileSync(logFilePath, msg + '\n', 'utf8'); }
function section(title: string) { log(); log(`──────────────────────────────────────`); log(`  ${title}`); log(`──────────────────────────────────────`); }

interface Assertion { name: string; pass: boolean; detail: string; }
const assertions: Assertion[] = [];
function assert(name: string, pass: boolean, detail = '') {
  assertions.push({ name, pass, detail });
  log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const durations: Record<string, number> = {};
async function timed<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now(); const r = await fn(); durations[key] = Date.now() - t; return r;
}

/** 安全執行：捕捉例外，回傳 null + 錯誤訊息 */
async function safeRun<T>(fn: () => Promise<T>): Promise<{ ok: boolean; result: T | null; error: string }> {
  try { return { ok: true, result: await fn(), error: '' }; }
  catch (e) { return { ok: false, result: null, error: String(e).slice(0, 200) }; }
}

// ── Mock EventBus & context ──────────────────────────────────────
class MockBus {
  options = {} as any; prefix = 'test';
  async publish(e: unknown) { return e; }
  subscribe() { return Promise.resolve({ stop: async () => {} }); }
  subscribeAll() { return Promise.resolve({ stop: async () => {} }); }
  async close() {}
}
const registry = createDefaultToolRegistry();
const eventBus = new MockBus() as any;
const ctx: AgentContext = {
  tenantId: 'edge-test', projectId: 'edge-project', agentId: 'edge-agent',
  workspacePath: '/tmp/edge-test', tools: registry, eventBus,
};

// ── Helpers ──────────────────────────────────────────────────────
function hasSimplifiedChinese(text: string): boolean {
  return /[国来时间这个们说么发现实应该为样问题经]/.test(text);
}
function countWords(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (text.replace(/[\u4e00-\u9fff]/g, '').trim().match(/\S+/g) ?? []).length;
  return cjk + latin;
}

const contentAgent = new ContentWriterAgent();
const kwAgent = new KeywordResearcherAgent();

// ==================================================================
log('================================================================');
log('  AISEO — 邊界條件與高 KD 壓力測試');
log('================================================================');
log(`執行時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
log();

// ==================================================================
// EC1: 高競爭關鍵字 (KD > 70) 壓力測試
// ==================================================================
section('EC1  高競爭關鍵字 (KD > 70) 壓力測試');

const highKdKeywords = [
  { topic: 'WordPress 完整教學指南', keywords: ['WordPress 教學', 'WordPress 安裝', 'WordPress SEO'], note: 'KD≈80' },
  { topic: 'Google Analytics 4 使用指南', keywords: ['Google Analytics', 'GA4 教學', '網站分析'], note: 'KD≈75' },
];

for (const kw of highKdKeywords) {
  log(`\n  測試關鍵字: ${kw.keywords[0]} (${kw.note})`);
  const res = await safeRun(() =>
    timed(`ec1-${kw.keywords[0]}`, () =>
      contentAgent.run({ topic: kw.topic, keywords: kw.keywords, targetWordCount: 1000, tone: 'professional', format: 'blog' }, ctx)
    )
  );

  if (!res.ok || !res.result) {
    assert(`EC1-01 [${kw.note}] 不崩潰`, false, res.error);
    assert(`EC1-02 [${kw.note}] 字數 >= 800`, false, '跳過(上方失敗)');
    assert(`EC1-03 [${kw.note}] SEO Score >= 50`, false, '跳過(上方失敗)');
  } else {
    const r = res.result;
    log(`  結果: ${r.totalWordCount} 字, SEO=${r.seoScore}, Readability=${r.readabilityScore}`);
    assert(`EC1-01 [${kw.note}] 不崩潰`, true, '');
    assert(`EC1-02 [${kw.note}] 字數 >= 800`, r.totalWordCount >= 800, `got ${r.totalWordCount}`);
    assert(`EC1-03 [${kw.note}] SEO Score >= 50`, r.seoScore >= 50, `got ${r.seoScore}`);
  }
}

// ==================================================================
// EC2: 長尾關鍵字 (>5 詞) 展開測試
// ==================================================================
section('EC2  長尾關鍵字 (>5 詞) 展開測試');

const longTailKws = ['如何用 AI 工具優化電商網站 SEO 排名', '小型企業如何在 Google 第一頁獲得免費流量'];

for (const kw of longTailKws) {
  log(`\n  長尾關鍵字: "${kw}" (${kw.split(/\s+/).length} 詞)`);
  const res = await safeRun(() =>
    timed(`ec2-longtail`, () =>
      kwAgent.run({ seedKeyword: kw, maxKeywords: 10 }, ctx)
    )
  );

  if (!res.ok || !res.result) {
    assert(`EC2-01 長尾展開不崩潰 [${kw.slice(0, 15)}...]`, false, res.error);
    assert(`EC2-02 回傳 >= 3 個相關詞`, false, '跳過');
  } else {
    const r = res.result;
    const kwCount = (r.keywords ?? []).length;
    log(`  回傳關鍵字: ${kwCount} 個`);
    (r.keywords ?? []).slice(0, 5).forEach((k: any) => log(`    - ${k.keyword ?? k} (vol=${k.volume ?? 'N/A'})`));
    assert(`EC2-01 長尾展開不崩潰 [${kw.slice(0, 15)}...]`, true, '');
    assert(`EC2-02 回傳 >= 3 個相關詞 [${kw.slice(0, 15)}...]`, kwCount >= 3, `got ${kwCount}`);
    // 長尾詞應包含原詞的核心詞彙
    const allKwTexts = (r.keywords ?? []).map((k: any) => (k.keyword ?? String(k)).toLowerCase());
    const hasCoreWord = allKwTexts.some((t: string) => t.includes('seo') || t.includes('網站') || t.includes('優化') || t.includes('google') || t.includes('流量') || t.includes('google'));
    assert(`EC2-03 展開詞包含核心語意 [${kw.slice(0, 15)}...]`, hasCoreWord, '');
  }
}

// ==================================================================
// EC3: 超長關鍵字 (>80 字元) 容錯測試
// ==================================================================
section('EC3  超長關鍵字 (>80 字元) 容錯測試');

const ultraLongKw = '如何透過搜尋引擎優化技術結合人工智慧工具在競爭激烈的電子商務市場獲得持續穩定的自然搜尋流量並轉換為實際銷售業績的完整策略指南';
log(`  超長關鍵字 (長度=${ultraLongKw.length}): "${ultraLongKw.slice(0, 40)}..."`);

const ec3Res = await safeRun(() =>
  timed('ec3', () =>
    contentAgent.run({ topic: '電商 SEO 策略', keywords: [ultraLongKw, 'SEO', '電商'], targetWordCount: 800, tone: 'professional', format: 'blog' }, ctx)
  )
);

assert('EC3-01 超長關鍵字不拋出未捕捉例外', ec3Res.ok, ec3Res.error);
if (ec3Res.ok && ec3Res.result) {
  assert('EC3-02 超長 KW 仍生成有效文章 (>= 500 字)', ec3Res.result.totalWordCount >= 500, `got ${ec3Res.result.totalWordCount}`);
}

// ==================================================================
// EC4: 特殊字元關鍵字 (HTML / 表情符號)
// ==================================================================
section('EC4  特殊字元關鍵字容錯測試');

const specialCharCases = [
  { kw: 'SEO & SEM 比較 <2024>', label: 'HTML特殊字元' },
  { kw: '🚀 SEO 優化技巧', label: '表情符號' },
  { kw: 'SQL" OR "1"="1', label: 'SQL注入模式' },
];

for (const { kw, label } of specialCharCases) {
  log(`\n  特殊字元: "${kw}" (${label})`);
  const res = await safeRun(() =>
    timed(`ec4-${label}`, () =>
      contentAgent.run({ topic: 'SEO 完整指南', keywords: [kw, 'SEO'], targetWordCount: 500, tone: 'professional', format: 'blog' }, ctx)
    )
  );
  assert(`EC4-01 [${label}] 不崩潰`, res.ok, res.error.slice(0, 100));
  if (res.ok && res.result) {
    assert(`EC4-02 [${label}] 生成有效標題`, res.result.title.length > 5, `got "${res.result.title}"`);
  }
}

// ==================================================================
// EC5: 重複關鍵字列表
// ==================================================================
section('EC5  重複關鍵字列表去重處理');

const dedupeKws = ['SEO 優化', 'SEO 優化', 'SEO 優化', '搜尋引擎優化', 'SEO 優化'];
log(`  輸入重複關鍵字: [${dedupeKws.join(', ')}]`);

const ec5Res = await safeRun(() =>
  timed('ec5', () =>
    contentAgent.run({ topic: 'SEO 優化指南', keywords: dedupeKws, targetWordCount: 800, tone: 'professional', format: 'blog' }, ctx)
  )
);

assert('EC5-01 重複關鍵字不崩潰', ec5Res.ok, ec5Res.error);
if (ec5Res.ok && ec5Res.result) {
  assert('EC5-02 重複 KW 仍生成有效文章', ec5Res.result.totalWordCount >= 400, `got ${ec5Res.result.totalWordCount}`);
  // 文章不應該有明顯的關鍵字堆砌
  const allText = ec5Res.result.sections.map((s: any) => s.content).join(' ');
  const stuffingCount = (allText.match(/SEO 優化/g) ?? []).length;
  const density = stuffingCount / Math.max(1, countWords(allText)) * 100;
  log(`  關鍵字密度: ${density.toFixed(2)}% (${stuffingCount} 次 / ${countWords(allText)} 字)`);
  assert('EC5-03 去重後無關鍵字堆砌 (密度<5%)', density < 5, `${density.toFixed(2)}%`);
}

// ==================================================================
// EC6: 極短/空關鍵字
// ==================================================================
section('EC6  極短/空關鍵字優雅處理');

const shortKwCases = [
  { kw: 'a', topic: 'SEO 優化', label: '單字元英文' },
  { kw: '的', topic: 'SEO 優化', label: '單虛詞' },
];

for (const { kw, topic, label } of shortKwCases) {
  log(`\n  極短關鍵字: "${kw}" (${label})`);
  const res = await safeRun(() =>
    timed(`ec6-${label}`, () =>
      contentAgent.run({ topic, keywords: [kw, 'SEO'], targetWordCount: 500, tone: 'professional', format: 'blog' }, ctx)
    )
  );
  // 系統應要麼成功生成要麼優雅失敗，不應 crash
  assert(`EC6-01 [${label}] 系統不崩潰（允許優雅降級）`, res.ok, res.error.slice(0, 100));
}

// ==================================================================
// EC7: 繁簡混用輸入 → 輸出應為正體字
// ==================================================================
section('EC7  繁簡混用輸入 → 正體字輸出');

const mixedInput = {
  topic: 'SEO优化完整教学（全面指南）',   // 簡體 + 繁體混用
  keywords: ['SEO优化', 'SEO 優化', '搜索引擎優化', '網站排名'],
  targetWordCount: 800,
  tone: 'professional' as const,
  format: 'blog' as const,
};

log(`  輸入主題: "${mixedInput.topic}" (含簡體字)`);
const ec7Res = await safeRun(() => timed('ec7', () => contentAgent.run(mixedInput, ctx)));

assert('EC7-01 繁簡混用輸入不崩潰', ec7Res.ok, ec7Res.error);
if (ec7Res.ok && ec7Res.result) {
  const ecFullText = ec7Res.result.sections.map((s: any) => s.content).join('');
  const outputHasSimplified = hasSimplifiedChinese(ecFullText);
  log(`  輸出含簡體字: ${outputHasSimplified}`);
  // 理想情況：系統應輸出正體字（此檢查為警告，不強制失敗，因 LLM 行為不確定）
  if (outputHasSimplified) {
    log(`  [WARN] 輸出仍含簡體字，建議加入 system prompt 強制正體字輸出`);
    assert('EC7-02 輸出優先使用正體字', false, '輸出含簡體特徵字');
  } else {
    assert('EC7-02 輸出優先使用正體字', true, '');
  }
  assert('EC7-03 文章字數達標 (>=500)', ec7Res.result.totalWordCount >= 500, `got ${ec7Res.result.totalWordCount}`);
}

// ==================================================================
// EC8: KD=90+ 極高競爭 (電商 SEO 等)
// ==================================================================
section('EC8  KD=90+ 極高競爭關鍵字生成品質');

const ultraHighKd = {
  topic: '電商 SEO 完整策略指南 2024',
  keywords: ['電商 SEO', '電商排名', 'Shopify SEO', 'WooCommerce SEO'],
  targetWordCount: 1200,
  tone: 'professional' as const,
  format: 'blog' as const,
};

log(`  測試最高競爭度場景: 電商 SEO (KD 約 85-95)`);
const ec8Res = await safeRun(() => timed('ec8', () => contentAgent.run(ultraHighKd, ctx)));

assert('EC8-01 極高 KD 關鍵字不崩潰', ec8Res.ok, ec8Res.error);
if (ec8Res.ok && ec8Res.result) {
  const r = ec8Res.result;
  log(`  生成結果: ${r.totalWordCount} 字, SEO=${r.seoScore}`);
  // 高競爭主題仍需達到基本品質門檻
  assert('EC8-02 字數 >= 600', r.totalWordCount >= 600, `got ${r.totalWordCount}`);
  assert('EC8-03 段落數 >= 3', r.sections.length >= 3, `got ${r.sections.length}`);
  assert('EC8-04 SEO Score >= 40', r.seoScore >= 40, `got ${r.seoScore}`);
}

// ==================================================================
// EC9: 關鍵字意圖衝突偵測 (Keyword Cannibalization)
// ==================================================================
section('EC9  近似意圖關鍵字群組化測試');

const cannibaKws = [
  '如何學SEO',        // 資訊型
  'SEO學習課程',      // 商業型（購買意向）
  'SEO是什麼',        // 資訊型
  '最好的SEO工具',    // 商業型
  'SEO工具比較',      // 調查型
];

log(`  測試關鍵字群組 (${cannibaKws.length} 個): ${cannibaKws.join(', ')}`);
const ec9Res = await safeRun(() =>
  timed('ec9', () =>
    kwAgent.run({ seedKeyword: 'SEO', maxKeywords: 15 }, ctx)
  )
);

assert('EC9-01 意圖分析不崩潰', ec9Res.ok, ec9Res.error);
if (ec9Res.ok && ec9Res.result) {
  const r = ec9Res.result;
  const intents = r.intents ?? [];
  log(`  回傳意圖數: ${intents.length}`);
  intents.slice(0, 8).forEach((i: any) => log(`    - intent=${i.intent ?? i} confidence=${i.confidence ?? 'N/A'}`));

  const infoIntents   = intents.filter((i: any) => i.intent === 'informational');
  const bizIntents    = intents.filter((i: any) => i.intent === 'commercial' || i.intent === 'transactional');
  const hasMultipleIntents = infoIntents.length > 0 && bizIntents.length > 0;

  assert('EC9-02 識別到資訊型意圖', infoIntents.length > 0, `got ${infoIntents.length}`);
  assert('EC9-03 識別到商業/交易型意圖', bizIntents.length > 0, `got ${bizIntents.length}`);
  assert('EC9-04 成功區分多種意圖 (Cannibalization 偵測基礎)', hasMultipleIntents,
    `info=${infoIntents.length} commercial/transactional=${bizIntents.length}`);
}

// ==================================================================
// EC10: 純英文關鍵字生成繁中內容
// ==================================================================
section('EC10 純英文關鍵字 → 生成繁體中文內容');

const englishKwConfig = {
  topic: 'SEO Best Practices Guide',
  keywords: ['SEO', 'keyword research', 'backlinks', 'Core Web Vitals'],
  targetWordCount: 800,
  tone: 'professional' as const,
  format: 'blog' as const,
};

log(`  輸入純英文關鍵字: ${englishKwConfig.keywords.join(', ')}`);
const ec10Res = await safeRun(() => timed('ec10', () => contentAgent.run(englishKwConfig, ctx)));

assert('EC10-01 英文關鍵字不崩潰', ec10Res.ok, ec10Res.error);
if (ec10Res.ok && ec10Res.result) {
  const r = ec10Res.result;
  const allText = r.sections.map((s: any) => s.content).join('');
  const cjkRatio = (allText.match(/[\u4e00-\u9fff]/g) ?? []).length / Math.max(1, allText.length);

  log(`  CJK (中文) 字比例: ${(cjkRatio * 100).toFixed(1)}%`);
  log(`  標題: "${r.title}"`);
  // 標題或內容應含有一定比例的中文（系統是中文 SEO 工具）
  assert('EC10-02 英文 KW 不影響正體中文輸出', cjkRatio > 0.3, `CJK ratio=${(cjkRatio * 100).toFixed(1)}%`);
  assert('EC10-03 英文 KW 仍達字數門檻', r.totalWordCount >= 400, `got ${r.totalWordCount}`);
}

// ==================================================================
// 最終報告
// ==================================================================
const passed = assertions.filter(a => a.pass).length;
const failed  = assertions.filter(a => !a.pass).length;
const total   = assertions.length;

section('邊界條件測試總結');
log(`  總斷言: ${total}    通過: ${passed}    失敗: ${failed}`);
log(`  通過率: ${((passed / total) * 100).toFixed(1)}%`);
log();

if (failed > 0) {
  log('  ❌ 失敗項目:');
  assertions.filter(a => !a.pass).forEach(a => log(`    - ${a.name}: ${a.detail}`));
  log();
}

// 每個測試場景的通過情況
const scenarios = ['EC1', 'EC2', 'EC3', 'EC4', 'EC5', 'EC6', 'EC7', 'EC8', 'EC9', 'EC10'];
log('  場景結果一覽:');
for (const sc of scenarios) {
  const scAsserts = assertions.filter(a => a.name.startsWith(sc));
  const scPass = scAsserts.filter(a => a.pass).length;
  const scIcon = scPass === scAsserts.length ? '✓' : scPass > 0 ? '△' : '✗';
  const labels: Record<string, string> = {
    EC1: '高KD>70壓力', EC2: '長尾關鍵字', EC3: '超長關鍵字', EC4: '特殊字元',
    EC5: '重複KW去重', EC6: '極短KW',     EC7: '繁簡混用', EC8: 'KD=90+極高競爭',
    EC9: '意圖衝突偵測', EC10: '英文KW→繁中輸出',
  };
  log(`    ${scIcon} ${sc} ${(labels[sc] ?? sc).padEnd(14)} ${scPass}/${scAsserts.length}`);
}
log();

const report = {
  meta: { timestamp: new Date().toISOString(), nodeVersion: process.version },
  summary: { total, passed, failed, passRate: `${((passed / total) * 100).toFixed(1)}%`, durations },
  assertions,
};
writeFileSync(jsonFilePath, JSON.stringify(report, null, 2), 'utf8');
log(`  JSON 報告: ${jsonFilePath}`);
log(`  總執行時間: ${((Object.values(durations).reduce((a, b) => a + b, 0)) / 1000).toFixed(1)}s`);
log();
