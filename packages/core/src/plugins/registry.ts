export type ToolPermission = {
  networkAllowlist?: string[];
  fileSystem?: 'read-only' | 'read-write';
};

export type ToolContext = {
  tenantId: string;
  projectId: string;
  agentId: string;
  /** Absolute path to the agent's isolated workspace. Tools must not escape this directory. */
  workspacePath: string;
  /** Optional per-run restrictions (cannot grant more than the tool declares). */
  toolPolicy?: ToolPermission;
};

export type ToolDefinition<INPUT, OUTPUT> = {
  id: string;
  description: string;
  permissions: ToolPermission;
  execute: (input: INPUT, ctx: ToolContext) => Promise<OUTPUT>;
};

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function hasRestriction(list?: string[]): list is string[] {
  return Array.isArray(list) && list.length > 0;
}

/**
 * Returns the effective network allowlist for this execution.
 * - If neither tool nor ctx restricts, returns undefined (allow all)
 * - If only one restricts, returns that list
 * - If both restrict, returns the intersection
 */
export function getEffectiveNetworkAllowlist(tool: ToolPermission, ctx: ToolContext): string[] | undefined {
  const toolList = (tool.networkAllowlist ?? []).map(normalizeHost).filter(Boolean);
  const ctxList = (ctx.toolPolicy?.networkAllowlist ?? []).map(normalizeHost).filter(Boolean);

  const toolRestricts = hasRestriction(toolList);
  const ctxRestricts = hasRestriction(ctxList);

  if (toolRestricts && ctxRestricts) {
    const ctxSet = new Set(ctxList);
    const intersection = toolList.filter((h) => ctxSet.has(h));
    return intersection;
  }

  if (toolRestricts) return toolList;
  if (ctxRestricts) return ctxList;
  return undefined;
}

export function assertUrlHostAllowed(url: URL, allowlist?: string[]) {
  if (!allowlist || allowlist.length === 0) return;

  const hostname = normalizeHost(url.hostname);
  const hostWithPort = normalizeHost(url.host);

  const ok = allowlist.some((allowed) => {
    const a = normalizeHost(allowed);
    if (!a) return false;
    return a.includes(':') ? a === hostWithPort : a === hostname;
  });

  if (!ok) {
    throw new Error(`Host not allowed: ${url.host}`);
  }
}

import { httpFetchTool } from './builtins/http-fetch.js';
import { fsReadFileTool, fsWriteFileTool } from './builtins/file-system.js';
import { googleSuggestTool } from './builtins/google-suggest.js';
import { ahrefsKeywordMetricsTool } from './builtins/ahrefs.js';
import { semrushKeywordIdeasTool, semrushKeywordMetricsTool, semrushDomainOverviewTool, semrushDomainOrganicTool } from './builtins/semrush.js';
import { googleNlpAnalyzeTool } from './builtins/google-nlp.js';
import { llmNlpAnalyzeTool } from './builtins/llm-nlp.js';
import { llmChatTool } from './builtins/llm-chat.js';
import { pagespeedInsightsTool } from './builtins/pagespeed-insights.js';
import { webCrawlerTool } from './builtins/web-crawler.js';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();

  register<INPUT, OUTPUT>(tool: ToolDefinition<INPUT, OUTPUT>) {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`);
    }
    this.tools.set(tool.id, tool as unknown as ToolDefinition<unknown, unknown>);
  }

  get(id: string) {
    const tool = this.tools.get(id);
    if (!tool) {
      throw new Error(`Tool not found: ${id}`);
    }
    return tool;
  }

  async run<INPUT, OUTPUT>(id: string, input: INPUT, ctx: ToolContext): Promise<OUTPUT> {
    const tool = this.get(id) as unknown as ToolDefinition<INPUT, OUTPUT>;
    return await tool.execute(input, ctx);
  }

  list() {
    return Array.from(this.tools.values()).map((t) => ({
      id: t.id,
      description: t.description,
      permissions: t.permissions,
    }));
  }
}

export function createDefaultToolRegistry() {
  const registry = new ToolRegistry();

  registry.register(httpFetchTool);
  registry.register(googleSuggestTool);
  registry.register(ahrefsKeywordMetricsTool);
  registry.register(semrushKeywordMetricsTool);
  registry.register(semrushKeywordIdeasTool);
  registry.register(semrushDomainOverviewTool);
  registry.register(semrushDomainOrganicTool);
  registry.register(googleNlpAnalyzeTool);
  registry.register(llmNlpAnalyzeTool);
  registry.register(fsReadFileTool);
  registry.register(fsWriteFileTool);
  registry.register(llmChatTool);
  registry.register(pagespeedInsightsTool);
  registry.register(webCrawlerTool);

  return registry;
}
