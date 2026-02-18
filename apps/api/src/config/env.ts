import { z } from 'zod';

const optionalNonEmptyString = () =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z.string().min(1).optional(),
  );

const optionalUrl = () =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z.string().url().optional(),
  );

const envSchema = z
  .object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_MIGRATION: optionalNonEmptyString(),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  DEFAULT_TENANT_ID: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z.string().uuid().optional(),
  ),

  // Gemini (Google Generative AI)
  GOOGLE_GENERATIVE_AI_API_KEY: optionalNonEmptyString(),
  GEMINI_MODEL: z.string().min(1).default('gemini-1.5-flash'),

  // External APIs
  AHREFS_API_KEY: optionalNonEmptyString(),
  GOOGLE_NLP_API_KEY: optionalNonEmptyString(),

  // Notification Hub
  SLACK_WEBHOOK_URL: optionalUrl(),

  // API Key Management (Phase 3 - 4.10)
  API_KEY_ENCRYPTION_SECRET: optionalNonEmptyString(),

  // Auth (JWT)
  JWT_SECRET: optionalNonEmptyString(),
  JWT_REFRESH_SECRET: optionalNonEmptyString(),

  // Platform Admin (Phase 4)
  // Used to access /api/platform/* routes that must bypass per-tenant RLS.
  PLATFORM_ADMIN_SECRET: optionalNonEmptyString(),

  // Email (SMTP)
  SMTP_HOST: optionalNonEmptyString(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: optionalNonEmptyString(),
  SMTP_PASS: optionalNonEmptyString(),
  SMTP_FROM: optionalNonEmptyString(),

  // SERP
  SERP_PROVIDER: optionalNonEmptyString(),
  VALUESERP_API_KEY: optionalNonEmptyString(),
  SCALESERP_API_KEY: optionalNonEmptyString(),
  GSC_API_KEY: optionalNonEmptyString(),
  GSC_SITE_URL: optionalNonEmptyString(),

  // Phase 4 - 5.7 Automated backups (S3/MinIO)
  BACKUP_ENABLED: z.preprocess(
    (value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (v === 'true' || v === '1' || v === 'yes') return true;
        if (v === 'false' || v === '0' || v === 'no') return false;
      }
      return value;
    },
    z.boolean().default(false),
  ),
  BACKUP_S3_BUCKET: optionalNonEmptyString(),
  BACKUP_S3_REGION: z.string().min(1).default('us-east-1'),
  BACKUP_S3_ENDPOINT: optionalUrl(),
  BACKUP_S3_ACCESS_KEY_ID: optionalNonEmptyString(),
  BACKUP_S3_SECRET_ACCESS_KEY: optionalNonEmptyString(),
  BACKUP_S3_SSE: z.preprocess(
    (value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (v === 'true' || v === '1' || v === 'yes') return true;
        if (v === 'false' || v === '0' || v === 'no') return false;
      }
      return value;
    },
    z.boolean().optional(),
  ),
  BACKUP_S3_FORCE_PATH_STYLE: z.preprocess(
    (value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (v === 'true' || v === '1' || v === 'yes') return true;
        if (v === 'false' || v === '0' || v === 'no') return false;
      }
      return value;
    },
    z.boolean().optional(),
  ),
  BACKUP_PREFIX: z.string().min(1).default('aiseo-backups'),
  BACKUP_CRON: z.string().min(1).default('0 3 * * *'),
  BACKUP_TZ: optionalNonEmptyString(),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  BACKUP_PGDUMP_PATH: z.string().min(1).default('pg_dump'),

  // Restore scripts (Phase 4 - 5.7.2)
  BACKUP_PSQL_PATH: z.string().min(1).default('psql'),
  BACKUP_RESTORE_DATABASE_URL: optionalNonEmptyString(),
  BACKUP_RESTORE_TEST_KEEP_DB: z.preprocess(
    (value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (v === 'true' || v === '1' || v === 'yes') return true;
        if (v === 'false' || v === '0' || v === 'no') return false;
      }
      return value;
    },
    z.boolean().default(false),
  ),
  })
  .superRefine((value, ctx) => {
    const isProd = value.NODE_ENV === 'production';
    if (!isProd) return;

    const requireInProd = (key: keyof typeof value, message: string) => {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message,
        });
      }
    };

    // Prevent accidental use of hard-coded dev secrets in production.
    requireInProd('JWT_SECRET', 'JWT_SECRET is required in production');
    requireInProd('JWT_REFRESH_SECRET', 'JWT_REFRESH_SECRET is required in production');
    requireInProd('API_KEY_ENCRYPTION_SECRET', 'API_KEY_ENCRYPTION_SECRET is required in production');
  });

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_URL_MIGRATION: process.env.DATABASE_URL_MIGRATION,
  REDIS_URL: process.env.REDIS_URL,
  DEFAULT_TENANT_ID: process.env.DEFAULT_TENANT_ID,

  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,

  AHREFS_API_KEY: process.env.AHREFS_API_KEY,
  GOOGLE_NLP_API_KEY: process.env.GOOGLE_NLP_API_KEY,

  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,

  API_KEY_ENCRYPTION_SECRET: process.env.API_KEY_ENCRYPTION_SECRET,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,

  PLATFORM_ADMIN_SECRET: process.env.PLATFORM_ADMIN_SECRET,

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,

  SERP_PROVIDER: process.env.SERP_PROVIDER,
  VALUESERP_API_KEY: process.env.VALUESERP_API_KEY,
  SCALESERP_API_KEY: process.env.SCALESERP_API_KEY,
  GSC_API_KEY: process.env.GSC_API_KEY,
  GSC_SITE_URL: process.env.GSC_SITE_URL,

  BACKUP_ENABLED: process.env.BACKUP_ENABLED,
  BACKUP_S3_BUCKET: process.env.BACKUP_S3_BUCKET,
  BACKUP_S3_REGION: process.env.BACKUP_S3_REGION,
  BACKUP_S3_ENDPOINT: process.env.BACKUP_S3_ENDPOINT,
  BACKUP_S3_ACCESS_KEY_ID: process.env.BACKUP_S3_ACCESS_KEY_ID,
  BACKUP_S3_SECRET_ACCESS_KEY: process.env.BACKUP_S3_SECRET_ACCESS_KEY,
  BACKUP_S3_SSE: process.env.BACKUP_S3_SSE,
  BACKUP_S3_FORCE_PATH_STYLE: process.env.BACKUP_S3_FORCE_PATH_STYLE,
  BACKUP_PREFIX: process.env.BACKUP_PREFIX,
  BACKUP_CRON: process.env.BACKUP_CRON,
  BACKUP_TZ: process.env.BACKUP_TZ,
  BACKUP_RETENTION_DAYS: process.env.BACKUP_RETENTION_DAYS,
  BACKUP_PGDUMP_PATH: process.env.BACKUP_PGDUMP_PATH,

  BACKUP_PSQL_PATH: process.env.BACKUP_PSQL_PATH,
  BACKUP_RESTORE_DATABASE_URL: process.env.BACKUP_RESTORE_DATABASE_URL,
  BACKUP_RESTORE_TEST_KEEP_DB: process.env.BACKUP_RESTORE_TEST_KEEP_DB,
});
