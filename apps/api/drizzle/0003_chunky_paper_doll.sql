CREATE TABLE "schedules" (
	"tenant_id" uuid NOT NULL,
	"id" text NOT NULL,
	"flow_name" text NOT NULL,
	"project_id" uuid NOT NULL,
	"seed_keyword" text,
	"cron" text NOT NULL,
	"timezone" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedules_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE INDEX "idx_schedules_tenant_enabled" ON "schedules" USING btree ("tenant_id","enabled");

--> statement-breakpoint
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_schedules" ON "schedules"
	USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);