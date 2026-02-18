import type { ToolContext, ToolDefinition } from '../registry.js';
import { assertUrlHostAllowed, getEffectiveNetworkAllowlist } from '../registry.js';

export type GoogleSuggestInput = {
  query: string;
  locale?: string;
};

export type GoogleSuggestOutput = {
  query: string;
  locale: string;
  suggestions: string[];
};

export const googleSuggestTool: ToolDefinition<GoogleSuggestInput, GoogleSuggestOutput> = {
  id: 'google.suggest',
  description: 'Fetch Google Suggest autocomplete suggestions (no API key).',
  permissions: {
    networkAllowlist: ['suggestqueries.google.com'],
    fileSystem: 'read-only',
  },
  execute: async (input, ctx: ToolContext) => {
    const query = input.query.trim();
    if (!query) throw new Error('query is required');

    const locale = input.locale ?? 'zh-TW';

    const url = new URL('https://suggestqueries.google.com/complete/search');
    url.searchParams.set('client', 'firefox');
    url.searchParams.set('hl', locale);
    url.searchParams.set('q', query);

    const effectiveAllowlist = getEffectiveNetworkAllowlist(googleSuggestTool.permissions, ctx);
    assertUrlHostAllowed(url, effectiveAllowlist);

    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Google Suggest failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || typeof data[0] !== 'string' || !Array.isArray(data[1])) {
      throw new Error('Unexpected Google Suggest response');
    }

    const suggestions = (data[1] as unknown[])
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter(Boolean);

    return { query, locale, suggestions };
  },
};
