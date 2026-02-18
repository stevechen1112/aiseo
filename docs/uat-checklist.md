# UAT Checklist (Phase 4 - 5.11)

This checklist is intended for manual acceptance testing.

## Prereqs

- Services running:
  - API: `pnpm -C apps/api dev`
  - Web: `pnpm -C apps/web dev`
  - Postgres + Redis: `docker compose -f docker/docker-compose.yml up -d`

## Accounts & Onboarding

- [ ] Sign up at `/signup`
- [ ] Verify email via `/verify-email` (or resend verification)
- [ ] Log in at `/login`
- [ ] Confirm first-login onboarding banner appears on `/dashboard`

## Multi-tenant URL isolation

- [ ] Navigate to `/tenant/<tenantId>/dashboard` routes
- [ ] Verify mismatch tenantId redirects back to the logged-in tenant

## Settings

Projects:
- [ ] Create a project
- [ ] Update domain/target keywords
- [ ] Delete project (confirm cascade warning)

API Keys:
- [ ] Create API key (confirm secret shown once)
- [ ] Update name/permissions
- [ ] Revoke key

RBAC:
- [ ] Create user (admin)
- [ ] Update role and verify permission matrix displayed

Webhooks:
- [ ] Create webhook
- [ ] Toggle enabled / update events
- [ ] View deliveries list

Usage:
- [ ] Verify quota/usage numbers render
- [ ] Copy upgrade request CTA works

Branding:
- [ ] Update brand color/header/footer
- [ ] Upload logo (verify size/type validations)

Audit Logs:
- [ ] Open Settings → Audit Logs
- [ ] Verify recent actions appear (create project, create/revoke API key)
- [ ] Download JSON/CSV export

Backup/Export:
- [ ] Export JSON backup for a project
- [ ] Import backup JSON into a new project

## Smoke (optional)

- [ ] Run `pnpm smoke:phase0-3` for automated regression of earlier phases
