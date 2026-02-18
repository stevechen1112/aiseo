import type { AgentContext, AgentDefinition } from './types.js';

export abstract class BaseAgent<INPUT, OUTPUT> implements AgentDefinition<INPUT, OUTPUT> {
  abstract readonly id: string;
  abstract readonly description: string;

  protected abstract execute(input: INPUT, ctx: AgentContext): Promise<OUTPUT>;

  async run(input: INPUT, ctx: AgentContext): Promise<OUTPUT> {
    await ctx.eventBus.publish({
      tenantId: ctx.tenantId,
      projectId: ctx.projectId,
      type: 'agent.task.started',
      payload: { kind: 'agent', agentId: this.id },
    });

    try {
      const result = await this.execute(input, ctx);
      await ctx.eventBus.publish({
        tenantId: ctx.tenantId,
        projectId: ctx.projectId,
        type: 'agent.task.completed',
        payload: { kind: 'agent', agentId: this.id },
      });
      return result;
    } catch (error) {
      await ctx.eventBus.publish({
        tenantId: ctx.tenantId,
        projectId: ctx.projectId,
        type: 'agent.task.failed',
        payload: {
          kind: 'agent',
          agentId: this.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}
