import type { ToolContext, ToolDefinition } from '../registry.js';
import { assertUrlHostAllowed, getEffectiveNetworkAllowlist } from '../registry.js';

export type GoogleNlpAnalyzeInput = {
  text: string;
  features?: Array<'entities' | 'sentiment' | 'syntax'>;
};

export type GoogleNlpEntity = {
  name: string;
  type: string;
  salience: number;
  mentions: number;
  sentiment?: number;
};

export type GoogleNlpAnalyzeOutput = {
  entities: GoogleNlpEntity[];
  language: string;
  sentiment?: {
    score: number;
    magnitude: number;
  };
};

export const googleNlpAnalyzeTool: ToolDefinition<GoogleNlpAnalyzeInput, GoogleNlpAnalyzeOutput> = {
  id: 'google.nlp.analyze',
  description: 'Analyze text using Google Natural Language API for entity extraction, sentiment, and syntax analysis',
  permissions: {
    networkAllowlist: ['language.googleapis.com'],
    fileSystem: 'read-only',
  },
  execute: async (input: GoogleNlpAnalyzeInput, ctx: ToolContext): Promise<GoogleNlpAnalyzeOutput> => {
    const apiKey = process.env.GOOGLE_NLP_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_NLP_API_KEY environment variable is not set');
    }

    const text = input.text.trim();
    if (!text) {
      throw new Error('text is required');
    }

    const features = input.features ?? ['entities'];
    const url = `https://language.googleapis.com/v1/documents:annotateText?key=${apiKey}`;

    const urlObj = new URL(url);
    const effectiveAllowlist = getEffectiveNetworkAllowlist(googleNlpAnalyzeTool.permissions, ctx);
    assertUrlHostAllowed(urlObj, effectiveAllowlist);

    const requestBody = {
      document: {
        type: 'PLAIN_TEXT',
        content: text,
      },
      features: {
        extractEntities: features.includes('entities'),
        extractDocumentSentiment: features.includes('sentiment'),
        extractSyntax: features.includes('syntax'),
      },
      encodingType: 'UTF8',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google NLP API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as {
        entities?: Array<{
          name: string;
          type: string;
          salience: number;
          mentions?: Array<unknown>;
          sentiment?: {
            score: number;
          };
        }>;
        documentSentiment?: {
          score: number;
          magnitude: number;
        };
        language: string;
      };

      const entities: GoogleNlpEntity[] = (data.entities ?? []).map((entity) => ({
        name: entity.name,
        type: entity.type,
        salience: entity.salience,
        mentions: entity.mentions?.length ?? 0,
        sentiment: entity.sentiment?.score,
      }));

      return {
        entities,
        language: data.language,
        sentiment: data.documentSentiment,
      };
    } catch (error) {
      throw new Error(
        `Failed to analyze text with Google NLP: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};
