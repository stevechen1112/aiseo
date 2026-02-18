-- Migration 0023: Add Stripe billing columns to tenants table
-- Adds stripe_customer_id (for customer portal + webhook matching)
-- and ensures plan column has a default of 'starter'.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Index for webhook lookups (customer.subscription.updated/deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_customer_id
  ON tenants (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Ensure plan defaults to 'starter' for new rows
ALTER TABLE tenants
  ALTER COLUMN plan SET DEFAULT 'starter';
