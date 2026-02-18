#!/usr/bin/env node
/**
 * Ollama Smoke Test
 * 
 * Quick verification script for Ollama LLM integration.
 * 
 * Tests:
 * 1. Direct llm.chat tool invocation
 * 2. Content Writer agent with LLM-powered generation
 * 
 * Usage:
 *   pnpm -C apps/api smoke:ollama
 */
import 'dotenv/config';
import {
  createDefaultToolRegistry,
  ContentWriterAgent,
  type EventBus,
  type AgentContext,
  type AgentEvent,
  type LlmChatInput,
  type LlmChatOutput,
} from '@aiseo/core';

// Simple in-memory EventBus for testing (no Redis dependency)
class InMemoryEventBus {
  options = {} as any;
  prefix = 'test';

  async publish(input: {
    tenantId: string;
    projectId?: string;
    type: string;
    payload: Record<string, unknown>;
  }): Promise<AgentEvent> {
    return {
      id: crypto.randomUUID(),
      seq: Date.now(),
      tenantId: input.tenantId,
      projectId: input.projectId,
      type: input.type as any,
      payload: input.payload,
      timestamp: Date.now(),
    };
  }

  subscribe() { return { start: async () => {}, stop: async () => {} }; }
  subscribeAll() { return { start: async () => {}, stop: async () => {} }; }
}

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(message: string, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

async function testLlmChatTool() {
  log('\n━━━ Test 1: Direct llm.chat Tool Invocation ━━━', BLUE);

  const registry = createDefaultToolRegistry();
  const tools = registry.list();
  
  log(`✓ Tool Registry created, ${tools.length} tools registered`);
  
  const llmTool = tools.find((t) => t.id === 'llm.chat');
  if (!llmTool) {
    throw new Error('llm.chat tool not found in registry!');
  }
  
  log(`✓ llm.chat tool found: ${llmTool.description}`);

  // Create minimal context for tool execution
  const ctx = {
    tenantId: '00000000-0000-0000-0000-000000000000',
    projectId: '00000000-0000-0000-0000-000000000001',
    agentId: 'test-agent',
    workspacePath: '/tmp/test',
  };

  const input: LlmChatInput = {
    messages: [
      { role: 'system', content: 'You are a helpful assistant that speaks Chinese.' },
      { role: 'user', content: '請用一句話介紹 SEO（搜尋引擎優化）。' },
    ],
    temperature: 0.7,
    maxTokens: 100,
  };

  log(`\n→ Calling llm.chat with prompt: "${input.messages[1]!.content}"`);
  
  const startTime = Date.now();
  const result = await registry.run<LlmChatInput, LlmChatOutput>('llm.chat', input, ctx);
  const elapsed = Date.now() - startTime;

  log(`\n✓ LLM Response (${elapsed}ms):`, GREEN);
  log(`  "${result.content}"`);
  
  if (result.usage) {
    log(`\n✓ Token Usage:`, GREEN);
    log(`  - Prompt: ${result.usage.promptTokens}`);
    log(`  - Completion: ${result.usage.completionTokens}`);
    log(`  - Total: ${result.usage.totalTokens}`);
  }

  log(`✓ Model: ${result.model}`);
  
  return result;
}

async function testContentWriterAgent() {
  log('\n━━━ Test 2: Content Writer Agent with LLM ━━━', BLUE);

  const registry = createDefaultToolRegistry();
  const eventBus = new InMemoryEventBus() as unknown as EventBus;
  const agent = new ContentWriterAgent();

  log(`✓ Content Writer Agent created: ${agent.description}`);

  const ctx: AgentContext = {
    tenantId: '00000000-0000-0000-0000-000000000000',
    projectId: '00000000-0000-0000-0000-000000000001',
    agentId: agent.id,
    workspacePath: '/tmp/test',
    tools: registry,
    eventBus,
  };

  const input = {
    topic: 'Next.js 全端開發',
    keywords: ['Next.js', 'React', 'SSR', '全端框架'],
    targetWordCount: 800,
    tone: 'professional' as const,
    format: 'blog' as const,
  };

  log(`\n→ Generating content for topic: "${input.topic}"`);
  log(`  Keywords: ${input.keywords.join(', ')}`);
  log(`  Target: ${input.targetWordCount} words, ${input.format} format`);

  const startTime = Date.now();
  const result = await agent.run(input, ctx);
  const elapsed = Date.now() - startTime;

  log(`\n✓ Content Generated (${elapsed}ms):`, GREEN);
  log(`\n  Title: "${result.title}"`);
  log(`  Meta: "${result.metaDescription}"`);
  log(`\n  Outline (${result.outline.length} sections):`);
  result.outline.forEach((section, idx) => {
    log(`    ${idx + 1}. ${section}`);
  });

  log(`\n  Content Sections (${result.sections.length}):`);
  result.sections.forEach((section, idx) => {
    const preview = section.content.substring(0, 80).replace(/\n/g, ' ');
    log(`    ${idx + 1}. ${section.title} (${section.wordCount} words)`);
    log(`       "${preview}..."`);
  });

  log(`\n✓ Metrics:`, GREEN);
  log(`  - Total Word Count: ${result.totalWordCount}`);
  log(`  - SEO Score: ${result.seoScore}/100`);
  log(`  - Readability Score: ${result.readabilityScore}/100`);
  log(`  - Primary Keyword: ${result.primaryKeyword}`);
  log(`  - Secondary Keywords: ${result.secondaryKeywords.join(', ')}`);

  return result;
}

async function main() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
  log('   Ollama LLM Integration Smoke Test', BLUE);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);

  // Check environment variables
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'gemma3:27b';
  
  log(`\nConfiguration:`);
  log(`  OLLAMA_BASE_URL: ${ollamaUrl}`);
  log(`  OLLAMA_MODEL: ${ollamaModel}`);

  try {
    // Test 1: Direct tool call
    await testLlmChatTool();

    // Test 2: Agent integration
    await testContentWriterAgent();

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', GREEN);
    log('   ✓ All Tests Passed!', GREEN);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', GREEN);
    
    process.exit(0);
  } catch (error) {
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', RED);
    log('   ✗ Test Failed!', RED);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', RED);
    
    if (error instanceof Error) {
      log(`\nError: ${error.message}`, RED);
      if (error.stack) {
        log(`\nStack trace:`, RED);
        log(error.stack, RED);
      }
    } else {
      log(`\nError: ${String(error)}`, RED);
    }
    
    process.exit(1);
  }
}

await main();
