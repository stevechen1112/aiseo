import type { Redis } from 'ioredis';
import type { SerpQuery, SerpRankResult } from './types.js';
import { SerpClient, type SerpClientOptions } from './client.js';
import { withRedisCache, cacheKey } from '../cache/redis-cache.js';

const DEFAULT_SERP_CACHE_TTL_SECS = 6 * 60 * 60; // 6 hours — SERP rankings shift slowly

/**
 * A SerpClient wrapper that caches rank results in Redis.
 *
 * Cache key format: `aiseo:serp:<keyword>:<location>:<device>`
 * TTL: 6 hours by default (configurable via `cacheTtlSecs`).
 */
export class CachedSerpClient {
  private readonly inner: SerpClient;
  private readonly redis: Redis;
  private readonly ttl: number;

  constructor(options: SerpClientOptions & { redis: Redis; cacheTtlSecs?: number }) {
    const { redis, cacheTtlSecs, ...serpOptions } = options;
    this.inner = new SerpClient(serpOptions);
    this.redis = redis;
    this.ttl = cacheTtlSecs ?? DEFAULT_SERP_CACHE_TTL_SECS;
  }

  async getRank(query: SerpQuery): Promise<SerpRankResult> {
    const key = cacheKey('aiseo:serp', {
      keyword: query.keyword,
      location: query.location ?? '',
      device: query.device ?? '',
      targetUrl: query.targetUrl ?? '',
    });

    return withRedisCache(this.redis, key, this.ttl, () => this.inner.getRank(query));
  }
}
