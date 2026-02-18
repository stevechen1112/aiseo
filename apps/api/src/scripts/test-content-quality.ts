/**
 * AISEO — 內容品質深度審核測試
 *
 * 超越「字數達標、SEO 分數」的表面驗證，從 SEO 專業角度深度審查：
 *
 *   Q1  標題標籤品質  — 長度、關鍵字位置、語意強度
 *   Q2  標題層級結構  — H1 唯一性、H2/H3 層級邏輯
 *   Q3  關鍵字密度與分佈 — 主詞密度、自然分佈（前/中/後三段）
 *   Q4  Meta Description — 長度、CTA 含量、關鍵字出現
 *   Q5  E-E-A-T 信號    — 數字/統計/引用/作者資訊指標
 *   Q6  語意關聯度      — LSI 詞彙覆蓋率（與主題相關的變體詞）
 *   Q7  可讀性          — 句子長度分佈、段落密度
 *   Q8  重複性偵測      — 同主題兩篇文章的相似度（防止 Cannibalization）
 *   Q9  Schema 完整性   — Article Schema 必填欄位驗證
 *   Q10 繁簡一致性      — 正體字 / 簡體字混用偵測
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const envPath = resolve(__dirname, '../../../../.env');
config({ path: envPath });

import {
  createDefaultToolRegistry,
  ContentWriterAgent,
  SchemaAgent,
  type AgentContext,
} from '@aiseo/core';

// ── Output infra (same pattern as full-integration-test) ─────────
const logDir = resolve(__dirname, '../../../../test-results');
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logFilePath = resolve(logDir, `content-quality-${ts}.log`);
const jsonFilePath = resolve(logDir, `content-quality-${ts}.json`);

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

// ── Mock EventBus & context ───────────────────────────────────────
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
  tenantId: 'quality-test',
  projectId: 'quality-project',
  agentId: 'quality-agent',
  workspacePath: '/tmp/quality-test',
  tools: registry,
  eventBus,
};

// ── Helpers ───────────────────────────────────────────────────────
/** CJK-aware 詞數：中文字每字計1詞，英文以空白分詞 */
function countWords(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length;
  const latin = (text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, '').trim().match(/\S+/g) ?? []).length;
  return cjk + latin;
}

/** 計算關鍵字在文本中的出現次數 */
function countOccurrences(text: string, keyword: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(escaped, 'gi')) ?? []).length;
}

/** 偵測文本是否含有簡體字特徵詞 */
function hasSimplifiedChinese(text: string): boolean {
  // 常見簡繁差異字形抽樣
  const simplified = /[国来时间这个们说么发现实应该为样问题经体现]/;
  return simplified.test(text);
}

/** 計算兩段文本的 Jaccard 相似度 (set of trigrams) */
function jaccardSimilarity(a: string, b: string): number {
  const trigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const sa = trigrams(a);
  const sb = trigrams(b);
  let intersection = 0;
  for (const g of sa) if (sb.has(g)) intersection++;
  return intersection / (sa.size + sb.size - intersection);
}

/** 粗估句子列表（中文用句號/問號/驚嘆號切割） */
function splitSentences(text: string): string[] {
  return text.split(/[。！？!?]/).map(s => s.trim()).filter(s => s.length > 0);
}

// ── Schema.org Article 必填欄位 ───────────────────────────────────
const REQUIRED_SCHEMA_FIELDS = ['@context', '@type', 'headline', 'author', 'datePublished', 'description'];


// ==================================================================
// 主程式
// ==================================================================
log('================================================================');
log('  AISEO — 內容品質深度審核測試');
log('================================================================');
log(`執行時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
log(`Log: ${logFilePath}`);
log();

// ==================================================================
// Q1-Q10: 生成兩篇測試文章（近似主題，測試重複性）
// ==================================================================
const contentAgent = new ContentWriterAgent();
const schemaAgent = new SchemaAgent(eventBus);

const article1Config = {
  topic: 'Next.js 效能優化完整指南',
  keywords: ['Next.js', 'SSR', 'ISR', 'Core Web Vitals', '效能優化'],
  targetWordCount: 1500,
  tone: 'professional' as const,
  format: 'blog' as const,
};

const article2Config = {
  topic: 'Next.js 網站速度優化技巧',
  keywords: ['Next.js', '網站速度', 'Lighthouse', 'LCP', 'CLS'],
  targetWordCount: 1500,
  tone: 'professional' as const,
  format: 'blog' as const,
};

log('生成測試文章 (2 篇近似主題文章，約需 60-120 秒)...');
log();

let article1: any;
let article2: any;

try {
  article1 = await timed('gen-article1', () => contentAgent.run(article1Config, ctx));
  log(`  文章 1 生成完成: ${article1.totalWordCount} 字`);
} catch (e) {
  log(`  文章 1 生成失敗: ${e}`);
  process.exit(1);
}

try {
  article2 = await timed('gen-article2', () => contentAgent.run(article2Config, ctx));
  log(`  文章 2 生成完成: ${article2.totalWordCount} 字`);
} catch (e) {
  log(`  文章 2 生成失敗: ${e}`);
  process.exit(1);
}

const a1Full = article1.sections.map((s: any) => s.content).join('\n');
const a1All  = `${article1.title}\n${article1.metaDescription}\n${a1Full}`;
const a2Full = article2.sections.map((s: any) => s.content).join('\n');

// ==================================================================
// Q1: 標題標籤品質
// ==================================================================
section('Q1  標題標籤 (Title Tag) 品質');

const title = article1.title;
const primaryKw = article1Config.keywords[0]!;
const titleLen = title.length;
const titleHasKw = title.toLowerCase().includes(primaryKw.toLowerCase());
const kwAtStart = title.toLowerCase().startsWith(primaryKw.toLowerCase());

log(`  標題: "${title}"`);
log(`  字元數: ${titleLen} (建議 30–60)`);
log(`  含主關鍵字: ${titleHasKw}`);
log(`  主關鍵字在標題前段 (前1/3): ${kwAtStart}`);
log();

assert('Q1-01 標題長度 30–60 字元', titleLen >= 30 && titleLen <= 60, `len=${titleLen}`);
assert('Q1-02 標題含主關鍵字', titleHasKw, `kw="${primaryKw}"`);
assert('Q1-03 主關鍵字位於標題前段', kwAtStart || title.toLowerCase().indexOf(primaryKw.toLowerCase()) < titleLen / 2,
  `pos=${title.toLowerCase().indexOf(primaryKw.toLowerCase())}`);
assert('Q1-04 標題無重複詞語', !/((.+)\s+\2)/.test(title), title);

// ==================================================================
// Q2: 標題層級結構 (Heading Hierarchy)
// ==================================================================
section('Q2  標題層級結構 (H1→H2→H3)');

// 從 outline 與 sections 重建標題結構
const headings = [
  { level: 1, text: article1.title },
  ...article1.outline.map((h: string) => ({ level: 2, text: h })),
];

const h1Count = headings.filter(h => h.level === 1).length;
const h2Count = headings.filter(h => h.level === 2).length;

log(`  H1 數量: ${h1Count} (應唯一 = 1)`);
log(`  H2 數量: ${h2Count} (建議 3–8)`);
log('  H2 列表:');
headings.filter(h => h.level === 2).forEach(h => log(`    - ${h.text}`));
log();

assert('Q2-01 H1 唯一 (≡ 1)', h1Count === 1, `got ${h1Count}`);
assert('Q2-02 H2 數量 3–8', h2Count >= 3 && h2Count <= 8, `got ${h2Count}`);
assert('Q2-03 H2 均非空且 < 80 字元', headings.filter(h => h.level === 2).every(h => h.text.length > 0 && h.text.length < 80), '');
assert('Q2-04 不同 H2 無字面重複', new Set(headings.filter(h => h.level === 2).map(h => h.text)).size === h2Count, '');

// ==================================================================
// Q3: 關鍵字密度與自然分佈
// ==================================================================
section('Q3  關鍵字密度與段落分佈');

const totalWords = article1.totalWordCount;
const primaryCount = countOccurrences(a1Full, primaryKw);
const density = (primaryCount / Math.max(1, totalWords)) * 100;

// 三等分文章，檢查分佈是否自然（每段均有出現）
const third = Math.floor(a1Full.length / 3);
const part1 = a1Full.slice(0, third);
const part2 = a1Full.slice(third, third * 2);
const part3 = a1Full.slice(third * 2);
const inPart1 = countOccurrences(part1, primaryKw) > 0;
const inPart2 = countOccurrences(part2, primaryKw) > 0;
const inPart3 = countOccurrences(part3, primaryKw) > 0;

log(`  主關鍵字: "${primaryKw}"`);
log(`  出現次數: ${primaryCount} / ${totalWords} 字 = ${density.toFixed(2)}%`);
log(`  段落分佈: 前段=${inPart1} 中段=${inPart2} 後段=${inPart3}`);
log();

// 次要關鍵字覆蓋
const secKws = article1Config.keywords.slice(1);
const secCoverage = secKws.map(kw => ({
  kw,
  count: countOccurrences(a1All, kw),
  present: countOccurrences(a1All, kw) > 0,
}));
log('  次要關鍵字覆蓋:');
secCoverage.forEach(({ kw, count, present }) => log(`    - "${kw}": ${count} 次 ${present ? '✓' : '✗'}`));
log();

assert('Q3-01 主關鍵字密度 1–3%', density >= 1 && density <= 3, `${density.toFixed(2)}%`);
assert('Q3-02 主關鍵字自然分佈 (前中後均出現)', inPart1 && inPart2 && inPart3, `p1=${inPart1} p2=${inPart2} p3=${inPart3}`);
assert('Q3-03 次要關鍵字覆蓋 >= 80%', secCoverage.filter(s => s.present).length / secKws.length >= 0.8,
  `${secCoverage.filter(s => s.present).length}/${secKws.length}`);
assert('Q3-04 無關鍵字堆砌 (密度 < 5%)', density < 5, `${density.toFixed(2)}%`);

// ==================================================================
// Q4: Meta Description 深度檢查
// ==================================================================
section('Q4  Meta Description 深度檢查');

const meta = article1.metaDescription;
const metaLen = meta.length;
const metaHasKw = meta.toLowerCase().includes(primaryKw.toLowerCase());
const ctaWords = ['了解', '立即', '探索', '查看', '學習', '開始', 'learn', 'discover', 'start', 'get'];
const metaHasCta = ctaWords.some(w => meta.toLowerCase().includes(w));
const hasQuestion = meta.includes('？') || meta.includes('?');

log(`  Meta: "${meta}"`);
log(`  長度: ${metaLen} (Google 顯示建議 120–158)`);
log(`  含主關鍵字: ${metaHasKw}`);
log(`  含 CTA 詞語: ${metaHasCta}`);
log(`  包含疑問引導: ${hasQuestion}`);
log();

assert('Q4-01 Meta 長度 80–160 字元', metaLen >= 80 && metaLen <= 160, `len=${metaLen}`);
assert('Q4-02 Meta 含主關鍵字', metaHasKw, '');
assert('Q4-03 Meta 含行動呼籲 (CTA) 或疑問句', metaHasCta || hasQuestion, '');
assert('Q4-04 Meta 無連續重複詞', !/((\S+)\s+\2)/.test(meta), '');

// ==================================================================
// Q5: E-E-A-T 信號偵測
// ==================================================================
section('Q5  E-E-A-T 信號偵測');

// Experience/Expertise: 數字、統計、百分比
const hasNumbers = /\d+(\.\d+)?(%|倍|個|項|種|萬|億|ms|kb|mb)/.test(a1Full);
// Authoritativeness: 引用、來源、研究
const hasCitations = /(根據|研究指出|數據顯示|Google 官方|W3C|MDN|來源|引用|參考)/.test(a1Full);
// Trustworthiness: 步驟說明、注意事項
const hasSteps = /(步驟|第一步|首先|其次|最後|注意|重要|建議)/.test(a1Full);
// Expert vocabulary: 技術術語密度
const techTerms = ['SSR', 'ISR', 'SSG', 'CSR', 'Core Web Vitals', 'LCP', 'CLS', 'FID', 'TTFB', 'hydration'];
const techTermCount = techTerms.filter(t => a1Full.includes(t)).length;

log(`  含數字/統計數據: ${hasNumbers}`);
log(`  含引用/來源說明: ${hasCitations}`);
log(`  含步驟/建議文字: ${hasSteps}`);
log(`  技術術語覆蓋: ${techTermCount}/${techTerms.length} 個 (${techTerms.filter(t => a1Full.includes(t)).join(', ')})`);
log();

assert('Q5-01 含量化數據 (數字+單位)', hasNumbers, '');
assert('Q5-02 含 E-E-A-T 步驟/建議語氣', hasSteps, '');
assert('Q5-03 技術術語覆蓋 >= 3 個', techTermCount >= 3, `got ${techTermCount}`);
// 引用指標是加分項，不強制
log(`  [INFO] 引用/來源信號: ${hasCitations ? '有' : '無 (建議補充)'}  (非強制斷言)`);

// ==================================================================
// Q6: 語意關聯詞 (LSI) 覆蓋率
// ==================================================================
section('Q6  語意關聯詞 (LSI) 覆蓋率');

// 預定義與主題相關的 LSI 詞彙群
const lsiTerms = [
  'React', 'JavaScript', 'TypeScript', 'Node.js', 'Vercel',   // 技術生態
  '伺服器端', '靜態', '動態', '快取', '資料庫',                  // 架構概念
  '使用者體驗', '載入速度', '搜尋引擎', '排名', '流量',           // SEO 相關
  'bundle', 'chunk', 'lazy', 'prefetch', 'cache',              // 效能術語
];
const lsiHits = lsiTerms.filter(t => a1All.toLowerCase().includes(t.toLowerCase()));
const lsiCoverage = lsiHits.length / lsiTerms.length;

log(`  LSI 詞彙命中: ${lsiHits.length}/${lsiTerms.length} (${(lsiCoverage * 100).toFixed(0)}%)`);
log(`  命中詞: ${lsiHits.slice(0, 10).join(', ')}${lsiHits.length > 10 ? '...' : ''}`);
log();

assert('Q6-01 LSI 覆蓋率 >= 40%', lsiCoverage >= 0.4, `${(lsiCoverage * 100).toFixed(0)}%`);
assert('Q6-02 LSI 命中 >= 8 個', lsiHits.length >= 8, `got ${lsiHits.length}`);

// ==================================================================
// Q7: 可讀性分析
// ==================================================================
section('Q7  可讀性分析');

const sentences = splitSentences(a1Full);
const sentLengths = sentences.map(s => s.length);
const avgSentLen = sentLengths.reduce((a, b) => a + b, 0) / Math.max(1, sentLengths.length);
const longSentences = sentLengths.filter(l => l > 80).length;
const longSentRatio = longSentences / Math.max(1, sentLengths.length);

// 段落密度 (每份 "section" 的字數應在 100–400 字)
const sectionWordCounts = article1.sections.map((s: any) => s.wordCount);
const tooShortSections = sectionWordCounts.filter((w: number) => w < 80).length;
const tooLongSections  = sectionWordCounts.filter((w: number) => w > 500).length;

log(`  句子數: ${sentences.length}`);
log(`  平均句子長度: ${avgSentLen.toFixed(1)} 字元`);
log(`  長句 (>80字) 比例: ${(longSentRatio * 100).toFixed(0)}%`);
log(`  段落字數分佈: ${sectionWordCounts.join(', ')}`);
log(`  過短段落 (<80 字): ${tooShortSections}  過長段落 (>500 字): ${tooLongSections}`);
log();

assert('Q7-01 平均句子長度 20–60 字元', avgSentLen >= 20 && avgSentLen <= 60, `avg=${avgSentLen.toFixed(1)}`);
assert('Q7-02 長句比例 < 40%', longSentRatio < 0.4, `${(longSentRatio * 100).toFixed(0)}%`);
assert('Q7-03 無過短段落 (<80 字)', tooShortSections === 0, `got ${tooShortSections}`);

// ==================================================================
// Q8: 同主題重複性偵測 (Keyword Cannibalization)
// ==================================================================
section('Q8  近似主題文章相似度 (Cannibalization 偵測)');

const similarity = jaccardSimilarity(a1Full, a2Full);
log(`  文章 1 主題: "${article1Config.topic}"`);
log(`  文章 2 主題: "${article2Config.topic}"`);
log(`  Trigram Jaccard 相似度: ${(similarity * 100).toFixed(1)}%`);
log(`  建議: < 30% = 安全；30–50% = 需注意；> 50% = 嚴重重複`);
log();

assert('Q8-01 兩篇近似主題文章相似度 < 50%', similarity < 0.5, `${(similarity * 100).toFixed(1)}%`);
assert('Q8-02 標題不完全相同', article1.title !== article2.title, '');
assert('Q8-03 Meta Description 不完全相同', article1.metaDescription !== article2.metaDescription, '');

// ==================================================================
// Q9: Schema.org Article 完整性
// ==================================================================
section('Q9  Schema.org 結構化資料完整性');

let schemaJson: Record<string, unknown> = {};
let schemaCode = '';

try {
  const schemaResult = await timed('schema', () =>
    schemaAgent.run(
      { operation: 'generate', url: 'https://nextjs.org', schemaType: 'Article' },
      ctx,
    )
  );
  schemaCode = schemaResult.generatedSchema?.code ?? '';

  try {
    schemaJson = JSON.parse(schemaCode) as Record<string, unknown>;
  } catch {
    // 嘗試從代碼塊中提取 JSON
    const match = schemaCode.match(/\{[\s\S]+\}/);
    if (match) schemaJson = JSON.parse(match[0]) as Record<string, unknown>;
  }

  log(`  生成 Schema 長度: ${schemaCode.length} 字元`);
  REQUIRED_SCHEMA_FIELDS.forEach(field => {
    const present = field in schemaJson;
    log(`  ${present ? '✓' : '✗'} ${field}: ${present ? JSON.stringify(schemaJson[field])?.slice(0, 50) : '(缺失)'}`);
  });
  log();

  const presentFields = REQUIRED_SCHEMA_FIELDS.filter(f => f in schemaJson);
  assert('Q9-01 Schema 含 @context', '@context' in schemaJson, '');
  assert('Q9-02 Schema 含 @type', '@type' in schemaJson, '');
  assert('Q9-03 Schema 含 headline', 'headline' in schemaJson, '');
  assert('Q9-04 Schema 含 author', 'author' in schemaJson, '');
  assert('Q9-05 Schema 必填欄位覆蓋 >= 4/6', presentFields.length >= 4,
    `${presentFields.length}/6: ${presentFields.join(', ')}`);
  assert('Q9-06 Schema 代碼長度 >= 200 字元', schemaCode.length >= 200, `len=${schemaCode.length}`);
} catch (e) {
  assert('Q9-01 Schema 含 @context', false, String(e).slice(0, 100));
}

// ==================================================================
// Q10: 繁簡字一致性
// ==================================================================
section('Q10 繁簡字一致性偵測');

const hasSimplified1 = hasSimplifiedChinese(a1Full);
const hasSimplified2 = hasSimplifiedChinese(a2Full);

// 不強制拋錯（簡體字在技術詞彙中難免），但測量並記錄
log(`  文章 1 含簡體字特徵: ${hasSimplified1}`);
log(`  文章 2 含簡體字特徵: ${hasSimplified2}`);
log();

if (hasSimplified1) {
  // 找出具體位置
  const simMatches: string[] = [];
  const simRe = /[国来时间这个们说么发现实应该为样问题经体现]/g;
  let m;
  while ((m = simRe.exec(a1Full)) !== null) {
    const ctx2 = a1Full.slice(Math.max(0, m.index - 5), m.index + 6);
    simMatches.push(`"${ctx2}"`);
    if (simMatches.length >= 5) break;
  }
  log(`  [WARN] 發現疑似簡體字位置: ${simMatches.join(', ')}`);
  log();
}

// 對繁體市場（zh-TW）而言，簡體字混用是扣分項
assert('Q10-01 文章 1 正體字一致性 (無明顯簡體)', !hasSimplified1, hasSimplified1 ? '含簡體特徵字' : '');
assert('Q10-02 文章 2 正體字一致性 (無明顯簡體)', !hasSimplified2, hasSimplified2 ? '含簡體特徵字' : '');


// ==================================================================
// 最終報告
// ==================================================================
const passed = assertions.filter(a => a.pass).length;
const failed = assertions.filter(a => !a.pass).length;
const total  = assertions.length;

section('品質審核總結');
log(`  總斷言: ${total}`);
log(`  通過:   ${passed}`);
log(`  失敗:   ${failed}`);
log(`  通過率: ${((passed / total) * 100).toFixed(1)}%`);
log();

if (failed > 0) {
  log('  ❌ 失敗項目:');
  assertions.filter(a => !a.pass).forEach(a => log(`    - ${a.name}${a.detail ? ': ' + a.detail : ''}`));
  log();
}

// 品質總分 (每項通過得分)
const qualityDimensions: Record<string, string> = {
  '標題優化':   assertions.filter(a => a.name.startsWith('Q1-')).map(a => a.pass ? '✓' : '✗').join(''),
  '結構完整':   assertions.filter(a => a.name.startsWith('Q2-')).map(a => a.pass ? '✓' : '✗').join(''),
  '關鍵字策略': assertions.filter(a => a.name.startsWith('Q3-')).map(a => a.pass ? '✓' : '✗').join(''),
  'Meta 品質':  assertions.filter(a => a.name.startsWith('Q4-')).map(a => a.pass ? '✓' : '✗').join(''),
  'E-E-A-T':    assertions.filter(a => a.name.startsWith('Q5-')).map(a => a.pass ? '✓' : '✗').join(''),
  'LSI 語意':   assertions.filter(a => a.name.startsWith('Q6-')).map(a => a.pass ? '✓' : '✗').join(''),
  '可讀性':     assertions.filter(a => a.name.startsWith('Q7-')).map(a => a.pass ? '✓' : '✗').join(''),
  '唯一性':     assertions.filter(a => a.name.startsWith('Q8-')).map(a => a.pass ? '✓' : '✗').join(''),
  'Schema':     assertions.filter(a => a.name.startsWith('Q9-')).map(a => a.pass ? '✓' : '✗').join(''),
  '語言一致性': assertions.filter(a => a.name.startsWith('Q10-')).map(a => a.pass ? '✓' : '✗').join(''),
};

log('  品質維度一覽:');
for (const [dim, result] of Object.entries(qualityDimensions)) {
  const prefixMap: Record<string, string> = {
    '標題優化': 'Q1-', '結構完整': 'Q2-', '關鍵字策略': 'Q3-', 'Meta 品質': 'Q4-',
    'E-E-A-T': 'Q5-', 'LSI 語意': 'Q6-', '可讀性': 'Q7-', '唯一性': 'Q8-',
    'Schema': 'Q9-', '語言一致性': 'Q10-',
  };
  const prefix = prefixMap[dim] ?? 'Q?-';
  const dimAsserts = assertions.filter(a => a.name.startsWith(prefix));
  const dimPass = dimAsserts.filter(a => a.pass).length;
  log(`    ${dim.padEnd(10)} ${result} (${dimPass}/${dimAsserts.length})`);
}
log();

const report = {
  meta: { timestamp: new Date().toISOString(), nodeVersion: process.version },
  summary: { total, passed, failed, passRate: `${((passed / total) * 100).toFixed(1)}%`, durations },
  articles: {
    article1: { title: article1.title, wordCount: article1.totalWordCount, seoScore: article1.seoScore },
    article2: { title: article2.title, wordCount: article2.totalWordCount, seoScore: article2.seoScore },
    similarity: `${(jaccardSimilarity(a1Full, a2Full) * 100).toFixed(1)}%`,
  },
  assertions,
};

writeFileSync(jsonFilePath, JSON.stringify(report, null, 2), 'utf8');
log(`  JSON 報告: ${jsonFilePath}`);
log(`  執行時間: ${((Object.values(durations).reduce((a, b) => a + b, 0)) / 1000).toFixed(1)}s`);
log();
