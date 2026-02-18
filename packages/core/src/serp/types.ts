export type SerpQuery = {
  keyword: string;
  locale?: string;
  domain?: string;
  location?: string;
  device?: string;
  targetUrl?: string;
};

export type SerpRankResult = {
  provider: string;
  keyword: string;
  locale: string;
  domain?: string;
  rank: number;
  resultUrl?: string;
};

export type SerpProvider = {
  id: string;
  getRank: (query: SerpQuery) => Promise<SerpRankResult>;
};
