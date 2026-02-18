Param(
  [string]$ApiPort = "3002",
  [string]$WebPort = "3000"
)

$ErrorActionPreference = "Stop"

function Wait-Health([string]$BaseUrl, [int]$TimeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health" -TimeoutSec 3
      if ($r) { return $true }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  return $false
}

function Is-PortListening([int]$Port) {
  try {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $c -and @($c).Count -gt 0)
  } catch {
    return $false
  }
}

function Select-FreePort([int]$StartPort, [int]$MaxPort = 3010) {
  for ($p = $StartPort; $p -le $MaxPort; $p++) {
    if (-not (Is-PortListening $p)) { return $p }
  }
  throw "No free port found in range $StartPort..$MaxPort"
}

$ApiPortInt = [int]$ApiPort
$ApiPortInt = Select-FreePort $ApiPortInt 3010
$ApiPort = "$ApiPortInt"

$WebPortInt = [int]$WebPort
$WebPortInt = Select-FreePort $WebPortInt 3050
if ($WebPortInt -eq $ApiPortInt) {
  $WebPortInt = Select-FreePort ($WebPortInt + 1) 3050
}
$WebPort = "$WebPortInt"

$apiBase = "http://127.0.0.1:$ApiPort"
$wsBase = "ws://127.0.0.1:$ApiPort/ws/events"

Write-Host "Starting API on $apiBase ..." -ForegroundColor Cyan
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$logOutPath = Join-Path (Get-Location) "scripts/l2-api-$ApiPort-$stamp.out.log"
$logErrPath = Join-Path (Get-Location) "scripts/l2-api-$ApiPort-$stamp.err.log"

$dotenvPath = Join-Path (Get-Location) 'apps/api/.env'
$apiStartCommand = "`$env:PORT=$ApiPort; `$env:DOTENV_CONFIG_PATH='$dotenvPath'; corepack pnpm -C apps/api dev"

$apiProc = Start-Process -FilePath "powershell" -NoNewWindow -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command",
  $apiStartCommand
) -WorkingDirectory (Get-Location) -PassThru -RedirectStandardOutput $logOutPath -RedirectStandardError $logErrPath

try {
  $ready = $false
  $deadline = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $deadline) {
    if ($apiProc.HasExited) {
      break
    }
    if (Wait-Health $apiBase 2) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    Write-Host "API failed to become healthy: $apiBase/health" -ForegroundColor Red
    if (Test-Path $logOutPath) {
      Write-Host "--- API stdout tail ($logOutPath) ---" -ForegroundColor Yellow
      Get-Content $logOutPath -Tail 120 | ForEach-Object { Write-Host $_ }
      Write-Host "--- end stdout tail ---" -ForegroundColor Yellow
    }
    if (Test-Path $logErrPath) {
      Write-Host "--- API stderr tail ($logErrPath) ---" -ForegroundColor Yellow
      Get-Content $logErrPath -Tail 120 | ForEach-Object { Write-Host $_ }
      Write-Host "--- end stderr tail ---" -ForegroundColor Yellow
    }
    throw "API did not become healthy in time: $apiBase/health"
  }

  Write-Host "Running LIVE Playwright UAT against API=$apiBase WS=$wsBase ..." -ForegroundColor Cyan

  $env:LIVE_E2E = "1"
  $env:AISEO_API_URL = $apiBase
  $env:NEXT_PUBLIC_WS_URL = $wsBase
  $env:E2E_WEB_MODE = "prod"
  $env:PORT = $WebPort

  $e2eOutPath = Join-Path (Get-Location) "scripts/l2-web-e2e-$ApiPort-$stamp.out.log"
  $e2eErrPath = Join-Path (Get-Location) "scripts/l2-web-e2e-$ApiPort-$stamp.err.log"
  Write-Host "Playwright stdout log: $e2eOutPath" -ForegroundColor DarkGray
  Write-Host "Playwright stderr log: $e2eErrPath" -ForegroundColor DarkGray

  $e2eCmd = "corepack pnpm -C apps/web exec playwright test e2e/live-uat.spec.ts --project=chromium --workers=1"
  $e2eProc = Start-Process -FilePath "cmd.exe" -NoNewWindow -Wait -ArgumentList @(
    "/c",
    $e2eCmd
  ) -WorkingDirectory (Get-Location) -PassThru -RedirectStandardOutput $e2eOutPath -RedirectStandardError $e2eErrPath
  $exitCode = $e2eProc.ExitCode
  if ($null -eq $exitCode) {
    $exitCode = 1
  }
  if ($exitCode -ne 0) {
    Write-Host "Playwright failed with exit code $exitCode" -ForegroundColor Red
    if (Test-Path $e2eOutPath) {
      Write-Host "--- Playwright stdout tail ($e2eOutPath) ---" -ForegroundColor Yellow
      Get-Content $e2eOutPath -Tail 200 | ForEach-Object { Write-Host $_ }
      Write-Host "--- end stdout tail ---" -ForegroundColor Yellow
    }
    if (Test-Path $e2eErrPath) {
      Write-Host "--- Playwright stderr tail ($e2eErrPath) ---" -ForegroundColor Yellow
      Get-Content $e2eErrPath -Tail 200 | ForEach-Object { Write-Host $_ }
      Write-Host "--- end stderr tail ---" -ForegroundColor Yellow
    }
    throw "L2 UI/WS UAT failed (exit code $exitCode). See logs: $e2eOutPath / $e2eErrPath"
  }
} finally {
  if ($apiProc) {
    Write-Host "Stopping API process tree (PID $($apiProc.Id))" -ForegroundColor Yellow
    try {
      & taskkill /PID $apiProc.Id /T /F | Out-Null
    } catch {
      // Ignore cleanup errors.
    }
  }
}
