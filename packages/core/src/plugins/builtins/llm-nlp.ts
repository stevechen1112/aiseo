import type { ToolContext, ToolDefinition } from '../registry.js';

export type LlmNlpAnalyzeInput = {
  text: string;
  features?: Array<'entities' | 'sentiment' | 'keywords' | 'topics'>;
  language?: string;
};

export type LlmNlpEntity = {
  name: string;
  type: string; // PERSON | ORGANIZATION | LOCATION | PRODUCT | CONCEPT | TECHNOLOGY
  salience: number; // 0-1, importance score
  mentions: number;
  sentiment?: number; // -1 to 1
};

export type LlmNlpAnalyzeOutput = {
  entities: LlmNlpEntity[];
  language: string;
  sentiment?: {
    score: number; // -1 (negative) to 1 (positive)
    magnitude: number; // 0-1, strength of sentiment
    label: 'positive' | 'negative' | 'neutral';
  };
  keywords?: string[]; // Additional extracted keywords
  topics?: string[]; // Main topics/themes
};

/**
 * LLM-based NLP Analysis Tool
 * 
 * Uses local LLM (Ollama) to perform NLP tasks that would traditionally
 * require Google Cloud Natural Language API.
 * 
 * Advantages over Google NLP:
 * - Zero cost (runs locally)
 * - More flexible (customizable prompts)
 * - Better multilingual support (especially Chinese)
 * - Privacy (no data sent to cloud)
 */
export const llmNlpAnalyzeTool: ToolDefinition<LlmNlpAnalyzeInput, LlmNlpAnalyzeOutput> = {
  id: 'llm.nlp.analyze',
  description: 'Analyze text using LLM for entity extraction, sentiment analysis, keyword extraction, and topic modeling',
  permissions: {
    networkAllowlist: ['localhost:11434'], // Ollama
    fileSystem: 'read-only',
  },
  execute: async (input: LlmNlpAnalyzeInput, ctx: ToolContext): Promise<LlmNlpAnalyzeOutput> => {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'gemma3:27b';

    const text = input.text.trim();
    if (!text) {
      throw new Error('text is required');
    }

    const features = input.features ?? ['entities'];
    const language = input.language ?? 'zh-TW';

    // Build prompt based on requested features
    let systemPrompt = 'You are an expert NLP analyst. Analyze the given text and extract structured information in JSON format.';
    let userPrompt = `Analyze this text and provide results in JSON format:\n\n"${text}"\n\n`;

    if (features.includes('entities')) {
      userPrompt += `
Extract all important entities with the following structure:
{
  "entities": [
    {
      "name": "entity name",
      "type": "PERSON | ORGANIZATION | LOCATION | PRODUCT | CONCEPT | TECHNOLOGY | EVENT",
      "salience": 0.0-1.0 (importance score, most important = 1.0),
      "mentions": number of times mentioned
    }
  ]
}
`;
    }

    if (features.includes('sentiment')) {
      userPrompt += `
Analyze the overall sentiment:
{
  "sentiment": {
    "score": -1.0 to 1.0 (-1=very negative, 0=neutral, 1=very positive),
    "magnitude": 0.0 to 1.0 (strength of emotion),
    "label": "positive" | "neutral" | "negative"
  }
}
`;
    }

    if (features.includes('keywords')) {
      userPrompt += `
Extract 5-10 important keywords:
{
  "keywords": ["keyword1", "keyword2", ...]
}
`;
    }

    if (features.includes('topics')) {
      userPrompt += `
Identify main topics/themes:
{
  "topics": ["topic1", "topic2", ...]
}
`;
    }

    userPrompt += '\nIMPORTANT: Return ONLY valid JSON, no explanation text.';

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1, // Low temperature for consistent structured output
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: { content?: string };
        }>;
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No response from LLM');
      }

      // Extract JSON from response (handle markdown code blocks)
      let jsonText = content.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonText) as Partial<LlmNlpAnalyzeOutput>;

      // Build output
      const output: LlmNlpAnalyzeOutput = {
        entities: parsed.entities ?? [],
        language: language,
        sentiment: parsed.sentiment,
        keywords: parsed.keywords,
        topics: parsed.topics,
      };

      // Normalize salience scores (ensure they sum to 1.0)
      if (output.entities.length > 0) {
        const totalSalience = output.entities.reduce((sum, e) => sum + (e.salience || 0), 0);
        if (totalSalience > 0) {
          output.entities.forEach((e) => {
            e.salience = (e.salience || 0) / totalSalience;
          });
        }
      }

      return output;
    } catch (error) {
      // Fallback: basic keyword extraction
      // Simple fallback: split text into words and extract potential entities
      const words = text
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 10);

      return {
        entities: words.map((word, idx) => ({
          name: word,
          type: 'CONCEPT',
          salience: 1.0 / words.length,
          mentions: 1,
        })),
        language: language,
      };
    }
  },
};
