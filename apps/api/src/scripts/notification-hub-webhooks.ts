import 'dotenv/config';

import pg from 'pg';
import { createRedisConnection, EventBus } from '@aiseo/core';
import crypto from 'node:crypto';

import { env } from '../config/env.js';
import { assertSafeOutboundUrl } from '../utils/ssrf.js';
import { decryptSecret, requireEncryptionSecret } from '../utils/crypto-secrets.js';

const databaseUrl = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL (or DATABASE_URL_MIGRATION)');
}

const pool = new pg.Pool({ connectionString: databaseUrl });

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function shouldDeliver(configuredEvents: string[], eventType: string) {
  // If empty, treat as "all events".
  if (configuredEvents.length === 0) return true;
  return configuredEvents.includes(eventType);
}

async function withTenantContext(client: pg.PoolClient, tenantId: string) {
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
}

async function loadWebhooks(client: pg.PoolClient, tenantId: string) {
  await withTenantContext(client, tenantId);
  const row = await client.query(
    `SELECT id, url, events, enabled, secret_ciphertext, secret_iv, secret_tag
     FROM webhooks
     WHERE tenant_id = $1 AND enabled = true
     ORDER BY updated_at DESC, created_at DESC`,
    [tenantId],
  );

  return row.rows.map((r: any) => ({
    id: String(r.id),
    url: String(r.url),
    events: asStringArray(r.events),
    secret:
      r.secret_ciphertext && r.secret_iv && r.secret_tag
        ? ({ ciphertext: String(r.secret_ciphertext), iv: String(r.secret_iv), tag: String(r.secret_tag) } as const)
        : null,
  }));
}

async function recordDelivery(client: pg.PoolClient, input: {
  tenantId: string;
  webhookId: string;
  eventType: string;
  eventSeq?: number;
  payload: unknown;
  ok: boolean;
  statusCode?: number;
  error?: string;
}) {
  await withTenantContext(client, input.tenantId);

  await client.query(
    `INSERT INTO webhook_deliveries (tenant_id, webhook_id, event_type, event_seq, payload, status_code, ok, error)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
    [
      input.tenantId,
      input.webhookId,
      input.eventType,
      input.eventSeq ?? null,
      JSON.stringify(input.payload ?? {}),
      input.statusCode ?? null,
      input.ok,
      input.error ?? null,
    ],
  );
}

function signBody(secret: string, ts: string, body: string) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(ts);
  hmac.update('.');
  hmac.update(body);
  return hmac.digest('hex');
}

async function deliverOnce(webhookUrl: string, body: unknown, signingSecret: string | null) {
  await assertSafeOutboundUrl(webhookUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const ts = String(Date.now());
    const bodyString = JSON.stringify(body);
    const signature = signingSecret ? signBody(signingSecret, ts, bodyString) : null;

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'aiseo-notification-hub/1.0',
        ...(signature
          ? {
              'x-aiseo-timestamp': ts,
              'x-aiseo-signature': `sha256=${signature}`,
            }
          : {}),
      },
      body: bodyString,
      signal: controller.signal,
    });

    return { ok: res.ok, statusCode: res.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const arg = args[0];

  const redis = createRedisConnection({ url: env.REDIS_URL });
  const bus = new EventBus({ redis, prefix: 'aiseo' });

  const onEvent = async (tenantId: string, event: any) => {
    const db = await pool.connect();
    try {
      const hooks = await loadWebhooks(db, tenantId);
      if (hooks.length === 0) return;

      const encryptionSecret = (() => {
        try {
          return requireEncryptionSecret();
        } catch {
          return null;
        }
      })();

      const payload = {
        tenantId: event.tenantId,
        projectId: event.projectId ?? null,
        type: event.type,
        seq: event.seq,
        ts: event.timestamp,
        payload: event.payload ?? {},
      };

      for (const hook of hooks) {
        if (!shouldDeliver(hook.events, event.type)) continue;

        const signingSecret =
          hook.secret && encryptionSecret
            ? decryptSecret(
                { ciphertext: hook.secret.ciphertext, iv: hook.secret.iv, tag: hook.secret.tag },
                encryptionSecret,
              )
            : null;

        try {
          const res = await deliverOnce(hook.url, payload, signingSecret);
          await recordDelivery(db, {
            tenantId,
            webhookId: hook.id,
            eventType: event.type,
            eventSeq: Number(event.seq ?? 0) || undefined,
            payload,
            ok: res.ok,
            statusCode: res.statusCode,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await recordDelivery(db, {
            tenantId,
            webhookId: hook.id,
            eventType: event.type,
            eventSeq: Number(event.seq ?? 0) || undefined,
            payload,
            ok: false,
            error: message,
          });
        }
      }
    } finally {
      db.release();
    }
  };

  const subscription =
    arg === 'all' || arg === '--all'
      ? bus.subscribeAll(async (event) => onEvent(String(event.tenantId ?? ''), event))
      : bus.subscribe(arg ?? env.DEFAULT_TENANT_ID ?? '', async (event) => onEvent(String((event as any).tenantId ?? ''), event));

  if (!subscription || (!arg && !env.DEFAULT_TENANT_ID && (arg !== 'all' && arg !== '--all'))) {
    throw new Error('Missing tenantId (argv[2] or DEFAULT_TENANT_ID), or use "all"');
  }

  await subscription.start();
  // eslint-disable-next-line no-console
  console.log(`[notification-hub] webhooks subscribed mode=${arg === 'all' || arg === '--all' ? 'all' : 'single'}`);

  process.on('SIGINT', async () => {
    await subscription.stop();
    redis.disconnect();
    await pool.end();
    process.exit(0);
  });
}

await main();
