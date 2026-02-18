Param(
  [int]$ApiPort = 3002,
  [string]$SeedKeyword = "aiseo"
)

$ErrorActionPreference = "Stop"

function Wait-Health([string]$BaseUrl, [int]$TimeoutSec = 90) {
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

function Select-FreePort([int]$StartPort, [int]$MaxPort) {
  for ($p = $StartPort; $p -le $MaxPort; $p++) {
    if (-not (Is-PortListening $p)) { return $p }
  }
  throw "No free port found in range $StartPort..$MaxPort"
}

function Start-Api([int]$Port, [string]$Stamp) {
  $apiBase = "http://127.0.0.1:$Port"
  Write-Host "Starting API on $apiBase ..." -ForegroundColor Cyan

  $logOutPath = Join-Path (Get-Location) "scripts/qa-api-$Port-$Stamp.out.log"
  $logErrPath = Join-Path (Get-Location) "scripts/qa-api-$Port-$Stamp.err.log"

  $dotenvPath = Join-Path (Get-Location) 'apps/api/.env'
  $apiStartCommand = "`$env:PORT=$Port; `$env:DOTENV_CONFIG_PATH='$dotenvPath'; corepack pnpm -C apps/api dev"

  $proc = Start-Process -FilePath "powershell" -NoNewWindow -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    $apiStartCommand
  ) -WorkingDirectory (Get-Location) -PassThru -RedirectStandardOutput $logOutPath -RedirectStandardError $logErrPath

  $ready = $false
  $deadline = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $deadline) {
    if ($proc.HasExited) { break }
    if (Wait-Health $apiBase 2) { $ready = $true; break }
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

  return [pscustomobject]@{
    Proc = $proc
    BaseUrl = $apiBase
    OutLog = $logOutPath
    ErrLog = $logErrPath
  }
}

function Stop-ProcTree($Proc) {
  if (-not $Proc) { return }
  Write-Host "Stopping process tree (PID $($Proc.Id))" -ForegroundColor Yellow
  try {
    & taskkill /PID $Proc.Id /T /F | Out-Null
  } catch {
    # ignore
  }
}

function Run-Step([string]$Name, [string]$Cmd, [string]$OutLog, [string]$ErrLog) {
  Write-Host "Running: $Name" -ForegroundColor Cyan
  Write-Host "  cmd: $Cmd" -ForegroundColor DarkGray
  Write-Host "  out: $OutLog" -ForegroundColor DarkGray
  Write-Host "  err: $ErrLog" -ForegroundColor DarkGray

  $p = Start-Process -FilePath "cmd.exe" -NoNewWindow -Wait -ArgumentList @(
    "/c",
    $Cmd
  ) -WorkingDirectory (Get-Location) -PassThru -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog

  $code = $p.ExitCode
  if ($null -eq $code) { $code = 1 }
  if ($code -ne 0) {
    Write-Host "$Name failed with exit code $code" -ForegroundColor Red
    if (Test-Path $OutLog) {
      Write-Host "--- stdout tail ($OutLog) ---" -ForegroundColor Yellow
      Get-Content $OutLog -Tail 200 | ForEach-Object { Write-Host $_ }
      Write-Host "--- end stdout tail ---" -ForegroundColor Yellow
    }
    if (Test-Path $ErrLog) {
      Write-Host "--- stderr tail ($ErrLog) ---" -ForegroundColor Yellow
      Get-Content $ErrLog -Tail 200 | ForEach-Object { Write-Host $_ }
      Write-Host "--- end stderr tail ---" -ForegroundColor Yellow
    }
    throw "$Name failed (exit code $code)"
  }

  return $code
}

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'

$apiPortPicked = Select-FreePort $ApiPort 3010
$api = $null

try {
  $api = Start-Api $apiPortPicked $stamp

  $smokeOut = Join-Path (Get-Location) "scripts/qa-smoke-$apiPortPicked-$stamp.out.log"
  $smokeErr = Join-Path (Get-Location) "scripts/qa-smoke-$apiPortPicked-$stamp.err.log"
  $smokeCmd = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\smoke-phase0-3.ps1 -BaseUrl $($api.BaseUrl) -SeedKeyword $SeedKeyword"
  Run-Step "L0 Smoke" $smokeCmd $smokeOut $smokeErr | Out-Null

  $regOut = Join-Path (Get-Location) "scripts/qa-regress-$apiPortPicked-$stamp.out.log"
  $regErr = Join-Path (Get-Location) "scripts/qa-regress-$apiPortPicked-$stamp.err.log"
  $regCmd = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\regression-phase0-3.ps1 -BaseUrl $($api.BaseUrl) -SeedKeyword $SeedKeyword"
  Run-Step "L1 Regression" $regCmd $regOut $regErr | Out-Null

  Write-Host "L0+L1 done on $($api.BaseUrl)" -ForegroundColor Green
} finally {
  if ($api -and $api.Proc) {
    Stop-ProcTree $api.Proc
  }
}

$l2Out = Join-Path (Get-Location) "scripts/qa-l2-$stamp.out.log"
$l2Err = Join-Path (Get-Location) "scripts/qa-l2-$stamp.err.log"
$l2Cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\l2-ui-uat-live.ps1"
Run-Step "L2 UI/WS LIVE UAT" $l2Cmd $l2Out $l2Err | Out-Null

Write-Host "\nALL CHECKLIST AUTOMATION PASSED" -ForegroundColor Green
Write-Host "- API used for L0/L1: $($api.BaseUrl)" -ForegroundColor Green
Write-Host "- Logs: scripts/qa-*-$stamp.*.log" -ForegroundColor Green
