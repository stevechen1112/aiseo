-- Phase 4: Automated backups (S3/MinIO)
-- Records each backup run and stores object location.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backup_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL DEFAULT 'pg_dump',
  "status" text NOT NULL DEFAULT 'ok',
  "bucket" text NOT NULL,
  "object_key" text NOT NULL,
  "content_type" text,
  "size_bytes" bigint,
  "sha256" text,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_backup_runs_created" ON "backup_runs" USING btree ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_backup_runs_object" ON "backup_runs" USING btree ("bucket", "object_key");
