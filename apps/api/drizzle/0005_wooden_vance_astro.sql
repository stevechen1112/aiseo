CREATE TABLE "keyword_ranks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"result_url" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_ranks_keyword_id_checked_at_unique" UNIQUE("keyword_id","checked_at")
);
--> statement-breakpoint
ALTER TABLE "keyword_ranks" ADD CONSTRAINT "keyword_ranks_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_keyword_ranks_keyword_checked_at" ON "keyword_ranks" USING btree ("keyword_id","checked_at");

--> statement-breakpoint
-- Row-Level Security (RLS)
ALTER TABLE "keyword_ranks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "keyword_ranks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_keyword_ranks" ON "keyword_ranks"
	USING ("keyword_id" IN (
		SELECT "k"."id" FROM "keywords" AS "k"
		JOIN "projects" AS "p" ON "p"."id" = "k"."project_id"
		WHERE "p"."tenant_id" = current_setting('app.current_tenant_id', true)::uuid
	));