-- SEC-05: Add HNSW vector index on agent_memory.embedding for semantic similarity search.
--
-- IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- Drizzle migrate runs each file in a transaction, so this migration must be
-- applied manually outside of `pnpm -C apps/api db:migrate`:
--
--   psql $DATABASE_URL_MIGRATION -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_memory_embedding ON agent_memory USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);"
--
-- Alternatively, run via the helper script:
--   scripts/windows/psql_docker.cmd "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_memory_embedding ON agent_memory USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);"
--
-- After applying, verify with:
--   SELECT indexname FROM pg_indexes WHERE tablename = 'agent_memory';
--   EXPLAIN ANALYZE SELECT * FROM agent_memory ORDER BY embedding <=> '[...]' LIMIT 5;

--> statement-breakpoint
-- NOTE: This statement is intentionally left as a non-concurrent fallback for
-- fresh/test databases where locking is acceptable (e.g. empty tables in CI).
-- For production databases with existing data, apply the CONCURRENTLY variant above.
CREATE INDEX IF NOT EXISTS idx_agent_memory_embedding
  ON agent_memory
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
