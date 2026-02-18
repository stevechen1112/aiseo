import { createHash } from 'node:crypto';

import type { SerpProvider, SerpQuery, SerpRankResult } from '../types.js';

function stableRank(input: string) {
  const hex = createHash('sha256').update(input).digest('hex');
  const n = parseInt(hex.slice(0, 8), 16);
  return (n % 50) + 1; // 1..50
}

export const mockSerpProvider: SerpProvider = {
  id: 'mock',
  async getRank(query: SerpQuery): Promise<SerpRankResult> {
    const keyword = query.keyword.trim();
    const locale = query.locale ?? 'zh-TW';
    const domain = query.domain;

    const rank = stableRank(`${keyword}|${locale}|${domain ?? ''}`);

    return {
      provider: 'mock',
      keyword,
      locale,
      domain,
      rank,
      resultUrl: `https://example.com/?q=${encodeURIComponent(keyword)}`,
    };
  },
};
