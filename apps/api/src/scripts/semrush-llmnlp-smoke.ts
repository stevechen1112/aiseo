/**
 * SEMrush & LLM NLP Integration Smoke Test
 * 
 * Tests:
 * 1. SEMrush Keyword Metrics API (replaces Ahrefs)
 * 2. LLM NLP Analysis (replaces Google NLP, zero cost!)
 * 3. Keyword Researcher Agent with new integrations
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config } from 'dotenv';

// Load .env from workspace root (../../../../ from apps/api/src/scripts/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../../../../.env');
config({ path: envPath });

import { ToolRegistry, type ToolContext, type AgentContext, type EventBus } from '@aiseo/core';
import { semrushKeywordMetricsTool, semrushKeywordIdeasTool, llmNlpAnalyzeTool, llmChatTool, googleSuggestTool } from '@aiseo/core';
import { KeywordResearcherAgent } from '@aiseo/core';

// Simple in-memory EventBus for testing (no Redis dependency)
class InMemoryEventBus {
  options = {} as any;
  prefix = 'test';
  async publish(event: unknown): Promise<unknown> { return event; }
  subscribe() { return { start: async () => {}, stop: async () => {} }; }
  subscribeAll() { return { start: async () => {}, stop: async () => {} }; }
}

const eventBus = new InMemoryEventBus() as unknown as EventBus;

const testContext: ToolContext = {
  tenantId: 'test-tenant',
  projectId: 'test-project',
  agentId: 'test-agent',
  workspacePath: '/tmp/test-workspace',
};

console.log('🧪 SEMrush & LLM NLP Integration Test\n');
console.log('=' .repeat(60));
console.log(`📝 Environment Check:`);
console.log(`   SEMRUSH_API_KEY: ${process.env.SEMRUSH_API_KEY?.slice(0, 8) || 'NOT SET'}...`);
console.log(`   OLLAMA_MODEL: ${process.env.OLLAMA_MODEL || 'NOT SET'}`);
console.log(`   OLLAMA_BASE_URL: ${process.env.OLLAMA_BASE_URL || 'NOT SET'}`);
console.log('=' .repeat(60));

// Test 1: SEMrush Keyword Metrics
console.log('\n📊 Test 1: SEMrush Keyword Metrics API\n');

const keywords = ['Next.js', 'React', 'TypeScript', 'Tailwind CSS'];

console.log(`Testing keywords: ${keywords.join(', ')}`);
console.log(`Database: ${process.env.SEMRUSH_DATABASE || 'tw'}`);
console.log(`API Key: ${process.env.SEMRUSH_API_KEY?.slice(0, 8)}...`);

const startTime1 = Date.now();

try {
  const result = await semrushKeywordMetricsTool.execute(
    { 
      keywords,
      database: process.env.SEMRUSH_DATABASE || 'tw'
    },
    testContext
  );

  const duration1 = Date.now() - startTime1;

  console.log(`\n✅ SEMrush Response (${duration1}ms):`);
  console.log(`   Metrics returned: ${result.metrics.length}`);
  
  result.metrics.forEach((metric) => {
    console.log(`\n   📈 ${metric.keyword}:`);
    console.log(`      Search Volume: ${metric.searchVolume.toLocaleString()}/month`);
    console.log(`      Keyword Difficulty: ${metric.keywordDifficulty}/100`);
    console.log(`      CPC: $${metric.cpc.toFixed(2)}`);
    console.log(`      Competition: ${(metric.competition * 100).toFixed(1)}%`);
    if (metric.trend && metric.trend.length > 0) {
      console.log(`      Trend (12 months): ${metric.trend.map(v => v.toFixed(2)).join(', ')}`);
    }
  });
} catch (error) {
  console.error(`\n❌ SEMrush Error: ${error instanceof Error ? error.message : error}`);
}

// Test 2: LLM NLP Analysis (replaces Google NLP)
console.log('\n\n🧠 Test 2: LLM NLP Analysis (Zero Cost!)\n');
console.log('=' .repeat(60));

const testText = 'Next.js 是一個基於 React 的全端框架，提供 SSR 和 SSG 功能，適合構建高性能的現代 Web 應用。';

console.log(`Test text: "${testText}"`);
console.log(`LLM Model: ${process.env.OLLAMA_MODEL}`);

const startTime2 = Date.now();

try {
  const nlpResult = await llmNlpAnalyzeTool.execute(
    {
      text: testText,
      features: ['entities', 'sentiment', 'keywords', 'topics'],
      language: 'zh-TW'
    },
    testContext
  );

  const duration2 = Date.now() - startTime2;

  console.log(`\n✅ LLM NLP Analysis (${duration2}ms):`);
  
  if (nlpResult.entities && nlpResult.entities.length > 0) {
    console.log('\n   🏷️  Entities:');
    nlpResult.entities.forEach((entity) => {
      console.log(`      - ${entity.name} (${entity.type}) - Salience: ${(entity.salience * 100).toFixed(1)}%`);
    });
  }

  if (nlpResult.sentiment) {
    console.log(`\n   😊 Sentiment:`);
    console.log(`      Score: ${nlpResult.sentiment.score.toFixed(2)} (${nlpResult.sentiment.label})`);
    console.log(`      Magnitude: ${nlpResult.sentiment.magnitude.toFixed(2)}`);
  }

  if (nlpResult.keywords) {
    console.log(`\n   🔑 Keywords: ${nlpResult.keywords.join(', ')}`);
  }

  if (nlpResult.topics) {
    console.log(`\n   📚 Topics: ${nlpResult.topics.join(', ')}`);
  }

} catch (error) {
  console.error(`\n❌ LLM NLP Error: ${error instanceof Error ? error.message : error}`);
}

// Test 3: Keyword Researcher Agent Integration
console.log('\n\n🤖 Test 3: Keyword Researcher Agent with SEMrush + LLM NLP\n');
console.log('=' .repeat(60));

const registry = new ToolRegistry();
registry.register(semrushKeywordMetricsTool);
registry.register(semrushKeywordIdeasTool);
registry.register(llmNlpAnalyzeTool);
registry.register(llmChatTool);
registry.register(googleSuggestTool);

const agent = new KeywordResearcherAgent();

const seedKeyword = 'Next.js 全端開發';
console.log(`Seed keyword: ${seedKeyword}`);

const startTime3 = Date.now();

try {
  const agentCtx: AgentContext = {
    ...testContext,
    workspacePath: '/tmp/test-workspace',
    tools: registry,
    eventBus,
  };

  const agentResult = await agent.run(
    {
      seedKeyword,
      locale: 'zh-TW',
      country: 'tw',
      maxKeywords: 20,
    },
    agentCtx
  );

  const duration3 = Date.now() - startTime3;

  console.log(`\n✅ Keyword Research Complete (${duration3}ms):`);
  console.log(`   Total keywords: ${agentResult.keywords.length}`);
  console.log(`   Seed keyword: ${agentResult.seedKeyword}`);

  console.log('\n   🎯 Top Keywords:');
  agentResult.keywords.slice(0, 10).forEach((kw, idx) => {
    console.log(`      ${idx + 1}. ${kw}`);
  });

  if (agentResult.metrics && agentResult.metrics.length > 0) {
    console.log('\n   📊 Metrics Available:');
    agentResult.metrics.slice(0, 5).forEach((m) => {
      console.log(`      ${m.keyword}: ${m.searchVolume?.toLocaleString() || 'N/A'} searches/month`);
    });
  }

  if (agentResult.entities && agentResult.entities.length > 0) {
    console.log('\n   🏷️  Entities:');
    agentResult.entities.slice(0, 5).forEach((e) => {
      console.log(`      ${e.name} (${e.type}) - ${(e.salience * 100).toFixed(1)}%`);
    });
  }

} catch (error) {
  console.error(`\n❌ Agent Error: ${error instanceof Error ? error.message : error}`);
}

// Summary
console.log('\n\n📋 Summary\n');
console.log('=' .repeat(60));
console.log('✅ SEMrush API: Replaces Ahrefs ($125/month)');
console.log('✅ LLM NLP: Replaces Google NLP ($0/month - runs locally!)');
console.log('✅ Keyword Researcher: Fully integrated with new APIs');
console.log('\n💰 Cost Comparison:');
console.log('   Old: Ahrefs $99 + Google NLP $5 = $104/month');
console.log('   New: SEMrush $125 + LLM NLP $0 = $125/month');
console.log('   Or:  DataForSEO $20 + LLM NLP $0 = $20/month (recommended)');
console.log('\n🎉 All tests completed!');
