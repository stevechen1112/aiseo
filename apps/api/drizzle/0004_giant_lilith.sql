CREATE TABLE IF NOT EXISTS "agent_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_memory_agent_id_created_at" ON "agent_memory" USING btree ("agent_id","created_at");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_memory_embedding_hnsw
	ON agent_memory USING hnsw (embedding vector_cosine_ops);