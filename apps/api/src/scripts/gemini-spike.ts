import 'dotenv/config';

import { google } from '@ai-sdk/google';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

const modelName = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';

const model = google(modelName);

const tools = {
  serp_structure: tool({
    description: 'Return a deterministic mock SERP structure summary for the given topic.',
    inputSchema: z.object({ topic: z.string(), locale: z.string() }),
    execute: async (input) => ({
      topic: input.topic,
      locale: input.locale,
      topHeadings: ['定義', '重要性', '步驟', 'FAQ'],
    }),
  }),
};

async function main() {
  const topic = process.argv.slice(2).join(' ') || '企業 SEO 平台怎麼規劃';
  let stepIndex = 0;

  const result = await streamText({
    model,
    system: [
      '你是 content-writer（Spike）。',
      '流程：先呼叫 serp_structure 工具取得 SERP 結構，再輸出 Markdown 大綱。',
    ].join('\n'),
    messages: [{ role: 'user', content: `topic=${topic}; locale=zh-TW` }],
    tools,
    prepareStep: async ({ stepNumber }) => {
      if (stepNumber === 1) {
        return {
          toolChoice: { type: 'tool', toolName: 'serp_structure' } as unknown as {
            type: 'tool';
            toolName: 'serp_structure';
          },
        };
      }
      return undefined;
    },
    stopWhen: stepCountIs(4),
    temperature: 0.4,
    onStepFinish: (step) => {
      stepIndex += 1;
      // eslint-disable-next-line no-console
      console.error(
        `[step ${stepIndex}] finish=${step.finishReason} toolCalls=${(step.toolCalls ?? [])
          .map((c) => c.toolName)
          .join(',')}`,
      );
    },
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  const totalUsage = await result.totalUsage;
  const steps = await result.steps;
  process.stderr.write(`\n\n[totalUsage] ${JSON.stringify(totalUsage)}\n`);
  process.stderr.write(
    `[steps] ${JSON.stringify(
      steps.map((s, idx) => ({
        stepNumber: idx + 1,
        finishReason: s.finishReason,
        toolCalls: s.toolCalls?.map((c) => c.toolName) ?? [],
        usage: s.usage,
      })),
    )}\n`,
  );
}

await main();
