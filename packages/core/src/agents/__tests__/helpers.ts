/**
 * Shared mock AgentContext factory for unit tests.
 * All external tool calls are stubbed to return sensible empty results.
 */

import type { AgentContext } from '../../agents/types.js';

// ── Minimal EventBus mock ──────────────────────────────────────────
function makeMockEventBus() {
  return {
    publish: async (_event: unknown) => {},
    subscribe: async () => ({ stop: async () => {} }),
    subscribeAll: (_cb: unknown) => ({ start: async () => {}, stop: async () => {} }),
  };
}

// ── Minimal ToolRegistry mock ─────────────────────────────────────
function makeMockToolRegistry(overrides: Record<string, unknown> = {}) {
  return {
    run: async (toolId: string, _input: unknown, _ctx: unknown): Promise<unknown> => {
      if (overrides[toolId] !== undefined) return overrides[toolId];
      // Sensible defaults by tool pattern
      if (toolId.startsWith('semrush.keyword')) return { keywords: [], metrics: [] };
      if (toolId === 'llm.chat') return { text: 'mock llm response', tokens: 0 };
      if (toolId === 'serp.search') return { results: [] };
      if (toolId === 'nlp.analyzeText') return { entities: [], sentiment: null };
      return {};
    },
    register: () => {},
    has: () => false,
    list: () => [],
  };
}

/**
 * Creates a minimal AgentContext suitable for unit testing.
 * @param toolOverrides  Map of toolId → value returned by tools.run()
 */
export function makeAgentContext(toolOverrides: Record<string, unknown> = {}): AgentContext {
  return {
    tenantId: 'test-tenant',
    projectId: 'test-project',
    agentId: 'test-agent',
    workspacePath: '/tmp/test-workspace',
    tools: makeMockToolRegistry(toolOverrides) as unknown as AgentContext['tools'],
    eventBus: makeMockEventBus() as unknown as AgentContext['eventBus'],
  };
}
