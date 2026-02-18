-- Phase 4: Tenant usage + quotas enforcement counters (monthly period)

CREATE TABLE IF NOT EXISTS tenant_usage (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period text NOT NULL,
  api_calls bigint NOT NULL DEFAULT 0,
  serp_jobs integer NOT NULL DEFAULT 0,
  crawl_jobs integer NOT NULL DEFAULT 0,
  last_alert_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, period)
);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_period ON tenant_usage (period);
