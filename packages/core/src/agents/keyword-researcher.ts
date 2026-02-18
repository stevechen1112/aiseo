import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';
import type { LlmChatInput, LlmChatOutput } from '../plugins/builtins/llm-chat.js';

export type KeywordResearcherInput = {
  seedKeyword?: string;
  locale?: string;
  country?: string;
  maxKeywords?: number;
};

export type KeywordMetrics = {
  keyword: string;
  searchVolume?: number;
  keywordDifficulty?: number;
  cpc?: number;
};

export type KeywordResearcherOutput = {
  seedKeyword: string;
  keywords: string[];
  metrics?: KeywordMetrics[];
  entities?: Array<{ name: string; type: string; salience: number }>;
  intents?: Array<{ keyword: string; intent: 'informational' | 'commercial' | 'transactional' | 'navigational'; confidence: number }>;
};

export class KeywordResearcherAgent extends BaseAgent<KeywordResearcherInput, KeywordResearcherOutput> {
  readonly id = 'keyword-researcher';
  readonly description = 'Comprehensive keyword research agent with Google Suggest, SEMrush/Ahrefs keyword metrics, and LLM-based NLP entity extraction.';

  protected async execute(input: KeywordResearcherInput, ctx: AgentContext): Promise<KeywordResearcherOutput> {
    const seedKeyword = (input.seedKeyword ?? 'seo').trim() || 'seo';
    const locale = input.locale ?? 'zh-TW';
    const country = input.country ?? 'tw';
    const maxKeywords = Math.min(500, Math.max(20, input.maxKeywords ?? 200));

    // Step 1: Generate deterministic keyword variations
    const deterministic = this.generateDeterministicKeywords(seedKeyword);

    // Step 2: Fetch Google Suggest autocomplete suggestions
    const suggestions = await this.fetchGoogleSuggest(seedKeyword, locale, ctx);

    // Step 2.5: Expand via SEMrush (related/questions) when available
    const semrushConfigured = Boolean(process.env.SEMRUSH_API_KEY);
    let semrushExpanded: string[] = [];
    if (semrushConfigured) {
      try {
        const [related, questions] = await Promise.all([
          ctx.tools.run<{ keyword: string; database?: string; kind: 'related'; limit?: number }, { keywords: string[] }>(
            'semrush.keywordIdeas',
            { keyword: seedKeyword, database: process.env.SEMRUSH_DATABASE ?? country, kind: 'related', limit: 30 },
            ctx,
          ),
          ctx.tools.run<{ keyword: string; database?: string; kind: 'questions'; limit?: number }, { keywords: string[] }>(
            'semrush.keywordIdeas',
            { keyword: seedKeyword, database: process.env.SEMRUSH_DATABASE ?? country, kind: 'questions', limit: 30 },
            ctx,
          ),
        ]);
        semrushExpanded = Array.from(new Set([...(related.keywords ?? []), ...(questions.keywords ?? [])]));
      } catch (error) {
        await ctx.eventBus
          .publish({
            tenantId: ctx.tenantId,
            projectId: ctx.projectId,
            type: 'system.test',
            payload: { message: 'SEMrush keywordIdeas not available', error: String(error) },
          })
          .catch(() => undefined);
      }
    }

    // Step 3: Combine all keywords
    let allKeywords = Array.from(new Set([...suggestions, ...semrushExpanded, ...deterministic])).slice(0, maxKeywords);

    // Step 4: Enrich keywords with keyword metrics (SEMrush preferred, Ahrefs fallback)
    let metrics: KeywordMetrics[] | undefined;
    try {
      // Prefer SEMrush when configured
      const semrushConfigured = Boolean(process.env.SEMRUSH_API_KEY);

      if (semrushConfigured) {
        const semrushOutput = await ctx.tools.run<
          { keywords: string[]; database?: string },
          { metrics: Array<{ keyword: string; searchVolume: number; keywordDifficulty: number; cpc: number }> }
        >('semrush.keywordMetrics', { keywords: allKeywords, database: process.env.SEMRUSH_DATABASE ?? country }, ctx);

        metrics = semrushOutput.metrics.map((m) => ({
          keyword: m.keyword,
          searchVolume: m.searchVolume,
          keywordDifficulty: m.keywordDifficulty,
          cpc: m.cpc,
        }));
      } else {
        const ahrefsOutput = await ctx.tools.run<
          { keywords: string[]; country?: string },
          { metrics: Array<{ keyword: string; searchVolume: number; keywordDifficulty: number; cpc: number }> }
        >('ahrefs.keywordMetrics', { keywords: allKeywords, country }, ctx);

        metrics = ahrefsOutput.metrics.map((m) => ({
          keyword: m.keyword,
          searchVolume: m.searchVolume,
          keywordDifficulty: m.keywordDifficulty,
          cpc: m.cpc,
        }));
      }

      // Sort keywords by search volume / difficulty ratio (opportunity score)
      if (metrics && metrics.length > 0) {
        const keywordScores = new Map(
          metrics.map((m) => {
            const score = m.searchVolume && m.keywordDifficulty ? m.searchVolume / (m.keywordDifficulty + 1) : 0;
            return [m.keyword, score];
          }),
        );

        allKeywords = allKeywords.sort((a, b) => {
          const scoreA = keywordScores.get(a) ?? 0;
          const scoreB = keywordScores.get(b) ?? 0;
          return scoreB - scoreA;
        });
      }
    } catch (error) {
      // SEMrush/Ahrefs API not available or failed - continue without metrics
      await ctx.eventBus
        .publish({
        tenantId: ctx.tenantId,
        projectId: ctx.projectId,
        type: 'system.test',
        payload: { message: 'Keyword metrics API not available', error: String(error) },
        })
        .catch(() => undefined);
    }

    // Step 5: Extract entities from seed keyword using LLM NLP (replaces Google NLP - zero cost!)
    let entities: Array<{ name: string; type: string; salience: number }> | undefined;
    try {
      const nlpOutput = await ctx.tools.run<
        { text: string; features?: Array<'entities' | 'sentiment'> },
        { entities: Array<{ name: string; type: string; salience: number }> }
      >('llm.nlp.analyze', { text: seedKeyword, features: ['entities'] }, ctx);

      entities = nlpOutput.entities.filter((e) => e.salience > 0.1).slice(0, 10);
    } catch (error) {
      // LLM NLP analysis not available or failed - continue without entity analysis
      await ctx.eventBus
        .publish({
        tenantId: ctx.tenantId,
        projectId: ctx.projectId,
        type: 'system.test',
        payload: { message: 'LLM NLP analysis not available', error: String(error) },
        })
        .catch(() => undefined);
    }

    // Step 6: Classify search intent (LLM) for top keywords
    let intents: KeywordResearcherOutput['intents'] | undefined;
    try {
      intents = await this.classifyIntents(allKeywords.slice(0, 12), locale, ctx);
    } catch (error) {
      await ctx.eventBus
        .publish({
          tenantId: ctx.tenantId,
          projectId: ctx.projectId,
          type: 'system.test',
          payload: { message: 'Intent classification failed', error: String(error) },
        })
        .catch(() => undefined);
    }

    return {
      seedKeyword,
      keywords: allKeywords,
      metrics,
      entities,
      intents,
    };
  }

  private async classifyIntents(
    keywords: string[],
    locale: string,
    ctx: AgentContext,
  ): Promise<Array<{ keyword: string; intent: 'informational' | 'commercial' | 'transactional' | 'navigational'; confidence: number }>> {
    const list = Array.from(new Set(keywords.map((k) => k.trim()).filter(Boolean))).slice(0, 12);
    if (list.length === 0) return [];

    const prompt = `你是專業 SEO 策略師，專精於繁體中文（台灣/香港）市場的搜尋意圖分析。請為每個關鍵字判斷「搜尋意圖」並用 JSON 回答。

意圖只能是以下四種之一：
- informational（想學習、找教學、了解概念。常見詞：「是什麼」「怎麼做」「教學」「原理」「範例」「如何」）
- commercial（正在比較、評測、找推薦，但尚未購買。常見詞：「推薦」「比較」「最好的」「排名」「評價」「心得」「優缺點」「哪個好」「課程」「工具」「方案」「軟體」「平台」「服務」）
- transactional（明確要購買、註冊、下載。常見詞：「價格」「費用」「購買」「下載」「註冊」「訂閱」「免費試用」「折扣」「優惠碼」「立即」「官網」）
- navigational（想找特定品牌或官方網站/登入頁。常見詞：「登入」「官網」「帳號」，或關鍵字本身就是品牌名）

【重要判斷規則】
- 含有「課程」「工具」「方案」「推薦」「比較」「最好」「哪個」的關鍵字，通常代表用戶正在選購階段，應判為 commercial
- 含有「價格」「費用」「購買」「下載」「免費試用」的關鍵字，應判為 transactional
- 不確定時優先考慮 commercial > informational（台灣用戶搜尋產品類詞彙時購買意圖通常較高）

請輸出格式：
{
  "intents": [
    { "keyword": "...", "intent": "informational|commercial|transactional|navigational", "confidence": 0-1 }
  ]
}

語言/市場：${locale}
關鍵字清單：
${list.map((k) => `- ${k}`).join('\n')}

只輸出 JSON，不要額外說明。`;

    const llmInput: LlmChatInput = {
      messages: [
        { role: 'system', content: 'You are an expert SEO strategist. Output strictly valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      maxTokens: 400,
    };

    const result = await ctx.tools.run<LlmChatInput, LlmChatOutput>('llm.chat', llmInput, ctx);
    let jsonText = result.content.trim();
    const m = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (m) jsonText = m[1] ?? jsonText;

    const parsed = JSON.parse(jsonText) as { intents?: Array<{ keyword: string; intent: string; confidence: number }> };
    const intents = (parsed.intents ?? [])
      .filter((i) => typeof i.keyword === 'string' && typeof i.intent === 'string')
      .map((i) => {
        const intent = i.intent as 'informational' | 'commercial' | 'transactional' | 'navigational';
        const confidence = typeof i.confidence === 'number' ? Math.max(0, Math.min(1, i.confidence)) : 0.5;
        return { keyword: i.keyword, intent, confidence };
      })
      .filter((i) => ['informational', 'commercial', 'transactional', 'navigational'].includes(i.intent));

    return intents;
  }

  private generateDeterministicKeywords(seedKeyword: string): string[] {
    // Common patterns for keyword variations
    const suffixes = [
      '教學',
      '工具',
      '費用',
      '範例',
      '推薦',
      '比較',
      '是什麼',
      '怎麼做',
      '怎麼用',
      '價格',
      '評價',
      '心得',
      '優缺點',
    ];

    const prefixes = ['免費', '最佳', '推薦', '好用', '熱門'];

    const variations: string[] = [seedKeyword];

    // Add suffix variations
    for (const suffix of suffixes) {
      variations.push(`${seedKeyword} ${suffix}`);
    }

    // Add prefix variations
    for (const prefix of prefixes) {
      variations.push(`${prefix} ${seedKeyword}`);
      variations.push(`${prefix}的 ${seedKeyword}`);
    }

    // Add vs/alternative patterns
    variations.push(`${seedKeyword} vs`);
    variations.push(`${seedKeyword} 替代方案`);
    variations.push(`${seedKeyword} 比價`);

    return variations;
  }

  private async fetchGoogleSuggest(
    seedKeyword: string,
    locale: string,
    ctx: AgentContext,
  ): Promise<string[]> {
    try {
      const output = await ctx.tools.run<
        { query: string; locale?: string },
        { suggestions: string[] }
      >('google.suggest', { query: seedKeyword, locale }, ctx);

      return output.suggestions;
    } catch (error) {
      await ctx.eventBus
        .publish({
        tenantId: ctx.tenantId,
        projectId: ctx.projectId,
        type: 'system.test',
        payload: { message: 'Google Suggest failed', error: String(error) },
        })
        .catch(() => undefined);
      return [];
    }
  }
}
