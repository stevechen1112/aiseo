-- Phase 4: Performance indexes

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_keywords_project_created" ON "keywords" USING btree ("project_id", "created_at" DESC);
