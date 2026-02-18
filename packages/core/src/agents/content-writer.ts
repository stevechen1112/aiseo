import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';
import type { LlmChatInput, LlmChatOutput } from '../plugins/builtins/llm-chat.js';

export type ContentWriterInput = {
  topic: string;
  keywords?: string[];
  targetWordCount?: number;
  tone?: 'professional' | 'casual' | 'technical' | 'friendly';
  format?: 'blog' | 'guide' | 'product' | 'landing-page';
};

export type ContentSection = {
  title: string;
  content: string;
  wordCount: number;
};

export type ContentWriterOutput = {
  topic: string;
  title: string;
  metaDescription: string;
  outline: string[];
  sections: ContentSection[];
  totalWordCount: number;
  primaryKeyword: string;
  secondaryKeywords: string[];
  seoScore: number;
  readabilityScore: number;
};

export class ContentWriterAgent extends BaseAgent<ContentWriterInput, ContentWriterOutput> {
  readonly id = 'content-writer';
  readonly description = 'AI-powered SEO content writer with outline generation, section writing, and optimization.';

  // ── 簡體→繁體常見字映射 (覆蓋 LLM 最常洩漏的簡體字) ────────
  private static readonly S2T_MAP: Record<string, string> = {
    '国': '國', '来': '來', '时': '時', '间': '間', '这': '這',
    '个': '個', '们': '們', '说': '說', '么': '麼', '发': '發',
    '现': '現', '实': '實', '应': '應', '该': '該', '为': '為',
    '样': '樣', '问': '問', '题': '題', '经': '經', '体': '體',
    '与': '與', '关': '關', '学': '學', '对': '對', '开': '開',
    '从': '從', '会': '會', '进': '進', '动': '動', '机': '機',
    '长': '長', '点': '點', '无': '無', '过': '過', '后': '後',
    '还': '還', '没': '沒', '电': '電', '东': '東', '车': '車',
    '让': '讓', '将': '將', '要': '要', '价': '價', '护': '護',
    '节': '節', '华': '華', '达': '達', '运': '運', '连': '連',
    '单': '單', '网': '網', '优': '優', '础': '礎', '据': '據',
    '显': '顯', '质': '質', '数': '數', '总': '總', '办': '辦',
    '变': '變', '标': '標', '组': '組', '结': '結', '构': '構',
    '设': '設', '计': '計', '认': '認', '获': '獲', '选': '選',
    '织': '織', '则': '則', '测': '測', '试': '試', '调': '調',
    '环': '環', '境': '境', '场': '場', '仅': '僅', '处': '處',
    '术': '術', '类': '類', '确': '確', '谈': '談', '议': '議',
    '称': '稱', '际': '際', '属': '屬', '统': '統', '规': '規',
    '响': '響', '画': '畫', '语': '語', '页': '頁', '须': '須',
    '万': '萬', '图': '圖', '写': '寫', '转': '轉', '传': '傳',
    '广': '廣', '专': '專', '复': '複', '创': '創', '备': '備',
    '报': '報', '产': '產', '导': '導', '极': '極', '战': '戰',
    '独': '獨', '录': '錄', '热': '熱', '搜': '搜', '视': '視',
    '离': '離', '难': '難', '义': '義', '丰': '豐', '临': '臨',
  };

  private static readonly S2T_REGEX = new RegExp(
    '[' + Object.keys(ContentWriterAgent.S2T_MAP).join('') + ']', 'g',
  );

  /**
   * 將 LLM 輸出中偶爾洩漏的簡體字轉為正體字。
   * 不依賴外部庫（如 OpenCC），純靜態映射覆蓋最常見 100+ 字。
   */
  private toTraditional(text: string): string {
    return text.replace(
      ContentWriterAgent.S2T_REGEX,
      (ch) => ContentWriterAgent.S2T_MAP[ch] ?? ch,
    );
  }

  private countCjkAwareWords(text: string): number {
    // For Chinese content, whitespace tokenization massively under-counts.
    // This heuristic counts:
    // - each CJK character as 1
    // - each contiguous latin/number token as 1
    // It provides a stable proxy for "字數" and is good enough for density scoring.
    const cjkCount = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? [])
      .length;
    const latinTokenCount = (text.match(/[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*/g) ?? []).length;
    const extraTokenCount = (text
      .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ')
      .match(/\b\w+\b/g) ?? []).length;

    // latinTokenCount is a subset of extraTokenCount; avoid double-counting.
    return Math.max(1, cjkCount + Math.max(latinTokenCount, extraTokenCount));
  }

  protected async execute(input: ContentWriterInput, ctx: AgentContext): Promise<ContentWriterOutput> {
    const topic = input.topic.trim();
    const keywords = input.keywords ?? [];
    const targetWordCount = input.targetWordCount ?? 1500;
    const tone = input.tone ?? 'professional';
    const format = input.format ?? 'blog';

    if (!topic) {
      throw new Error('Topic is required for content generation');
    }

    // Step 1: Generate content outline
    const outline = await this.generateOutline(topic, keywords, format, ctx);

    // Step 2: Generate title and meta description
    const title = await this.generateTitle(topic, keywords, ctx);
    const metaDescription = await this.generateMetaDescription(topic, keywords, ctx);

    // Step 3: Write content sections based on outline
    const sections = await this.writeSections(outline, topic, keywords, tone, targetWordCount, ctx);

    // Step 4: Calculate SEO metrics
    const totalWordCount = sections.reduce((sum, section) => sum + section.wordCount, 0);
    const primaryKeyword = keywords[0] ?? topic;
    const secondaryKeywords = keywords.slice(1, 6);

    // Simple SEO score calculation (0-100)
    const seoScore = this.calculateSeoScore({
      title,
      metaDescription,
      content: sections.map((s) => s.content).join(' '),
      primaryKeyword,
      secondaryKeywords,
      wordCount: totalWordCount,
    });

    // Simple readability score (placeholder - could use Flesch-Kincaid)
    const readabilityScore = 75;

    return {
      topic,
      title,
      metaDescription,
      outline,
      sections,
      totalWordCount,
      primaryKeyword,
      secondaryKeywords,
      seoScore,
      readabilityScore,
    };
  }

  private async generateOutline(
    topic: string,
    keywords: string[],
    format: string,
    ctx: AgentContext,
  ): Promise<string[]> {
    // For MVP: Generate deterministic outline based on topic and format
    const outlines: Record<string, string[]> = {
      blog: [
        '簡介',
        `什麼是${topic}？`,
        `${topic}的主要優勢`,
        `如何使用${topic}`,
        '最佳實踐技巧',
        '常見問題',
        '結論',
      ],
      guide: [
        `${topic}完整指南`,
        '前置準備',
        '步驟一：基礎設定',
        '步驟二：核心配置',
        '步驟三：優化調整',
        '進階技巧',
        '疑難排解',
        '總結',
      ],
      product: [
        `${topic}產品概述`,
        '核心功能特色',
        '使用場景',
        '定價方案',
        '客戶評價',
        '與競品比較',
        '立即開始',
      ],
      'landing-page': [
        '痛點描述',
        '解決方案介紹',
        '產品特色',
        '使用者見證',
        '定價資訊',
        '立即行動',
      ],
    };

    return outlines[format] ?? outlines['blog']!;
  }

  private async generateTitle(topic: string, keywords: string[], ctx: AgentContext): Promise<string> {
    // Use LLM to generate SEO-optimized title
    const primaryKeyword = keywords[0] ?? topic;
    const keywordList = keywords.length > 0 ? keywords.join(', ') : topic;

    const prompt = `請生成一個吸引人的中文 SEO 標題，主題是「${topic}」。

要求：
1. 必須包含關鍵字：${primaryKeyword}
2. 長度在 50-60 個字元之間
3. 要吸引點擊，但不要標題黨
4. 符合 ${ctx.agentId} 的規範

只回答標題本身，不要額外說明。`;

    try {
      const llmInput: LlmChatInput = {
        messages: [
          { role: 'system', content: 'You are a professional SEO content writer specializing in Chinese content.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        maxTokens: 100,
      };

      const result = await ctx.tools.run<LlmChatInput, LlmChatOutput>('llm.chat', llmInput, ctx);
      return this.toTraditional(result.content.trim());
    } catch (error) {
      // Fallback to simple title if LLM fails
      console.warn(`LLM title generation failed: ${error}, using fallback`);
      return `${primaryKeyword}完整指南：提升效率的最佳實踐`;
    }
  }

  private async generateMetaDescription(
    topic: string,
    keywords: string[],
    ctx: AgentContext,
  ): Promise<string> {
    // Use LLM to generate SEO-optimized meta description
    const primaryKeyword = keywords[0] ?? topic;

    const prompt = `請生成一個中文 SEO meta description，主題是「${topic}」。

要求：
1. 必須包含關鍵字：${primaryKeyword}
2. 【嚴格限制】長度必須在 120-150 個字元之間（絕對不可超過 155 字元，否則會被 Google 截斷）
3. 要能吸引用戶點擊，並準確描述內容
4. 語氣專業但易懂
5. 結尾建議使用一個行動呼籲（如「立即了解」「馬上開始」）
6. 不要使用驚嘆號超過一次

只回答 meta description 本身，不要額外說明。`;

    try {
      const llmInput: LlmChatInput = {
        messages: [
          { role: 'system', content: 'You are a professional SEO content writer specializing in Chinese content.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        maxTokens: 150,
      };

      const result = await ctx.tools.run<LlmChatInput, LlmChatOutput>('llm.chat', llmInput, ctx);
      let meta = this.toTraditional(result.content.trim());
      // Hard truncation safety: if LLM still exceeds 155 chars, truncate gracefully
      if (meta.length > 155) {
        // Find last sentence boundary (。！？) within 155 chars, or last comma/space
        const truncated = meta.slice(0, 155);
        const lastSentEnd = Math.max(
          truncated.lastIndexOf('。'),
          truncated.lastIndexOf('！'),
          truncated.lastIndexOf('？'),
        );
        const lastComma = Math.max(truncated.lastIndexOf('，'), truncated.lastIndexOf('、'));
        const cutAt = lastSentEnd > 100 ? lastSentEnd + 1 : lastComma > 100 ? lastComma + 1 : 150;
        meta = meta.slice(0, cutAt);
      }

      // CTA enforcement: if Meta lacks CTA words or question mark, append one
      const ctaWords = ['了解', '立即', '探索', '查看', '學習', '開始', '馬上', '掌握'];
      const hasCta = ctaWords.some(w => meta.includes(w));
      const hasQuestion = meta.includes('？') || meta.includes('?');
      if (!hasCta && !hasQuestion) {
        meta = meta.replace(/[。！？!?]$/, '');
        const ctaSuffix = '，立即了解！';
        if (meta.length + ctaSuffix.length <= 155) {
          meta += ctaSuffix;
        } else {
          // Trim to fit
          meta = meta.slice(0, 155 - ctaSuffix.length) + ctaSuffix;
        }
      }

      return meta;
    } catch (error) {
      // Fallback to simple meta description if LLM fails
      console.warn(`LLM meta description generation failed: ${error}, using fallback`);
      return `深入了解${primaryKeyword}，專業教學與實用技巧。立即閱讀完整指南，掌握關鍵要點。`;
    }
  }

  private async writeSections(
    outline: string[],
    topic: string,
    keywords: string[],
    tone: string,
    targetWordCount: number,
    ctx: AgentContext,
  ): Promise<ContentSection[]> {
    const sections: ContentSection[] = [];
    const wordsPerSection = Math.floor(targetWordCount / outline.length);

    for (const heading of outline) {
      // Use LLM to generate actual content for each section
      const content = await this.generateSectionContent(heading, topic, keywords, tone, wordsPerSection, ctx);
      
      sections.push({
        title: heading,
        content,
        wordCount: this.countCjkAwareWords(content),
      });
    }

    return sections;
  }

  private async generateSectionContent(
    heading: string,
    topic: string,
    keywords: string[],
    tone: string,
    targetWords: number,
    ctx: AgentContext,
  ): Promise<string> {
    const primaryKeyword = keywords[0] ?? topic;
    const keywordList = keywords.length > 0 ? keywords.slice(0, 5).join('、') : topic;

    const toneMapping: Record<string, string> = {
      professional: '專業、正式',
      casual: '輕鬆、親切',
      technical: '技術性、詳細',
      friendly: '友善、易懂',
    };

    const toneDesc = toneMapping[tone] ?? '專業';

    const prompt = `請撰寫一段中文 SEO 優化的內容，標題是「${heading}」，主題是「${topic}」。

要求：
1. 字數約 ${targetWords} 字（中文字數）
2. 必須自然融入以下關鍵字：${keywordList}
3. 語氣：${toneDesc}
4. 內容要有價值、實用，避免空洞或重複
5. 段落分明，適當使用列點或小標題
6. 不要產生標題（只要內容本身）
7. 【E-E-A-T 要求】每段必須包含至少一個量化數據或統計（例如「提升 40%」「降低至 200ms 以下」「超過 78% 的使用者」「節省 3 倍時間」）。引用具體數字能大幅提升內容的專業可信度。
8. 適當提及來源或依據（例如「根據 Google 官方建議」「Lighthouse 測試結果顯示」「根據 2024 年調查報告」），增強權威性。

請直接輸出內容，不要額外說明。`;

    try {
      const llmInput: LlmChatInput = {
        messages: [
          { role: 'system', content: 'You are a professional SEO content writer specializing in Chinese content. Write engaging, informative, and SEO-optimized content.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        maxTokens: Math.max(500, Math.floor(targetWords * 2)), // Allow more tokens for longer sections
      };

      const result = await ctx.tools.run<LlmChatInput, LlmChatOutput>('llm.chat', llmInput, ctx);
      return this.toTraditional(result.content.trim());
    } catch (error) {
      // Fallback to simple placeholder if LLM fails
      console.warn(`LLM section content generation failed: ${error}, using fallback`);
      const templates = [
        `在這個章節中，我們將深入探討${primaryKeyword}的核心概念。`,
        `了解${heading}對於掌握${topic}至關重要。`,
        `本段將詳細說明${primaryKeyword}的實際應用方式。`,
        `透過實例和最佳實踐，您將更清楚理解${topic}的價值。`,
      ];

      let content = templates.join(' ');
      
      // Repeat content to reach target word count (placeholder logic)
      while (content.split(/\s+/).length < targetWords) {
        content += ` ${templates[Math.floor(Math.random() * templates.length)]}`;
      }

      return content.split(/\s+/).slice(0, targetWords).join(' ');
    }
  }

  private calculateSeoScore(params: {
    title: string;
    metaDescription: string;
    content: string;
    primaryKeyword: string;
    secondaryKeywords: string[];
    wordCount: number;
  }): number {
    let score = 0;

    // Title contains primary keyword (+20)
    if (params.title.toLowerCase().includes(params.primaryKeyword.toLowerCase())) {
      score += 20;
    }

    // Meta description contains primary keyword (+15)
    if (params.metaDescription.toLowerCase().includes(params.primaryKeyword.toLowerCase())) {
      score += 15;
    }

    // Primary keyword density in content (target 1-2%, +25)
    const contentLower = params.content.toLowerCase();
    const keywordOccurrences = (contentLower.match(new RegExp(params.primaryKeyword.toLowerCase(), 'g')) ?? []).length;
    const denom = Math.max(1, params.wordCount);
    const keywordDensity = (keywordOccurrences / denom) * 100;
    if (keywordDensity >= 1 && keywordDensity <= 2) {
      score += 25;
    } else if (keywordDensity >= 0.5 && keywordDensity < 1) {
      score += 15;
    }

    // Secondary keywords present (+20)
    const secondaryCount = params.secondaryKeywords.filter((kw) =>
      contentLower.includes(kw.toLowerCase()),
    ).length;
    score += Math.min(20, secondaryCount * 5);

    // Word count adequate (+20)
    if (params.wordCount >= 1200 && params.wordCount <= 2500) {
      score += 20;
    } else if (params.wordCount >= 800) {
      score += 10;
    }

    return Math.min(100, score);
  }
}
