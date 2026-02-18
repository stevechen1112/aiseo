-- Phase 3 hardening: ensure tenant isolation applies to writes (INSERT/UPDATE)
-- and prevent cross-tenant project_id references on api_keys.

--> statement-breakpoint
ALTER POLICY "tenant_isolation_api_keys" ON "api_keys"
	USING (
		"tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		AND (
			"project_id" IS NULL
			OR "project_id" IN (
				SELECT "id" FROM "projects"
				WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
			)
		)
	)
	WITH CHECK (
		"tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		AND (
			"project_id" IS NULL
			OR "project_id" IN (
				SELECT "id" FROM "projects"
				WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
			)
		)
	);
