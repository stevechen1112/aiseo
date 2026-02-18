# Release Runbook (v1.0)

This is a practical checklist for shipping Phase 4 as a deployable product.

## Pre-release

- [ ] `pnpm build`
- [ ] Ensure database migrations are applied: `pnpm -C apps/api db:migrate`
- [ ] Verify Swagger is available: `GET /docs` and `GET /openapi.json`
- [ ] Run baseline security scan (optional but recommended): `scripts/security-scan.ps1`

## Deploy (Docker)

- Build images:
  - `docker compose -f docker/docker-compose.prod.yml build`
- Start services:
  - `docker compose -f docker/docker-compose.prod.yml up -d`

## Post-deploy smoke

- [ ] Web reachable: `http://<host>:3000`
- [ ] API health: `GET http://<host>:3001/health`
- [ ] API docs: `GET http://<host>:3001/docs`

## Workers

Depending on your rollout architecture, run these as separate processes/containers:

- Backup worker (daily repeat job): `pnpm -C apps/api worker:backup`
- Outbox dispatcher (if used): `pnpm -C apps/api outbox:dispatch`
- Notification hubs (optional):
  - Slack: `pnpm -C apps/api notify:slack`
  - Webhooks: `pnpm -C apps/api notify:webhooks -- all`

## UAT

- Follow docs/uat-checklist.md
