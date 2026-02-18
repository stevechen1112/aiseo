import type { AgentDefinition } from './types.js';

export class AgentRegistry {
  private readonly agents = new Map<string, AgentDefinition<unknown, unknown>>();

  register<INPUT, OUTPUT>(agent: AgentDefinition<INPUT, OUTPUT>) {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent already registered: ${agent.id}`);
    }
    this.agents.set(agent.id, agent as unknown as AgentDefinition<unknown, unknown>);
  }

  has(id: string) {
    return this.agents.has(id);
  }

  get<INPUT, OUTPUT>(id: string): AgentDefinition<INPUT, OUTPUT> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }
    return agent as unknown as AgentDefinition<INPUT, OUTPUT>;
  }

  list() {
    return Array.from(this.agents.values()).map((a) => ({ id: a.id, description: a.description }));
  }
}
