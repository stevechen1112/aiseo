ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_status_check'
  ) THEN
    ALTER TABLE "tenants"
      ADD CONSTRAINT tenants_status_check
      CHECK (status IN ('active', 'disabled', 'deleted'));
  END IF;
END $$;
