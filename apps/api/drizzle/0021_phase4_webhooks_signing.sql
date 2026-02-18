-- Phase 4 hardening: webhook signing secret (encrypted at rest)

--> statement-breakpoint
ALTER TABLE webhooks
  ADD COLUMN IF NOT EXISTS secret_ciphertext text,
  ADD COLUMN IF NOT EXISTS secret_iv text,
  ADD COLUMN IF NOT EXISTS secret_tag text;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant_enabled ON webhooks(tenant_id, enabled);
