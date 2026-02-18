import 'dotenv/config';

import { createRedisConnection, EventBus, postSlackWebhook } from '@aiseo/core';

import { env } from '../config/env.js';

async function main() {
  const tenantId = process.argv[2] ?? env.DEFAULT_TENANT_ID;
  if (!tenantId) {
    throw new Error('Missing tenantId (argv[2] or DEFAULT_TENANT_ID)');
  }

  if (!env.SLACK_WEBHOOK_URL) {
    throw new Error('Missing SLACK_WEBHOOK_URL');
  }

  const redis = createRedisConnection({ url: env.REDIS_URL });
  const bus = new EventBus({ redis, prefix: 'aiseo' });

  const subscription = bus.subscribe(tenantId, (event) => {
    const text = [
      `*[AISEO]* ${event.type}`,
      `tenant=${event.tenantId}`,
      event.projectId ? `project=${event.projectId}` : undefined,
      `seq=${event.seq}`,
    ]
      .filter(Boolean)
      .join(' | ');

    void postSlackWebhook(env.SLACK_WEBHOOK_URL as string, { text }).catch(() => {
      // best-effort in dev script
    });
  });

  await subscription.start();
  // eslint-disable-next-line no-console
  console.log(`[notification-hub] slack subscribed tenant=${tenantId}`);

  process.on('SIGINT', async () => {
    await subscription.stop();
    redis.disconnect();
    process.exit(0);
  });
}

await main();
