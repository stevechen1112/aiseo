import { createRedisConnection } from '@aiseo/core';

import { env } from './config/env.js';

export type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
};

let redis: RedisLike | null = null;

export function getRedis(): RedisLike {
  if (!redis) {
    redis = createRedisConnection({ url: env.REDIS_URL }) as unknown as RedisLike;
  }
  return redis;
}

export async function getJsonCache<T>(key: string): Promise<T | null> {
  const value = await getRedis().get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function setJsonCache(key: string, value: unknown, ttlSeconds: number) {
  const payload = JSON.stringify(value);
  await getRedis().set(key, payload, 'EX', ttlSeconds);
}
