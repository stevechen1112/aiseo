import 'dotenv/config';

import { STATUS_CODES } from 'node:http';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import helmet from '@fastify/helmet';
import type { RawData } from 'ws';
import jwt from 'jsonwebtoken';

import { env } from './config/env.js';
import { addTenantRlsHooks } from './middleware/index.js';
import { geminiContentWriterSpikeRoute } from './spike/index.js';
import {
  agentsRoutes,
  alertsRoutes,
  authRoutes,
  auditRoutes,
  backlinksRoutes,
  backupRoutes,
  reportsRoutes,
  cmsRoutes,
  contentRoutes,
  dashboardRoutes,
  devRoutes,
  eventsRoutes,
  flowsRoutes,
  apiKeysRoutes,
  keywordsRoutes,
  notificationsRoutes,
  projectsRoutes,
  rbacRoutes,
  reportScheduleRoutes,
  reviewRoutes,
  schedulesRoutes,
  serpRoutes,
  serpScheduleRoutes,
  webhooksRoutes,
  workflowsRoutes,
  tenantsRoutes,
  platformTenantsRoutes,
} from './routes/index.js';

import { createRedisConnection, EventBus } from '@aiseo/core';

const port = env.PORT;

const fastify = Fastify({
  logger: true,
});

// Basic security headers (Phase 4 - 5.9)
await fastify.register(helmet, { global: true });

// Ensure consistent JSON error responses and expose quota details for 429.
fastify.setErrorHandler((error, _req, reply) => {
  const statusCode = (error as any)?.statusCode ? Number((error as any).statusCode) : 500;
  const isProd = env.NODE_ENV === 'production';
  const payload: Record<string, unknown> = {
    statusCode,
    error: STATUS_CODES[statusCode] ?? 'Error',
    message:
      statusCode >= 500 && isProd
        ? 'Internal Server Error'
        : (error as any)?.message
          ? String((error as any).message)
          : 'Request failed',
  };

  if (statusCode === 429 && (error as any)?.code === 'QUOTA_EXCEEDED') {
    payload.kind = (error as any)?.kind ?? 'quota_exceeded';
    payload.quota = (error as any)?.quota;
  }

  reply.code(statusCode).send(payload);
});

await fastify.register(websocket);

// OpenAPI / Swagger (Phase 4 - 5.5.1)
await fastify.register(swagger, {
  openapi: {
    info: {
      title: 'AISEO API',
      version: '1.0.0',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
});

await fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false,
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
});

// Stable OpenAPI JSON endpoint (useful for CI/export).
fastify.get('/openapi.json', async () => {
  return fastify.swagger();
});

// Global DB + RLS context hooks (must be applied at root scope).
addTenantRlsHooks(fastify);

await fastify.register(geminiContentWriterSpikeRoute);
await fastify.register(flowsRoutes);
await fastify.register(schedulesRoutes);
await fastify.register(eventsRoutes);
await fastify.register(agentsRoutes);
await fastify.register(dashboardRoutes);
await fastify.register(keywordsRoutes);
await fastify.register(contentRoutes);
await fastify.register(alertsRoutes);
await fastify.register(workflowsRoutes);
await fastify.register(auditRoutes);
await fastify.register(backlinksRoutes);
await fastify.register(reportsRoutes);
await fastify.register(projectsRoutes);
await fastify.register(apiKeysRoutes);
await fastify.register(notificationsRoutes);
await fastify.register(rbacRoutes);
await fastify.register(backupRoutes);
await fastify.register(serpRoutes);
await fastify.register(serpScheduleRoutes, { prefix: '/api/serp' });
await fastify.register(authRoutes);
await fastify.register(reviewRoutes);
await fastify.register(cmsRoutes);
await fastify.register(reportScheduleRoutes);
await fastify.register(webhooksRoutes);
await fastify.register(devRoutes);

// Phase 4
await fastify.register(tenantsRoutes);
await fastify.register(platformTenantsRoutes);

fastify.get('/health', async () => {
  return { ok: true };
});

fastify.get('/ws', { websocket: true }, (connection) => {
  connection.send(JSON.stringify({ type: 'hello', ts: Date.now() }));

  connection.on('message', (raw: RawData) => {
    connection.send(raw);
  });
});

// Tenant-scoped event stream for Dashboard.
fastify.get('/ws/events', { websocket: true }, async (connection, req) => {
  try {
    const rawUrl = req.raw?.url ?? req.url;
    const url = new URL(rawUrl, 'http://localhost');
    const tokenFromQuery = url.searchParams.get('token') ?? undefined;
    const authHeader = req.headers.authorization;
    const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = tokenFromQuery ?? bearer;

    if (!token) {
      connection.close();
      return;
    }

    const secret = env.JWT_SECRET ?? 'aiseo-jwt-dev-secret-change-in-production';
    let decoded: { tenantId: string; emailVerified?: boolean };
    try {
      decoded = jwt.verify(token, secret) as any;
    } catch {
      connection.close();
      return;
    }

    if (env.NODE_ENV === 'production' && !(decoded as any).emailVerified) {
      connection.close();
      return;
    }

    const tenantId = String((decoded as any).tenantId ?? '');
    if (!tenantId) {
      connection.close();
      return;
    }

    fastify.log.info({ tenantId }, 'ws/events connected');

    const redis = createRedisConnection({ url: env.REDIS_URL });
    const bus = new EventBus({ redis, prefix: 'aiseo' });
    const subscription = bus.subscribe(tenantId, (event) => {
      connection.send(JSON.stringify(event));
    });

    await subscription.start();
    fastify.log.info({ tenantId }, 'ws/events subscription started');

    connection.on('close', async () => {
      await subscription.stop();
      redis.disconnect();
      fastify.log.info({ tenantId }, 'ws/events disconnected');
    });
  } catch (err) {
    fastify.log.error({ err }, 'ws/events handler error');
    try {
      connection.close();
    } catch {
      // ignore
    }
  }
});

await fastify.listen({ port, host: '0.0.0.0' });
