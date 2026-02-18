import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

async function requireDb(req: { dbClient?: import('pg').PoolClient }) {
  if (!req.dbClient) {
    const error = new Error('DB not available');
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return req.dbClient;
}

const tenantStatusSchema = z.enum(['active', 'disabled', 'deleted']);

const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  plan: z.string().min(1).max(50).optional(),
});

const updateTenantSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    slug: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case')
      .optional(),
    plan: z.string().min(1).max(50).optional(),
    status: tenantStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

const tenantIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const platformTenantsRoutes: FastifyPluginAsync = async (fastify) => {
  // NOTE: Authorization is enforced in tenant-rls middleware via PLATFORM_ADMIN_SECRET.

  fastify.get(
    '/api/platform/tenants',
    {
      schema: {
        tags: ['platform'],
        description:
          'List all tenants (platform admin only).\n\n' +
          'Headers:\n' +
          '- Authorization: Bearer <ACCESS_TOKEN> (role must be admin)\n' +
          '- x-platform-admin-secret: <PLATFORM_ADMIN_SECRET>\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" -H "x-platform-admin-secret: <SECRET>" http://localhost:3001/api/platform/tenants\n' +
          '```\n',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              tenants: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
            required: ['ok', 'tenants'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
      const client = await requireDb(req);

      const row = await client.query(
        `SELECT
           t.id,
           t.name,
           t.slug,
           t.plan,
           t.status,
           t.settings,
           t.created_at,
           t.updated_at
         FROM tenants t
         ORDER BY t.updated_at DESC, t.created_at DESC`,
      );

      const tenants = row.rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        slug: String(r.slug),
        plan: String(r.plan),
        status: String(r.status ?? 'active'),
        settings: r.settings && typeof r.settings === 'object' ? (r.settings as unknown) : {},
        createdAt: (r.created_at ?? new Date()).toISOString(),
        updatedAt: (r.updated_at ?? new Date()).toISOString(),
      }));

      // projects has FORCE RLS; compute per-tenant counts by temporarily setting tenant context.
      const counts = new Map<string, { userCount: number; projectCount: number }>();
      for (const t of tenants) {
        await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [t.id]);
        await client.query("SELECT set_config('app.current_role', 'admin', false)");

        const users = await client.query('SELECT count(*)::int AS c FROM memberships WHERE tenant_id = $1', [t.id]);
        const projects = await client.query('SELECT count(*)::int AS c FROM projects WHERE tenant_id = $1', [t.id]);
        counts.set(t.id, {
          userCount: Number(users.rows[0]?.c ?? 0),
          projectCount: Number(projects.rows[0]?.c ?? 0),
        });
      }

      return {
        ok: true,
        tenants: tenants.map((t) => ({
          ...t,
          userCount: counts.get(t.id)?.userCount ?? 0,
          projectCount: counts.get(t.id)?.projectCount ?? 0,
        })),
      };
    },
  );

  fastify.post(
    '/api/platform/tenants',
    {
      schema: {
        tags: ['platform'],
        description:
          'Create a tenant (platform admin only).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n  -H "x-platform-admin-secret: <SECRET>" \\\n  -H "Content-Type: application/json" \\\n  -d "{\\"name\\":\\"Acme\\",\\"slug\\":\\"acme\\",\\"plan\\":\\"starter\\"}" \\\n  http://localhost:3001/api/platform/tenants\n' +
          '```\n',
        body: {
          type: 'object',
          properties: { name: { type: 'string' }, slug: { type: 'string' }, plan: { type: 'string' } },
          required: ['name', 'slug'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, tenant: { type: 'object', additionalProperties: true } },
            required: ['ok', 'tenant'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
      const client = await requireDb(req);
      const input = createTenantSchema.parse(req.body ?? {});

      const created = await client.query(
        `INSERT INTO tenants (name, slug, plan, status, settings)
         VALUES ($1, $2, $3, 'active', '{}'::jsonb)
         RETURNING id, name, slug, plan, status, settings, created_at, updated_at`,
        [input.name, input.slug, input.plan ?? 'starter'],
      );

      const r = created.rows[0];
      return {
        ok: true,
        tenant: {
          id: String(r.id),
          name: String(r.name),
          slug: String(r.slug),
          plan: String(r.plan),
          status: String(r.status ?? 'active'),
          settings: r.settings && typeof r.settings === 'object' ? (r.settings as unknown) : {},
          createdAt: (r.created_at ?? new Date()).toISOString(),
          updatedAt: (r.updated_at ?? new Date()).toISOString(),
        },
      };
    },
  );

  fastify.patch(
    '/api/platform/tenants/:id',
    {
      schema: {
        tags: ['platform'],
        description:
          'Update a tenant (platform admin only).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X PATCH \\\n  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n  -H "x-platform-admin-secret: <SECRET>" \\\n  -H "Content-Type: application/json" \\\n  -d "{\\"status\\":\\"disabled\\"}" \\\n  http://localhost:3001/api/platform/tenants/<TENANT_UUID>\n' +
          '```\n',
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
          additionalProperties: true,
        },
        body: { type: 'object', additionalProperties: true },
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, tenant: { type: 'object', additionalProperties: true } },
            required: ['ok', 'tenant'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
      const client = await requireDb(req);
      const { id } = tenantIdParamsSchema.parse(req.params as unknown);
      const input = updateTenantSchema.parse(req.body ?? {});

      const updated = await client.query(
        `UPDATE tenants
         SET name = COALESCE($2, name),
             slug = COALESCE($3, slug),
             plan = COALESCE($4, plan),
             status = COALESCE($5, status),
             updated_at = now()
         WHERE id = $1
         RETURNING id, name, slug, plan, status, settings, created_at, updated_at`,
        [id, input.name ?? null, input.slug ?? null, input.plan ?? null, input.status ?? null],
      );

      if ((updated.rowCount ?? 0) === 0) {
        const error = new Error('Tenant not found');
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      const r = updated.rows[0];
      return {
        ok: true,
        tenant: {
          id: String(r.id),
          name: String(r.name),
          slug: String(r.slug),
          plan: String(r.plan),
          status: String(r.status ?? 'active'),
          settings: r.settings && typeof r.settings === 'object' ? (r.settings as unknown) : {},
          createdAt: (r.created_at ?? new Date()).toISOString(),
          updatedAt: (r.updated_at ?? new Date()).toISOString(),
        },
      };
    },
  );

  fastify.delete(
    '/api/platform/tenants/:id',
    {
      schema: {
        tags: ['platform'],
        description:
          'Soft-delete a tenant (platform admin only).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X DELETE -H "Authorization: Bearer <ACCESS_TOKEN>" -H "x-platform-admin-secret: <SECRET>" http://localhost:3001/api/platform/tenants/<TENANT_UUID>\n' +
          '```\n',
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
      const client = await requireDb(req);
      const { id } = tenantIdParamsSchema.parse(req.params as unknown);

      const updated = await client.query(
        `UPDATE tenants
         SET status = 'deleted', updated_at = now()
         WHERE id = $1
         RETURNING id`,
        [id],
      );

      if ((updated.rowCount ?? 0) === 0) {
        const error = new Error('Tenant not found');
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      return { ok: true };
    },
  );
};
