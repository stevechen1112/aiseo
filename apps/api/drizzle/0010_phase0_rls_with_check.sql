-- Phase 0 hardening: ensure tenant isolation applies to writes (INSERT/UPDATE)
-- Add WITH CHECK clauses to existing RLS policies.

--> statement-breakpoint
ALTER POLICY "tenant_isolation_projects" ON "projects"
	USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid)
	WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

--> statement-breakpoint
ALTER POLICY "tenant_isolation_keywords" ON "keywords"
	USING ("project_id" IN (
		SELECT "id" FROM "projects"
		WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
	))
	WITH CHECK ("project_id" IN (
		SELECT "id" FROM "projects"
		WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
	));

--> statement-breakpoint
-- Strengthen schedules policy to also ensure project_id belongs to the same tenant.
ALTER POLICY "tenant_isolation_schedules" ON "schedules"
	USING (
		"tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		AND "project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		AND "project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);
