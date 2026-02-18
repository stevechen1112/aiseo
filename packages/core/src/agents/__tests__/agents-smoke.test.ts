/**
 * Smoke tests for the remaining 10 agents.
 * Each test verifies that agent.run() resolves (doesn't throw) given minimal valid input,
 * with all external tool calls stubbed to return empty/default results.
 */
import { describe, it, expect } from 'vitest';
import { makeAgentContext } from './helpers.js';

import { BacklinkBuilderAgent } from '../backlink-builder.js';
import { CompetitorMonitorAgent } from '../competitor-monitor.js';
import { ContentRefresherAgent } from '../content-refresher.js';
import { InternalLinkerAgent } from '../internal-linker.js';
import { LocalSeoAgent } from '../local-seo.js';
import { PageSpeedAgent } from '../pagespeed-agent.js';
import { ReportGeneratorAgent } from '../report-generator.js';
import { SchemaAgent } from '../schema-agent.js';
import { SerpTrackerAgent } from '../serp-tracker.js';
import { TechnicalAuditorAgent } from '../technical-auditor.js';

const LLM_STUB = { text: '{}', tokens: 5 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MOCK_EVENT_BUS: any = {
  publish: async (_event: unknown) => ({ id: '', seq: 0, tenantId: '', type: 'agent.started', payload: {}, timestamp: 0 }),
  subscribe: (_tenantId: string, _cb: unknown) => ({ stop: async () => {} }),
  subscribeAll: (_tenantId: string, _cb: unknown) => ({ start: async () => {}, stop: async () => {} }),
};

describe('Agent smoke tests', () => {
  it('BacklinkBuilderAgent — resolves without throwing', async () => {
    const agent = new BacklinkBuilderAgent(MOCK_EVENT_BUS);
    expect(agent.id).toBe('backlink-builder');
    const ctx = makeAgentContext({ 'llm.chat': LLM_STUB });
    await expect(
      agent.run({ ownDomain: 'example.com', competitorDomains: ['competitor.com'] }, ctx),
    ).resolves.toBeDefined();
  });

  it('CompetitorMonitorAgent — resolves without throwing', async () => {
    const agent = new CompetitorMonitorAgent();
    expect(agent.id).toBe('competitor-monitor');
    const ctx = makeAgentContext({ 'llm.chat': LLM_STUB });
    await expect(
      agent.run({ competitorDomain: 'competitor.com', ownDomain: 'example.com' }, ctx),
    ).resolves.toBeDefined();
  });

  it('ContentRefresherAgent — resolves without throwing', async () => {
    const agent = new ContentRefresherAgent(MOCK_EVENT_BUS);
    expect(agent.id).toBe('content-refresher');
    const ctx = makeAgentContext({ 'llm.chat': LLM_STUB });
    await expect(
      agent.run({ operation: 'check', urls: ['https://example.com/blog/post'] }, ctx),
    ).resolves.toBeDefined();
  });

  it('InternalLinkerAgent — resolves without throwing', async () => {
    const agent = new InternalLinkerAgent(MOCK_EVENT_BUS);
    expect(agent.id).toBe('internal-linker');
    const ctx = makeAgentContext({ 'llm.chat': LLM_STUB });
    await expect(
      agent.run({ operation: 'analyze', siteUrl: 'https://example.com' }, ctx),
    ).resolves.toBeDefined();
  });

  it('LocalSeoAgent — resolves without throwing', async () => {
    const agent = new LocalSeoAgent(MOCK_EVENT_BUS);
    expect(agent.id).toBe('local-seo');
    const ctx = makeAgentContext({ 'llm.chat': LLM_STUB });
    await expect(
      agent.run({ operation: 'audit', businessName: 'My Business' }, ctx),
    ).resolves.toBeDefined();
  });

  it('PageSpeedAgent — resolves without throwing', async () => {
    const agent = new PageSpeedAgent(MOCK_EVENT_BUS);
    expect(agent.id).toBe('pagespeed-agent');
    const ctx = makeAgentContext({ 'llm.chat': LLM_STUB });
    await expect(
      agent.run({ operation: 'audit', urls: ['https://example.com'] }, ctx),
    ).resolves.toBeDefined();
  });

  it('ReportGeneratorAgent — resolves without throwing', async () => {
    const agent = new ReportGeneratorAgent(MOCK_EVENT_BUS);
    expect(agent.id).toBe('report-generator');
    const ctx = makeAgentContext({ 'llm.chat': LLM_STUB });
    await expect(
      agent.run({ reportFormat: 'comprehensive', reportPeriod: 'monthly', outputFormat: 'pdf' }, ctx),
    ).resolves.toBeDefined();
  });

  it('SchemaAgent — resolves without throwing', async () => {
    const agent = new SchemaAgent(MOCK_EVENT_BUS);
    expect(agent.id).toBe('schema-agent');
    const ctx = makeAgentContext({ 'llm.chat': LLM_STUB });
    await expect(
      agent.run({ operation: 'detect', url: 'https://example.com' }, ctx),
    ).resolves.toBeDefined();
  });

  it('SerpTrackerAgent — resolves without throwing', async () => {
    const agent = new SerpTrackerAgent();
    expect(agent.id).toBe('serp-tracker');
    const ctx = makeAgentContext({ 'llm.chat': LLM_STUB, 'serp.search': { results: [] } });
    await expect(
      agent.run({ keyword: 'seo tools' }, ctx),
    ).resolves.toBeDefined();
  });

  it('TechnicalAuditorAgent — resolves without throwing', async () => {
    const agent = new TechnicalAuditorAgent();
    expect(agent.id).toBe('technical-auditor');
    const ctx = makeAgentContext({ 'llm.chat': LLM_STUB });
    await expect(
      agent.run({ url: 'https://example.com' }, ctx),
    ).resolves.toBeDefined();
  });
});
