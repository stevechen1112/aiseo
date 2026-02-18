-- Phase 4: Audit logs system (advanced RBAC)
-- Records key user actions and provides tenant-scoped querying/export.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
  "project_id" uuid REFERENCES "public"."projects"("id") ON DELETE set null,
  "action" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_tenant_created" ON "audit_logs" USING btree ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_logs_project_created" ON "audit_logs" USING btree ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_created" ON "audit_logs" USING btree ("user_id", "created_at" DESC);

--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation_audit_logs" ON "audit_logs";
CREATE POLICY "tenant_isolation_audit_logs" ON "audit_logs"
  USING (
    "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
    AND (
      current_setting('app.current_role', true) IN ('admin', 'manager')
      OR ("user_id" IS NOT NULL AND "user_id" = current_setting('app.current_user_id', true)::uuid)
    )
  )
  WITH CHECK (
    "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
    AND (
      "user_id" IS NULL OR "user_id" = current_setting('app.current_user_id', true)::uuid
    )
  );
