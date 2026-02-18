-- Runs once on first container init (when PGDATA volume is empty)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Optional: keep UUID generation available even if gen_random_uuid() is used in schema.

-- Create a runtime role that does NOT have BYPASSRLS.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aiseo_app') THEN
		CREATE ROLE aiseo_app LOGIN PASSWORD 'aiseo_app';
	END IF;
END
$$;

GRANT CONNECT ON DATABASE aiseo TO aiseo_app;
GRANT USAGE, CREATE ON SCHEMA public TO aiseo_app;

-- Allow runtime role to read/write tables by default (tighten later with RBAC).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aiseo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO aiseo_app;
