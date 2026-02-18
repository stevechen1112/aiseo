/**
 * System prompts for keyword-researcher agent
 * 
 * This file contains the prompt templates used by the keyword-researcher agent
 * to guide its behavior and output quality.
 */

export const KEYWORD_RESEARCHER_SYSTEM_PROMPT = `You are an expert SEO keyword researcher. Your goal is to help identify valuable keyword opportunities for content creation and optimization.

OBJECTIVES:
1. Generate keyword variations that are semantically related to the seed keyword
2. Identify long-tail keywords with high intent and lower competition
3. Consider user search intent (informational, navigational, transactional, commercial)
4. Balance search volume potential with competition level

KEYWORD QUALITY CRITERIA:
- Relevance: Must be semantically related to the seed keyword or topic
- Specificity: Prefer long-tail keywords (3-5 words) over generic terms
- Intent alignment: Match the business goal (traffic, conversions, brand awareness)
- Searchability: Must be natural phrases people actually search for

RESEARCH METHODOLOGY:
1. Start with the seed keyword provided
2. Use available tools (Google Suggest, Ahrefs API, Google NLP) to gather data
3. Analyze search volume, keyword difficulty, and CPC metrics when available
4. Group keywords by topic clusters and search intent
5. Prioritize keywords with favorable volume/difficulty ratio

OUTPUT GUIDELINES:
- Return a comprehensive list of unique keywords
- Include keyword variations, synonyms, and related terms
- Focus on keywords that can drive qualified traffic
- Exclude overly competitive or irrelevant keywords
- Limit output to 50-200 keywords per research session

ANALYSIS APPROACH:
- For high-volume keywords: Focus on long-tail variations to avoid direct competition
- For niche topics: Cast a wider net to discover related opportunities
- For commercial keywords: Include purchase intent variations (buy, price, review, vs, best)
- For informational keywords: Include question-based queries (how, what, why, when)

Remember: Quality over quantity. A smaller list of highly relevant keywords is better than a large list of marginally related terms.`;

export const KEYWORD_RESEARCHER_USER_PROMPT_TEMPLATE = (seedKeyword: string) => `
Research keyword opportunities for the following seed keyword:

Seed Keyword: "${seedKeyword}"

Please use the available tools to:
1. Generate keyword suggestions using Google Suggest
2. Enrich keywords with metrics from Ahrefs API (if available)
3. Analyze entities and topics using Google NLP (if available)

Return a comprehensive list of relevant keywords that could drive qualified traffic.
`;

/**
 * Test cases for keyword-researcher agent quality evaluation
 * 
 * These test cases should be used to validate the agent's output quality
 * and ensure it meets the acceptance criteria defined in the task plan.
 */

export const KEYWORD_RESEARCHER_TEST_CASES = [
  {
    id: 'test-1',
    seedKeyword: 'SEO 工具',
    expectedCategories: [
      'SEO 分析工具',
      'SEO 關鍵字工具',
      'SEO 優化軟體',
      '免費 SEO 工具',
      'SEO 檢測工具',
    ],
    minKeywords: 30,
    maxKeywords: 100,
    description: '測試繁體中文 SEO 相關工具類關鍵字研究',
  },
  {
    id: 'test-2',
    seedKeyword: 'content marketing',
    expectedCategories: [
      'content marketing strategy',
      'content marketing tools',
      'content marketing examples',
      'content marketing agency',
      'B2B content marketing',
    ],
    minKeywords: 40,
    maxKeywords: 120,
    description: '測試英文內容行銷相關關鍵字研究',
  },
  {
    id: 'test-3',
    seedKeyword: 'AI chatbot',
    expectedCategories: [
      'AI chatbot platform',
      'AI chatbot builder',
      'best AI chatbot',
      'AI chatbot for customer service',
      'free AI chatbot',
    ],
    minKeywords: 35,
    maxKeywords: 100,
    description: '測試熱門科技產品關鍵字研究',
  },
  {
    id: 'test-4',
    seedKeyword: '電商平台',
    expectedCategories: [
      '電商平台架設',
      '電商平台比較',
      '跨境電商平台',
      '開店平台推薦',
      '電商系統',
    ],
    minKeywords: 30,
    maxKeywords: 100,
    description: '測試商業服務類關鍵字研究',
  },
];

/**
 * Evaluation criteria for keyword researcher output
 * 
 * Use these criteria when conducting human evaluation of the agent's output.
 */
export const KEYWORD_EVALUATION_CRITERIA = {
  relevance: {
    weight: 0.35,
    description: '關鍵字與種子關鍵字的語義相關性',
    scoring: {
      5: '高度相關，直接關聯',
      4: '相關性強，有明確聯繫',
      3: '中等相關，有間接聯繫',
      2: '弱相關，聯繫不明確',
      1: '不相關，偏離主題',
    },
  },
  searchability: {
    weight: 0.25,
    description: '關鍵字是否為自然搜尋用語',
    scoring: {
      5: '完全自然的搜尋用語',
      4: '大部分自然，少許生硬',
      3: '尚可接受的搜尋用語',
      2: '不太自然，較少人會搜尋',
      1: '不自然，不符合搜尋習慣',
    },
  },
  intent_clarity: {
    weight: 0.20,
    description: '搜尋意圖的明確性',
    scoring: {
      5: '意圖非常明確（購買/學習/比較等）',
      4: '意圖清晰可辨',
      3: '意圖尚可推測',
      2: '意圖不明確',
      1: '無法判斷意圖',
    },
  },
  variety: {
    weight: 0.20,
    description: '關鍵字組合的多樣性與涵蓋面',
    scoring: {
      5: '涵蓋多種角度與主題群',
      4: '有良好的多樣性',
      3: '中等多樣性',
      2: '多樣性不足',
      1: '重複性高，缺乏變化',
    },
  },
};

/**
 * Quality threshold for passing evaluation
 * 
 * The agent's output should achieve a weighted score of at least 4.0/5.0
 * across all evaluation criteria to be considered production-ready.
 */
export const QUALITY_THRESHOLD = 4.0;
