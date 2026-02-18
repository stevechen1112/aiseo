import type { EventBus } from '../event-bus/bus.js';
import type { ToolRegistry } from '../plugins/registry.js';
import type { ToolContext } from '../plugins/registry.js';

export type AgentContext = ToolContext & {
  workspacePath: string;
  tools: ToolRegistry;
  eventBus: EventBus;
  parentAgentId?: string;
  depth?: number;
  subagentExecutor?: any; // Import causes circular dependency, using any for now
};

export type AgentDefinition<INPUT, OUTPUT> = {
  id: string;
  description: string;
  run: (input: INPUT, ctx: AgentContext) => Promise<OUTPUT>;
};
