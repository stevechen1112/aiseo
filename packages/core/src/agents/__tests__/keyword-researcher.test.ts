import { describe, it, expect } from 'vitest';
import { KeywordResearcherAgent } from '../keyword-researcher.js';
import { makeAgentContext } from './helpers.js';

describe('KeywordResearcherAgent', () => {
  const agent = new KeywordResearcherAgent();

  it('has correct id and description', () => {
    expect(agent.id).toBe('keyword-researcher');
    expect(agent.description.length).toBeGreaterThan(0);
  });

  it('run() with empty input returns output without throwing', async () => {
    const ctx = makeAgentContext({
      'llm.chat': { text: '["seo tips","seo guide","seo tools"]', tokens: 10 },
    });

    const result = await agent.run({ seedKeyword: 'seo', maxKeywords: 10 }, ctx);

    expect(result).toBeDefined();
    expect(result.seedKeyword).toBe('seo');
    expect(Array.isArray(result.keywords)).toBe(true);
  });

  it('run() uses provided seedKeyword', async () => {
    const ctx = makeAgentContext({
      'llm.chat': { text: '["react hooks","react tutorial"]', tokens: 5 },
    });

    const result = await agent.run({ seedKeyword: 'react', maxKeywords: 5 }, ctx);
    expect(result.seedKeyword).toBe('react');
  });

  it('run() handles missing seedKeyword gracefully', async () => {
    const ctx = makeAgentContext({
      'llm.chat': { text: '[]', tokens: 0 },
    });

    // Should not throw
    await expect(agent.run({}, ctx)).resolves.toBeDefined();
  });
});
