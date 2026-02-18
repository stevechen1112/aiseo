-- Phase 4: Email verification fields for self-serve onboarding

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS email_verification_token_hash text NULL,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_verification_token_hash
  ON users (email_verification_token_hash)
  WHERE email_verification_token_hash IS NOT NULL;
