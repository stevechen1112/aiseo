import type { SerpProvider, SerpQuery, SerpRankResult } from './types.js';
import { mockSerpProvider } from './providers/mock.js';
import { ValueSerpProvider } from './providers/valueserp.js';
import { ScaleSerpProvider } from './providers/scaleserp.js';
import { GoogleSearchConsoleProvider } from './providers/gsc.js';
import { SelfHostedCrawlerProvider } from './providers/crawler.js';

export type SerpClientOptions = {
  provider?: 'mock' | 'valueserp' | 'scaleserp' | 'gsc' | 'crawler';
  valueSerpApiKey?: string;
  scaleSerpApiKey?: string;
  gscApiKey?: string;
  gscSiteUrl?: string;
};

export class SerpClient {
  private readonly provider: SerpProvider;

  constructor(options: SerpClientOptions = {}) {
    const providerType = options.provider ?? 'mock';

    switch (providerType) {
      case 'valueserp': {
        if (!options.valueSerpApiKey) {
          throw new Error('ValueSERP API key is required for valueserp provider');
        }
        this.provider = new ValueSerpProvider(options.valueSerpApiKey);
        break;
      }
      case 'scaleserp': {
        if (!options.scaleSerpApiKey) {
          throw new Error('ScaleSERP API key is required for scaleserp provider');
        }
        this.provider = new ScaleSerpProvider(options.scaleSerpApiKey);
        break;
      }
      case 'gsc': {
        if (!options.gscApiKey || !options.gscSiteUrl) {
          throw new Error('GSC API key and site URL are required for gsc provider');
        }
        this.provider = new GoogleSearchConsoleProvider(options.gscApiKey, options.gscSiteUrl);
        break;
      }
      case 'crawler': {
        this.provider = new SelfHostedCrawlerProvider();
        break;
      }
      case 'mock':
      default:
        this.provider = mockSerpProvider;
        break;
    }
  }

  async getRank(query: SerpQuery): Promise<SerpRankResult> {
    return await this.provider.getRank(query);
  }
}
