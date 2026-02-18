-- Phase 2 hardening: ensure tenant isolation applies to writes (INSERT/UPDATE)
-- Add WITH CHECK clauses to Phase 2 RLS policies created in 0006-0008.

--> statement-breakpoint
ALTER POLICY "content_drafts_isolation" ON "content_drafts"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "audit_results_isolation" ON "audit_results"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "competitor_analyses_isolation" ON "competitor_analyses"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "backlink_opportunities_tenant_isolation" ON "backlink_opportunities"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "outreach_campaigns_tenant_isolation" ON "outreach_campaigns"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "generated_reports_tenant_isolation" ON "generated_reports"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "schema_validations_tenant_isolation" ON "schema_validations"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "tenant_isolation_internal_links" ON "internal_links"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "tenant_isolation_link_suggestions" ON "link_suggestions"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "tenant_isolation_pagespeed_audits" ON "pagespeed_audits"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "tenant_isolation_cwv_timeseries" ON "cwv_timeseries"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "tenant_isolation_local_business_profiles" ON "local_business_profiles"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "tenant_isolation_gmb_reviews" ON "gmb_reviews"
	USING (
		"profile_id" IN (
			SELECT "profile_id" FROM "local_business_profiles"
			WHERE "project_id" IN (
				SELECT "id" FROM "projects"
				WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
			)
		)
	)
	WITH CHECK (
		"profile_id" IN (
			SELECT "profile_id" FROM "local_business_profiles"
			WHERE "project_id" IN (
				SELECT "id" FROM "projects"
				WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
			)
		)
	);

--> statement-breakpoint
ALTER POLICY "tenant_isolation_citation_records" ON "citation_records"
	USING (
		"profile_id" IN (
			SELECT "profile_id" FROM "local_business_profiles"
			WHERE "project_id" IN (
				SELECT "id" FROM "projects"
				WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
			)
		)
	)
	WITH CHECK (
		"profile_id" IN (
			SELECT "profile_id" FROM "local_business_profiles"
			WHERE "project_id" IN (
				SELECT "id" FROM "projects"
				WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
			)
		)
	);

--> statement-breakpoint
ALTER POLICY "tenant_isolation_local_rankings" ON "local_rankings"
	USING (
		"profile_id" IN (
			SELECT "profile_id" FROM "local_business_profiles"
			WHERE "project_id" IN (
				SELECT "id" FROM "projects"
				WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
			)
		)
	)
	WITH CHECK (
		"profile_id" IN (
			SELECT "profile_id" FROM "local_business_profiles"
			WHERE "project_id" IN (
				SELECT "id" FROM "projects"
				WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
			)
		)
	);

--> statement-breakpoint
ALTER POLICY "tenant_isolation_content_freshness_checks" ON "content_freshness_checks"
	USING (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	)
	WITH CHECK (
		"project_id" IN (
			SELECT "id" FROM "projects"
			WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
		)
	);

--> statement-breakpoint
ALTER POLICY "tenant_isolation_content_update_recommendations" ON "content_update_recommendations"
	USING (
		"check_id" IN (
			SELECT "check_id" FROM "content_freshness_checks"
			WHERE "project_id" IN (
				SELECT "id" FROM "projects"
				WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
			)
		)
	)
	WITH CHECK (
		"check_id" IN (
			SELECT "check_id" FROM "content_freshness_checks"
			WHERE "project_id" IN (
				SELECT "id" FROM "projects"
				WHERE "tenant_id" = current_setting('app.current_tenant_id', true)::uuid
			)
		)
	);
