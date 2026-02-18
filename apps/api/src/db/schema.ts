import {
  bigserial,
  boolean,
  customType,
  jsonb,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const vector1536 = customType<{ data: number[]; driverData: string }>(
  {
    dataType() {
      return 'vector(1536)';
    },
    toDriver(value) {
      return `[${value.join(',')}]`;
    },
    fromDriver(value) {
      if (typeof value === 'string') {
        const trimmed = value.trim().replace(/^\[/, '').replace(/\]$/, '');
        if (!trimmed) return [];
        return trimmed.split(',').map((n) => Number(n));
      }
      return [];
    },
  },
);

export const membershipRole = pgEnum('membership_role', ['admin', 'manager', 'analyst']);

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('starter'),
  status: text('status').notNull().default('active'),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  emailVerificationTokenHash: text('email_verification_token_hash'),
  emailVerificationExpiresAt: timestamp('email_verification_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  settings: jsonb('settings').notNull().default({}),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull().default('analyst'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantUserUnique: unique().on(t.tenantId, t.userId),
  }),
);

// --- Phase 0: minimal business tables to validate RLS templates ---

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    domain: text('domain').notNull(),
    settings: jsonb('settings').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index('idx_projects_tenant').on(t.tenantId),
  }),
);

export const projectMemberships = pgTable(
  'project_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull().default('analyst'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantProjectUserUnique: unique().on(t.tenantId, t.projectId, t.userId),
    tenantIdx: index('idx_project_memberships_tenant').on(t.tenantId),
    projectIdx: index('idx_project_memberships_project').on(t.projectId),
    userIdx: index('idx_project_memberships_user').on(t.userId),
  }),
);

export const keywords = pgTable(
  'keywords',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    keyword: text('keyword').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectKeywordUnique: unique().on(t.projectId, t.keyword),
  }),
);

// Phase 1: SERP rank time-series (for serp-tracker)
export const keywordRanks = pgTable(
  'keyword_ranks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    keywordId: uuid('keyword_id')
      .notNull()
      .references(() => keywords.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    resultUrl: text('result_url'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keywordCheckedIdx: index('idx_keyword_ranks_keyword_checked_at').on(t.keywordId, t.checkedAt),
    keywordCheckedUnique: unique().on(t.keywordId, t.checkedAt),
  }),
);

// Outbox pattern (Phase 0)
export const eventsOutbox = pgTable(
  'events_outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    dispatched: boolean('dispatched').notNull().default(false),
    retryCount: integer('retry_count').notNull().default(0),
    lastError: text('last_error'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dispatchedCreatedIdx: index('idx_outbox_dispatched_created_at').on(t.dispatched, t.createdAt),
  }),
);

// Phase 1: Cron schedules persistence (per-tenant)
export const schedules = pgTable(
  'schedules',
  {
    tenantId: uuid('tenant_id').notNull(),
    id: text('id').notNull(),
    flowName: text('flow_name').notNull(),
    projectId: uuid('project_id').notNull(),
    seedKeyword: text('seed_keyword'),
    cron: text('cron').notNull(),
    timezone: text('timezone'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantEnabledIdx: index('idx_schedules_tenant_enabled').on(t.tenantId, t.enabled),
    pk: unique().on(t.tenantId, t.id),
  }),
);

// Phase 1: Agent memory (pgvector)
export const agentMemory = pgTable(
  'agent_memory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: text('agent_id').notNull(),
    embedding: vector1536('embedding').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentCreatedIdx: index('idx_agent_memory_agent_id_created_at').on(t.agentId, t.createdAt),
  }),
);
