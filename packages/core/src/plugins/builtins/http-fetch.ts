import type { ToolContext, ToolDefinition } from '../registry.js';
import { assertUrlHostAllowed, getEffectiveNetworkAllowlist } from '../registry.js';

export type HttpFetchInput = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  bodyText?: string;
};

export type HttpFetchOutput = {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  contentType: string | null;
  text: string;
};

export const httpFetchTool: ToolDefinition<HttpFetchInput, HttpFetchOutput> = {
  id: 'http.fetch',
  description: 'Fetch a URL over HTTP(S) with an optional allowlist enforcement.',
  permissions: {
    networkAllowlist: [],
    fileSystem: 'read-only',
  },
  execute: async (input, ctx: ToolContext) => {
    const url = new URL(input.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http/https URLs are allowed');
    }

    const effectiveAllowlist = getEffectiveNetworkAllowlist(httpFetchTool.permissions, ctx);
    assertUrlHostAllowed(url, effectiveAllowlist);

    const res = await fetch(url, {
      method: input.method ?? 'GET',
      headers: input.headers,
      body: input.bodyText,
    });

    const text = await res.text();

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      url: res.url,
      contentType: res.headers.get('content-type'),
      text,
    };
  },
};
