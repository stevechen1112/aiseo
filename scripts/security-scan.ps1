param(
  [string]$BaseUrl = "http://127.0.0.1:3000"
)

$ErrorActionPreference = "Stop"

Write-Host "[security] pnpm audit (high+)" -ForegroundColor Cyan
pnpm audit --audit-level=high

Write-Host "[security] OWASP ZAP baseline (docker)" -ForegroundColor Cyan
Write-Host "[security] Target: $BaseUrl" -ForegroundColor Gray

# Requires: docker running + the app accessible from the docker host.
# Note: This is a baseline scan; tune rules as needed.
docker run --rm -t owasp/zap2docker-stable zap-baseline.py -t $BaseUrl -r zap-report.html

Write-Host "[security] Wrote zap-report.html" -ForegroundColor Green
