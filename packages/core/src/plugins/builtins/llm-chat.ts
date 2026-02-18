import type { ToolContext, ToolDefinition } from '../registry.js';

export type LlmChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmChatInput = {
  messages: LlmChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type LlmChatOutput = {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

/**
 * LLM Chat tool: sends messages to Ollama (OpenAI-compatible API).
 * 
 * Requires environment variables:
 * - OLLAMA_BASE_URL (default: http://localhost:11434)
 * - OLLAMA_MODEL (default: gemma3:27b)
 * - OLLAMA_PROVIDER (default: ollama)
 */
export const llmChatTool: ToolDefinition<LlmChatInput, LlmChatOutput> = {
  id: 'llm.chat',
  description: 'Send chat messages to LLM (Ollama) for text generation.',
  permissions: {
    networkAllowlist: ['localhost:11434', '127.0.0.1:11434', 'localhost', '127.0.0.1'],
  },
  execute: async (input, ctx: ToolContext) => {
    if (!input.messages || input.messages.length === 0) {
      throw new Error('llm.chat: messages array is required and must not be empty');
    }

    // Read from env
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const defaultModel = process.env.OLLAMA_MODEL || 'gemma3:27b';
    const model = input.model || defaultModel;

    const apiUrl = `${baseUrl}/v1/chat/completions`;

    // Build request payload (OpenAI-compatible)
    const payload: Record<string, unknown> = {
      model,
      messages: input.messages,
      stream: false,
    };

    if (input.temperature !== undefined) {
      payload.temperature = input.temperature;
    }

    if (input.maxTokens !== undefined) {
      payload.max_tokens = input.maxTokens;
    }

    // Make the request
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `llm.chat failed: ${res.status} ${res.statusText}\n${errorText.substring(0, 500)}`
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      model?: string;
    };

    if (!data.choices || data.choices.length === 0 || !data.choices[0]?.message?.content) {
      throw new Error('llm.chat: No valid response from LLM (empty choices)');
    }

    const content = data.choices[0]!.message!.content;

    return {
      content,
      model: data.model || model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          }
        : undefined,
    };
  },
};
