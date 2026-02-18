/**
 * Subagent Pattern - Allow Smart Agents to delegate tasks to other agents
 * 
 * This enables hierarchical agent collaboration where high-level agents
 * can invoke lower-level agents to complete specific subtasks.
 * 
 * Example: content-writer calls keyword-researcher to enrich keyword list
 * 
 * Phase 2 Task 3.11.2
 */

import type { AgentContext, AgentDefinition } from '../agents/types.js';
import type { AgentRegistry } from '../agents/registry.js';

export interface SubagentRequest<TInput = unknown> {
  agentId: string;
  input: TInput;
  timeout?: number; // milliseconds
  priority?: 'high' | 'normal' | 'low';
}

export interface SubagentResponse<TOutput = unknown> {
  agentId: string;
  success: boolean;
  output?: TOutput;
  error?: string;
  executionTime: number;
}

/**
 * Subagent executor that allows agents to invoke other agents
 */
export class SubagentExecutor {
  constructor(private readonly registry: AgentRegistry) {}

  /**
   * Execute a subagent task synchronously
   * 
   * This is used when a parent agent needs the result of a subagent
   * before continuing its own execution.
   */
  async execute<TInput, TOutput>(
    request: SubagentRequest<TInput>,
    context: AgentContext
  ): Promise<SubagentResponse<TOutput>> {
    const startTime = Date.now();

    try {
      // Check if subagent exists
      if (!this.registry.has(request.agentId)) {
        return {
          agentId: request.agentId,
          success: false,
          error: `Agent ${request.agentId} not found in registry`,
          executionTime: Date.now() - startTime,
        };
      }

      // Get the agent
      const agent = this.registry.get<TInput, TOutput>(request.agentId);

      // Create subagent context (inherit from parent but mark as subagent)
      const subagentContext: AgentContext = {
        ...context,
        agentId: request.agentId,
        parentAgentId: context.agentId,
        depth: (context.depth ?? 0) + 1,
      };

      // Enforce maximum depth to prevent infinite recursion
      const maxDepth = 3;
      if (subagentContext.depth !== undefined && subagentContext.depth > maxDepth) {
        return {
          agentId: request.agentId,
          success: false,
          error: `Maximum subagent depth (${maxDepth}) exceeded`,
          executionTime: Date.now() - startTime,
        };
      }

      // Execute with timeout if specified
      let output: TOutput;
      if (request.timeout) {
        output = await this.executeWithTimeout(
          agent,
          request.input,
          subagentContext,
          request.timeout
        );
      } else {
        output = await agent.run(request.input, subagentContext);
      }

      return {
        agentId: request.agentId,
        success: true,
        output,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        agentId: request.agentId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute multiple subagent tasks in parallel
   * 
   * This is useful when a parent agent needs results from multiple
   * subagents and they can run independently.
   */
  async executeParallel<TInput, TOutput>(
    requests: SubagentRequest<TInput>[],
    context: AgentContext
  ): Promise<SubagentResponse<TOutput>[]> {
    return Promise.all(
      requests.map(request => this.execute<TInput, TOutput>(request, context))
    );
  }

  /**
   * Execute multiple subagent tasks in sequence
   * 
   * This is useful when subagents have dependencies on each other's outputs.
   */
  async executeSequential<TInput, TOutput>(
    requests: SubagentRequest<TInput>[],
    context: AgentContext
  ): Promise<SubagentResponse<TOutput>[]> {
    const results: SubagentResponse<TOutput>[] = [];
    
    for (const request of requests) {
      const result = await this.execute<TInput, TOutput>(request, context);
      results.push(result);
      
      // Stop execution if any subagent fails (unless specified otherwise)
      if (!result.success) {
        break;
      }
    }
    
    return results;
  }

  /**
   * Execute agent with timeout
   */
  private async executeWithTimeout<TInput, TOutput>(
    agent: AgentDefinition<TInput, TOutput>,
    input: TInput,
    context: AgentContext,
    timeoutMs: number
  ): Promise<TOutput> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Subagent execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      agent.run(input, context)
        .then(output => {
          clearTimeout(timer);
          resolve(output);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}

/**
 * Helper function to create SubagentExecutor from context
 */
export function createSubagentExecutor(context: AgentContext): SubagentExecutor | null {
  // SubagentExecutor requires access to AgentRegistry
  // In practice, this would be passed through context or retrieved from a service locator
  // For now, return null as placeholder (agents can check for null before using)
  return null;
}
