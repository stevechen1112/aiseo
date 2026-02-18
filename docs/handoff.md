# Handoff (Operations)

## Services

- Web (Next.js standalone) on `:3000`
- API (Fastify) on `:3001`
- Postgres (pgvector) on `:5432` (compose uses host `:5433`)
- Redis on `:6379`

## Required env (minimum)

API:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `PLATFORM_ADMIN_SECRET`

Web:
- `NEXT_PUBLIC_API_URL` (empty when using same-origin `/api`)

## Backups

- Enable automated backups to S3/MinIO:
  - Set `.env`: `BACKUP_ENABLED=true` + `BACKUP_S3_*`
  - Run worker: `pnpm -C apps/api worker:backup`
- Manual backup run: `pnpm -C apps/api backup:run`
- Restore (latest backup): `pnpm -C apps/api backup:restore`

## Security

- Baseline scan: `scripts/security-scan.ps1 -BaseUrl http://<host>:3000`
- API sets basic security headers via Fastify helmet.

## Performance

- Dashboard load test: `pnpm -C apps/api perf:load:dashboard` (requires `LOADTEST_TOKEN`)
- Dashboard metrics are cached for 15 seconds.

## Troubleshooting

- Migrations out of sync: check `apps/api/drizzle/meta/_journal.json` then rerun `pnpm -C apps/api db:migrate`.
- Web/API mismatch: ensure Web routes proxy `/api/*` to API and tokens are valid.
- Webhooks not delivering: ensure `pnpm -C apps/api notify:webhooks -- all` is running.
