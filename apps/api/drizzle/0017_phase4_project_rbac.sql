-- Phase 4: Project-scoped access control (advanced RBAC)
-- Adds project_memberships table and updates projects RLS policy to enforce
-- per-project access for non-admin roles.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "project_id" uuid NOT NULL REFERENCES "public"."projects"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "role" membership_role NOT NULL DEFAULT 'analyst',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_memberships_tenant_project_user_unique" UNIQUE("tenant_id", "project_id", "user_id")
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_memberships_tenant" ON "project_memberships" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_project_memberships_project" ON "project_memberships" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_memberships_user" ON "project_memberships" USING btree ("user_id");

--> statement-breakpoint
-- Enable RLS on project_memberships.
ALTER TABLE "project_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_memberships" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
-- Allow tenant admins to manage all rows; allow non-admins to read their own rows.
DROP POLICY IF EXISTS "tenant_isolation_project_memberships" ON "project_memberships";
CREATE POLICY "tenant_isolation_project_memberships" ON "project_memberships"
  USING (
    "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
    AND (
      current_setting('app.current_role', true) = 'admin'
      OR "user_id" = current_setting('app.current_user_id', true)::uuid
    )
  )
  WITH CHECK (
    "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
    AND (
      current_setting('app.current_role', true) = 'admin'
      OR "user_id" = current_setting('app.current_user_id', true)::uuid
    )
  );

--> statement-breakpoint
-- Backfill: grant all existing tenant members access to all existing projects in their tenant.
INSERT INTO "project_memberships" ("tenant_id", "project_id", "user_id", "role")
SELECT m."tenant_id", p."id" AS project_id, m."user_id", m."role"
FROM "memberships" m
JOIN "projects" p ON p."tenant_id" = m."tenant_id"
ON CONFLICT ("tenant_id", "project_id", "user_id") DO NOTHING;

--> statement-breakpoint
-- Update projects policy to also enforce project membership for non-admin roles.
ALTER POLICY "tenant_isolation_projects" ON "projects"
  USING (
    "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
    AND (
      current_setting('app.current_role', true) = 'admin'
      OR EXISTS (
        SELECT 1
        FROM "project_memberships" pm
        WHERE pm."tenant_id" = current_setting('app.current_tenant_id', true)::uuid
          AND pm."project_id" = "projects"."id"
          AND pm."user_id" = current_setting('app.current_user_id', true)::uuid
      )
    )
  )
  WITH CHECK (
    "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
    AND (
      current_setting('app.current_role', true) = 'admin'
      OR EXISTS (
        SELECT 1
        FROM "project_memberships" pm
        WHERE pm."tenant_id" = current_setting('app.current_tenant_id', true)::uuid
          AND pm."project_id" = "projects"."id"
          AND pm."user_id" = current_setting('app.current_user_id', true)::uuid
      )
    )
  );
