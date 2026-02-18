-- Migration 0024: Add settings jsonb column to users table
-- Stores per-user UI preferences and onboarding state server-side,
-- so clearing localStorage doesn't reset onboarding on next visit.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN users.settings IS 'Per-user settings. Allowed keys: onboardingSeenAt (timestamp ISO string), uiPreferences (object).';
