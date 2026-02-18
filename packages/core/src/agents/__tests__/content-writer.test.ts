import { describe, it, expect } from 'vitest';
import { ContentWriterAgent } from '../content-writer.js';
import { makeAgentContext } from './helpers.js';

const MOCK_OUTLINE = JSON.stringify(['Introduction', 'Main Section', 'Conclusion']);
const MOCK_SECTION_CONTENT = 'This is a sample section content for testing purposes.';

describe('ContentWriterAgent', () => {
  const agent = new ContentWriterAgent();

  it('has correct id and description', () => {
    expect(agent.id).toBe('content-writer');
    expect(agent.description.length).toBeGreaterThan(0);
  });

  it('run() produces structured output without throwing', async () => {
    const ctx = makeAgentContext({
      'llm.chat': (() => {
        let callCount = 0;
        return async () => {
          callCount++;
          // First call: outline, second+ calls: section content
          if (callCount === 1) return { text: MOCK_OUTLINE, tokens: 20 };
          return { text: MOCK_SECTION_CONTENT, tokens: 30 };
        };
      })(),
    });

    const result = await agent.run(
      { topic: 'SEO Best Practices', keywords: ['seo', 'google'], targetWordCount: 200 },
      ctx,
    );

    expect(result).toBeDefined();
    expect(result.topic).toBe('SEO Best Practices');
    expect(typeof result.title).toBe('string');
    expect(Array.isArray(result.outline)).toBe(true);
    expect(Array.isArray(result.sections)).toBe(true);
    expect(typeof result.seoScore).toBe('number');
  });

  it('run() handles minimal input', async () => {
    const ctx = makeAgentContext({
      'llm.chat': { text: MOCK_SECTION_CONTENT, tokens: 10 },
    });

    await expect(agent.run({ topic: 'Testing' }, ctx)).resolves.toBeDefined();
  });
});
