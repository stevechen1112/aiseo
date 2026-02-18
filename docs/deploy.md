# Deployment (Phase 4 - 5.10)

This repo can be deployed via Docker using the production compose file.

## Prereqs

- Docker Desktop
- (Optional, for backups) `pg_dump` + `psql` available in the API runtime image or host

## Quick start (Docker Compose)

From repo root:

- Build + run: `docker compose -f docker/docker-compose.prod.yml up --build`
- Web: http://127.0.0.1:3000
- API: http://127.0.0.1:3001 (Swagger: `/docs`)

## Required environment variables

API (`apps/api`):

- `DATABASE_URL` (PostgreSQL)
- `REDIS_URL`
- `JWT_SECRET` (recommended in production)
- `JWT_REFRESH_SECRET` (recommended in production)
- `PLATFORM_ADMIN_SECRET` (required for `/api/platform/*`)

Web (`apps/web`):

- `NEXT_PUBLIC_API_URL` (leave empty when using same-origin `/api` rewrites)

## Automated backups (S3/MinIO)

- Enable: `BACKUP_ENABLED=true`
- Configure S3-compatible storage: `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT` (MinIO), `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`
- Run worker: `pnpm -C apps/api worker:backup`

## Security scan (baseline)

- PowerShell: `scripts/security-scan.ps1 -BaseUrl http://127.0.0.1:3000`

This runs `pnpm audit --audit-level=high` and an OWASP ZAP baseline scan via Docker.
