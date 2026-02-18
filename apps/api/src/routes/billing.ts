/**
 * Stripe billing routes — checkout, portal, webhook.
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY       — Stripe secret key (sk_live_... / sk_test_...)
 *   STRIPE_WEBHOOK_SECRET   — Stripe webhook signing secret (whsec_...)
 *   STRIPE_PRICE_STARTER    — Stripe Price ID for the Starter plan
 *   STRIPE_PRICE_PRO        — Stripe Price ID for the Pro plan
 *   STRIPE_PRICE_TEAM       — Stripe Price ID for the Team plan
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { RawRequestDefaultExpression } from 'fastify';
import type { IncomingMessage } from 'node:http';

import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

// ── Stripe lazy singleton ─────────────────────────────────────────
type StripeInstance = Awaited<ReturnType<typeof importStripe>>;
let _stripe: StripeInstance | null = null;

async function importStripe() {
  const { default: Stripe } = await import('stripe');
  return new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30.basil' as any });
}

async function getStripe(): Promise<StripeInstance> {
  if (!_stripe) _stripe = await importStripe();
  return _stripe;
}

// Plan → Price ID mapping
const PLAN_PRICES: Record<string, string | undefined> = {
  starter: env.STRIPE_PRICE_STARTER,
  pro: env.STRIPE_PRICE_PRO,
  team: env.STRIPE_PRICE_TEAM,
};

// ── Schema ────────────────────────────────────────────────────────
const checkoutBodySchema = z.object({
  plan: z.enum(['starter', 'pro', 'team']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

// ── Routes ────────────────────────────────────────────────────────
export const billingRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * POST /api/billing/checkout
   * Creates a Stripe Checkout Session for the given plan.
   * Returns { url } — redirect the browser to this URL.
   */
  fastify.post(
    '/api/billing/checkout',
    {
      schema: {
        tags: ['billing'],
        description: 'Create a Stripe Checkout Session to subscribe to a plan.',
        body: {
          type: 'object',
          properties: {
            plan: { type: 'string', enum: ['starter', 'pro', 'team'] },
            successUrl: { type: 'string' },
            cancelUrl: { type: 'string' },
          },
          required: ['plan', 'successUrl', 'cancelUrl'],
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: { url: { type: 'string' } },
            required: ['url'],
          },
        },
      },
    },
    async (req, reply) => {
      if (!env.STRIPE_SECRET_KEY) {
        return (reply as any).code(503).send({ error: 'Stripe not configured' });
      }

      const input = checkoutBodySchema.parse(req.body ?? {});
      const priceId = PLAN_PRICES[input.plan];
      if (!priceId) {
        return (reply as any).code(400).send({ error: `No price configured for plan: ${input.plan}` });
      }

      const tenantId: string | undefined = (req as any).tenantId;
      const stripe = await getStripe();

      // Attempt to re-use an existing Stripe customer for this tenant
      let customer: string | undefined;
      if (tenantId) {
        const row = await pool.query(
          'SELECT stripe_customer_id FROM tenants WHERE id = $1 LIMIT 1',
          [tenantId],
        );
        customer = row.rows[0]?.stripe_customer_id ?? undefined;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        ...(customer ? { customer } : {}),
        metadata: { tenantId: tenantId ?? '', plan: input.plan },
      });

      return { url: session.url! };
    },
  );

  /**
   * POST /api/billing/portal
   * Creates a Stripe Customer Portal session (self-serve upgrade/downgrade).
   * Returns { url }.
   */
  fastify.post(
    '/api/billing/portal',
    {
      schema: {
        tags: ['billing'],
        description: 'Create a Stripe Customer Portal session.',
        body: {
          type: 'object',
          properties: {
            returnUrl: { type: 'string' },
          },
          required: ['returnUrl'],
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: { url: { type: 'string' } },
            required: ['url'],
          },
        },
      },
    },
    async (req, reply) => {
      if (!env.STRIPE_SECRET_KEY) {
        return (reply as any).code(503).send({ error: 'Stripe not configured' });
      }

      const body = (req.body ?? {}) as { returnUrl: string };
      const returnUrl = body.returnUrl;

      const tenantId: string | undefined = (req as any).tenantId;
      if (!tenantId) {
        return (reply as any).code(401).send({ error: 'Not authenticated' });
      }

      const row = await pool.query(
        'SELECT stripe_customer_id FROM tenants WHERE id = $1 LIMIT 1',
        [tenantId],
      );
      const customerId: string | undefined = row.rows[0]?.stripe_customer_id;
      if (!customerId) {
        return (reply as any).code(400).send({ error: 'No Stripe customer found for this tenant' });
      }

      const stripe = await getStripe();
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return { url: session.url };
    },
  );

  /**
   * POST /api/billing/webhook
   * Receives Stripe events. Validates signature, then handles:
   *   - checkout.session.completed → sets tenants.plan + stripe_customer_id
   *   - customer.subscription.updated / deleted → updates tenants.plan
   */
  fastify.post(
    '/api/billing/webhook',
    {
      config: {
        // Disable body parsing — we need raw body for signature verification
        rawBody: true,
      },
      schema: {
        tags: ['billing'],
        description: 'Stripe webhook receiver (signature verified).',
        response: {
          200: {
            type: 'object',
            properties: { received: { type: 'boolean' } },
            required: ['received'],
          },
        },
      },
    },
    async (req, reply) => {
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
        return (reply as any).code(503).send({ error: 'Stripe not configured' });
      }

      const sig = req.headers['stripe-signature'];
      if (!sig || typeof sig !== 'string') {
        return (reply as any).code(400).send({ error: 'Missing stripe-signature header' });
      }

      // @fastify/rawbody adds req.rawBody; fall back to reading body as Buffer
      const rawBody: Buffer | string =
        (req as any).rawBody ??
        (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

      const stripe = await getStripe();
      let event: Awaited<ReturnType<typeof stripe.webhooks.constructEventAsync>>;
      try {
        event = await stripe.webhooks.constructEventAsync(rawBody, sig, env.STRIPE_WEBHOOK_SECRET!);
      } catch (err) {
        req.log.warn({ err }, 'Stripe webhook signature verification failed');
        return (reply as any).code(400).send({ error: 'Invalid signature' });
      }

      // ── Event handlers ───────────────────────────────────────────
      try {
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object as {
            metadata?: { tenantId?: string; plan?: string };
            customer?: string;
            subscription?: string;
          };
          const tenantId = session.metadata?.tenantId;
          const customerId = session.customer;
          if (tenantId && customerId) {
            await pool.query(
              `UPDATE tenants
               SET stripe_customer_id = $2, updated_at = now()
               WHERE id = $1`,
              [tenantId, customerId],
            );
          }

          const subscriptionId = session.subscription;
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await handleSubscriptionChange(subscription as StripeSubscription);
          } else if (tenantId && customerId) {
            const plan = session.metadata?.plan ?? 'starter';
            await pool.query(
              `UPDATE tenants SET plan = $2, updated_at = now() WHERE id = $1`,
              [tenantId, plan],
            );
          }
        } else if (event.type === 'customer.subscription.updated') {
          await handleSubscriptionChange(event.data.object as StripeSubscription);
        } else if (event.type === 'customer.subscription.deleted') {
          await handleSubscriptionChange(event.data.object as StripeSubscription, true);
        }
      } catch (err) {
        req.log.error({ err, eventType: event.type }, 'Stripe webhook handler error');
        // Return 200 so Stripe does not retry transient errors indefinitely;
        // surface in logs/alerting instead.
      }

      return { received: true };
    },
  );
};

// ── Helpers ───────────────────────────────────────────────────────
interface StripeSubscription {
  customer: string;
  status: string;
  items?: { data?: Array<{ price?: { id?: string } }> };
}

async function handleSubscriptionChange(sub: StripeSubscription, deleted = false): Promise<void> {
  const customerId = sub.customer;
  if (!customerId) return;

  // Map Stripe price → plan name
  const priceId = sub.items?.data?.[0]?.price?.id;
  let newPlan = 'starter';
  if (!deleted && priceId) {
    for (const [plan, pid] of Object.entries(PLAN_PRICES)) {
      if (pid === priceId) { newPlan = plan; break; }
    }
  }

  await pool.query(
    `UPDATE tenants SET plan = $2, updated_at = now() WHERE stripe_customer_id = $1`,
    [customerId, newPlan],
  );
}
