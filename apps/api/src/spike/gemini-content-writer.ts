import 'dotenv/config';

import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';

import { google } from '@ai-sdk/google';
import { stepCountIs, streamText, tool } from 'ai';

import { env } from '../config/env.js';

const requestSchema = z.object({
  topic: z.string().min(3),
  locale: z.string().default('zh-TW'),
  audience: z.string().default('SEO team'),
});

function sseHeaders(reply: FastifyReply) {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

function sseSend(reply: FastifyReply, event: string, data: unknown) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delayMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastError;
}

export const geminiContentWriterSpikeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/spike/gemini/content-writer', async (req, reply) => {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      reply.code(400);
      return {
        ok: false,
        error: 'Missing GOOGLE_GENERATIVE_AI_API_KEY in env',
      };
    }

    const input = requestSchema.parse(req.body ?? {});

    sseHeaders(reply);
    sseSend(reply, 'meta', {
      model: env.GEMINI_MODEL,
      input,
      ts: Date.now(),
    });

    const model = google(env.GEMINI_MODEL);

    // Safe deterministic toolchain stub, designed to validate multi-round tool calling.
    const tools = {
      serp_structure: tool({
        description: 'Return a deterministic mock SERP structure summary for the given topic.',
        inputSchema: z.object({
          topic: z.string().min(1),
          locale: z.string().min(1),
        }),
        execute: async (input) => {
          const { topic, locale } = input;
          return {
            locale,
            topic,
            topHeadings: [
              '什麼是…（定義）',
              '為什麼重要（價值/情境）',
              '步驟教學（How-to）',
              '常見問題（FAQ）',
            ],
            intentMix: { informational: 0.7, commercial: 0.3 },
          };
        },
      }),
      seo_guardrails: tool({
        description: 'Validate basic SEO constraints and return a score + issues.',
        inputSchema: z.object({
          draft: z.string().min(1),
          targetKeyword: z.string().min(1),
        }),
        execute: async (input) => {
          const { draft, targetKeyword } = input;
          const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
          const occurrences = (draft.match(new RegExp(targetKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) ?? [])
            .length;
          const density = wordCount === 0 ? 0 : (occurrences / wordCount) * 100;

          const issues: string[] = [];
          if (wordCount < 400) issues.push('內容偏短（建議 > 400 words）');
          if (density < 0.5) issues.push('關鍵字密度偏低');
          if (density > 3.0) issues.push('關鍵字密度偏高');

          const score = Math.max(0, 100 - issues.length * 15);

          return { wordCount, occurrences, density, score, issues };
        },
      }),
    };

    const system = [
      '你是企業級 SEO 平台的 content-writer（Spike）。',
      '目標：用多輪 tool use 產出一篇「可審核」的草稿，並在過程中使用 tools 取得 SERP 結構與 SEO guardrails 檢查。',
      '規則：必須至少呼叫 2 次工具（serp_structure + seo_guardrails），並根據工具結果修正輸出。',
      '輸出：最後用 Markdown 回傳：H1、3-5 個 H2、FAQ（3 題），以及 meta title/meta description。',
    ].join('\n');

    const prompt = [
      {
        role: 'user' as const,
        content: `Topic: ${input.topic}\nLocale: ${input.locale}\nAudience: ${input.audience}`,
      },
    ];

    const startedAt = Date.now();
    let stepIndex = 0;

    const result = await withRetry(
      async () =>
        streamText({
          model,
          system,
          messages: prompt,
          tools,
          // Force a deterministic multi-round tool-use sequence for Spike validation:
          // 1) SERP structure
          // 2) Draft (model)
          // 3) SEO guardrails
          // 4) Revise (model)
          // 5) SEO guardrails again
          // 6) Final output (model)
          prepareStep: async ({ stepNumber }) => {
            if (stepNumber === 1) {
              return {
                toolChoice: { type: 'tool', toolName: 'serp_structure' } as unknown as {
                  type: 'tool';
                  toolName: 'serp_structure';
                },
              };
            }

            if (stepNumber === 3 || stepNumber === 5) {
              return {
                toolChoice: { type: 'tool', toolName: 'seo_guardrails' } as unknown as {
                  type: 'tool';
                  toolName: 'seo_guardrails';
                },
              };
            }

            return undefined;
          },
          stopWhen: stepCountIs(6),
          temperature: 0.4,
          onStepFinish: (step) => {
            stepIndex += 1;
            // Emit step-level telemetry for validation.
            sseSend(reply, 'step', {
              stepNumber: stepIndex,
              finishReason: step.finishReason,
              toolCalls: step.toolCalls?.map((c) => ({ toolName: c.toolName })) ?? [],
              toolResultsCount: step.toolResults?.length ?? 0,
              usage: step.usage,
            });
          },
        }),
      3,
    );

    // Stream text chunks as SSE.
    try {
      for await (const chunk of result.textStream) {
        sseSend(reply, 'chunk', { chunk });
      }

      const totalUsage = await result.totalUsage;
      const steps = await result.steps;
      const finishedAt = Date.now();

      sseSend(reply, 'usage', {
        totalUsage,
        steps: steps.map((s, idx) => ({
          stepNumber: idx + 1,
          finishReason: s.finishReason,
          toolCalls: s.toolCalls?.map((c) => c.toolName) ?? [],
          usage: s.usage,
        })),
        durationMs: finishedAt - startedAt,
      });
      sseSend(reply, 'done', { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sseSend(reply, 'error', { message });
    } finally {
      reply.raw.end();
    }

    return reply;
  });
};
