import IORedis from 'ioredis';

export type RedisConnectionOptions = {
  url: string;
};

export function createRedisConnection(options: RedisConnectionOptions) {
  const url = (() => {
    try {
      const parsed = new URL(options.url);
      if (parsed.hostname === 'localhost') {
        parsed.hostname = '127.0.0.1';
        return parsed.toString();
      }
    } catch {
      // Fall back to raw value.
    }
    return options.url;
  })();

  const redis = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  // Avoid unhandled 'error' events taking down the process.
  redis.on('error', () => {
    // Intentionally no-op; callers can add their own logging/metrics.
  });

  return redis;
}
