Param(
  [string]$BaseUrl = "http://localhost:3001",
  [string]$SeedKeyword = "aiseo"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http

$script:Failures = 0
$script:Skips = 0

function Write-Title([string]$Text) {
  Write-Host "\n=== $Text ===" -ForegroundColor Cyan
}

function Write-Pass([string]$Text) { Write-Host "PASS: $Text" -ForegroundColor Green }
function Write-Fail([string]$Text) { Write-Host "FAIL: $Text" -ForegroundColor Red; $script:Failures++ }
function Write-Skip([string]$Text) { Write-Host "SKIP: $Text" -ForegroundColor Yellow; $script:Skips++ }

function Assert-True([bool]$Condition, [string]$Message) {
  if ($Condition) { Write-Pass $Message } else { Write-Fail $Message }
}

function ConvertTo-JsonCompact($Obj) {
  return ($Obj | ConvertTo-Json -Depth 20 -Compress)
}

function New-HttpClient() {
  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate

  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(20)
  return $client
}

function Invoke-Api(
  [System.Net.Http.HttpClient]$Client,
  [string]$Method,
  [string]$Path,
  [string]$Token,
  $Body,
  [bool]$ExpectJson = $true
) {
  $uri = ($BaseUrl.TrimEnd('/') + $Path)
  $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::$Method, $uri)

  $req.Headers.Accept.Clear()
  $null = $req.Headers.Accept.Add([System.Net.Http.Headers.MediaTypeWithQualityHeaderValue]::new("application/json"))

  if ($Token) {
    $req.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $Token)
  }

  if ($null -ne $Body) {
    $json = ConvertTo-JsonCompact $Body
    $req.Content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, "application/json")
  }

  $resp = $Client.SendAsync($req).GetAwaiter().GetResult()
  $status = [int]$resp.StatusCode
  $contentType = $null
  if ($resp.Content -and $resp.Content.Headers -and $resp.Content.Headers.ContentType) {
    $contentType = $resp.Content.Headers.ContentType.MediaType
  }

  if (-not $ExpectJson) {
    $bytes = $resp.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    return [pscustomobject]@{
      Status      = $status
      ContentType = $contentType
      Bytes       = $bytes
      Text        = $null
      Json        = $null
    }
  }

  $text = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $jsonObj = $null
  if ($text) {
    try { $jsonObj = $text | ConvertFrom-Json -ErrorAction Stop } catch { $jsonObj = $null }
  }

  return [pscustomobject]@{
    Status      = $status
    ContentType = $contentType
    Bytes       = $null
    Text        = $text
    Json        = $jsonObj
  }
}

function Expect-Status($Resp, [int]$Expected, [string]$Name) {
  if ($Resp.Status -eq $Expected) {
    Write-Pass "$Name (HTTP $Expected)"
    return $true
  }

  $detail = if ($Resp.Text) { $Resp.Text } else { "(no body)" }
  Write-Fail "$Name expected HTTP $Expected, got $($Resp.Status): $detail"
  return $false
}

function Random-Email([string]$Prefix) {
  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $rand = Get-Random -Minimum 1000 -Maximum 9999
  return "$Prefix$stamp$rand@example.com"
}

$client = New-HttpClient

try {
  Write-Title "0) Health"
  $health = Invoke-Api $client "Get" "/health" $null $null $true
  Assert-True ($health.Status -eq 200) "GET /health is reachable"

  Write-Title "1) Register Tenant A + Tenant B"
  $password = "password1234"

  $emailA = Random-Email "smoke_a_"
  $regA = Invoke-Api $client "Post" "/api/auth/register" $null @{ email = $emailA; password = $password; name = "Smoke A" } $true
  if (-not (Expect-Status $regA 200 "POST /api/auth/register (A)")) { throw "Cannot proceed" }

  $tokenAAdmin = $regA.Json.token
  $userAId = $regA.Json.user.id
  $tenantAId = $regA.Json.user.tenantId
  $projectAId = $regA.Json.user.projectId

  Assert-True (!!$tokenAAdmin) "A access token returned"
  Assert-True (!!$tenantAId) "A tenantId returned"
  Assert-True (!!$projectAId) "A projectId returned"

  $emailB = Random-Email "smoke_b_"
  $regB = Invoke-Api $client "Post" "/api/auth/register" $null @{ email = $emailB; password = $password; name = "Smoke B" } $true
  if (-not (Expect-Status $regB 200 "POST /api/auth/register (B)")) { throw "Cannot proceed" }

  $tokenBAdmin = $regB.Json.token
  $projectBId = $regB.Json.user.projectId

  Write-Title "2) Auth Me"
  $meA = Invoke-Api $client "Get" "/api/auth/me" $tokenAAdmin $null $true
  Expect-Status $meA 200 "GET /api/auth/me (A)" | Out-Null
  Assert-True ($meA.Json.user.tenantId -eq $tenantAId) "A /me tenantId matches"

  Write-Title "3) RLS tenant isolation (projects list)"
  $projectsA = Invoke-Api $client "Get" "/api/projects" $tokenAAdmin $null $true
  Expect-Status $projectsA 200 "GET /api/projects (A)" | Out-Null

  $projectsB = Invoke-Api $client "Get" "/api/projects" $tokenBAdmin $null $true
  Expect-Status $projectsB 200 "GET /api/projects (B)" | Out-Null

  $aIds = @()
  if ($projectsA.Json -and $projectsA.Json.projects) { $aIds = @($projectsA.Json.projects | ForEach-Object { $_.id }) }
  $bIds = @()
  if ($projectsB.Json -and $projectsB.Json.projects) { $bIds = @($projectsB.Json.projects | ForEach-Object { $_.id }) }

  Assert-True ($aIds -contains $projectAId) "A default project appears in A project list"
  Assert-True (-not ($bIds -contains $projectAId)) "B cannot see A projectId (RLS)"

  Write-Title "4) Reports (template -> generate -> download)"
  $tpl = Invoke-Api $client "Post" "/api/reports/templates" $tokenAAdmin @{ name = "Smoke Template"; modules = @("rankings"); range = "7d" } $true
  if (-not (Expect-Status $tpl 200 "POST /api/reports/templates")) { throw "Cannot proceed" }
  $tplId = $tpl.Json.template.id
  Assert-True (!!$tplId) "Template id returned"

  $gen = Invoke-Api $client "Post" "/api/reports/generate" $tokenAAdmin @{ templateId = $tplId; sendEmail = $false } $true
  if (-not (Expect-Status $gen 200 "POST /api/reports/generate")) { throw "Cannot proceed" }
  $reportUuid = $gen.Json.id
  Assert-True (!!$reportUuid) "Generated report uuid id returned"
  Assert-True ($gen.Json.outputUrl -like "/api/reports/*/download") "outputUrl shape is /api/reports/<id>/download"

  $pdf = Invoke-Api $client "Get" ("/api/reports/$reportUuid/download") $tokenAAdmin $null $false
  Expect-Status $pdf 200 "GET /api/reports/:id/download (uuid)" | Out-Null
  Assert-True ($pdf.ContentType -eq "application/pdf") "Download content-type is application/pdf"
  $isPdf = $false
  if ($pdf.Bytes -and $pdf.Bytes.Length -ge 4) {
    $isPdf = ($pdf.Bytes[0] -eq 0x25 -and $pdf.Bytes[1] -eq 0x50 -and $pdf.Bytes[2] -eq 0x44 -and $pdf.Bytes[3] -eq 0x46)
  }
  Assert-True $isPdf "Downloaded bytes start with %PDF"

  Write-Title "5) Report schedules (create -> list -> delete)"
  $sched = Invoke-Api $client "Post" "/api/reports/schedules" $tokenAAdmin @{ templateId = $tplId; frequency = "daily"; emailRecipients = @("qa@example.com"); hour = 9; enabled = $true } $true
  if (-not (Expect-Status $sched 200 "POST /api/reports/schedules")) { throw "Cannot proceed" }
  $schedId = $sched.Json.schedule.id
  Assert-True (!!$schedId) "Schedule id returned"

  $schedList = Invoke-Api $client "Get" "/api/reports/schedules" $tokenAAdmin $null $true
  Expect-Status $schedList 200 "GET /api/reports/schedules" | Out-Null

  $hasSched = $false
  if ($schedList.Json -and $schedList.Json.schedules) {
    $hasSched = @($schedList.Json.schedules | Where-Object { $_.id -eq $schedId }).Count -gt 0
  }
  Assert-True $hasSched "Schedule appears in list"

  $schedDel = Invoke-Api $client "Delete" ("/api/reports/schedules/$schedId") $tokenAAdmin $null $true
  Expect-Status $schedDel 200 "DELETE /api/reports/schedules/:id" | Out-Null

  Write-Title "6) RBAC gates (admin -> analyst -> manager)"
  $rbacListAdmin = Invoke-Api $client "Get" "/api/rbac/users" $tokenAAdmin $null $true
  Expect-Status $rbacListAdmin 200 "GET /api/rbac/users (admin)" | Out-Null

  $setAnalyst = Invoke-Api $client "Post" ("/api/rbac/users/$userAId") $tokenAAdmin @{ role = "analyst" } $true
  Expect-Status $setAnalyst 200 "POST /api/rbac/users/:id (set analyst)" | Out-Null

  $loginAnalyst = Invoke-Api $client "Post" "/api/auth/login" $null @{ email = $emailA; password = $password } $true
  Expect-Status $loginAnalyst 200 "POST /api/auth/login (after analyst)" | Out-Null
  $tokenAnalyst = $loginAnalyst.Json.token

  $rbacListAnalyst = Invoke-Api $client "Get" "/api/rbac/users" $tokenAnalyst $null $true
  Assert-True ($rbacListAnalyst.Status -eq 403) "Analyst cannot GET /api/rbac/users (403)"

  $notifAnalyst = Invoke-Api $client "Get" "/api/notifications/settings" $tokenAnalyst $null $true
  Assert-True ($notifAnalyst.Status -eq 403) "Analyst cannot GET /api/notifications/settings (403)"

  $setManager = Invoke-Api $client "Post" ("/api/rbac/users/$userAId") $tokenAAdmin @{ role = "manager" } $true
  Expect-Status $setManager 200 "POST /api/rbac/users/:id (set manager)" | Out-Null

  $loginManager = Invoke-Api $client "Post" "/api/auth/login" $null @{ email = $emailA; password = $password } $true
  Expect-Status $loginManager 200 "POST /api/auth/login (after manager)" | Out-Null
  $tokenManager = $loginManager.Json.token

  $notifManager = Invoke-Api $client "Get" "/api/notifications/settings" $tokenManager $null $true
  Expect-Status $notifManager 200 "Manager can GET /api/notifications/settings" | Out-Null

  $setAdminBack = Invoke-Api $client "Post" ("/api/rbac/users/$userAId") $tokenAAdmin @{ role = "admin" } $true
  Expect-Status $setAdminBack 200 "POST /api/rbac/users/:id (restore admin)" | Out-Null

  Write-Title "7) API Keys (admin-only)"
  $apiKeyCreate = Invoke-Api $client "Post" "/api/api-keys" $tokenAAdmin @{ name = "Smoke Key"; projectId = $projectAId; permissions = @("reports:read") } $true
  if ($apiKeyCreate.Status -eq 500 -and $apiKeyCreate.Text -match "encryption") {
    Write-Skip "API key routes skipped (set API_KEY_ENCRYPTION_SECRET to enable)"
  } else {
    Expect-Status $apiKeyCreate 200 "POST /api/api-keys (admin)" | Out-Null
    $apiKeyId = $apiKeyCreate.Json.apiKey.id
    Assert-True (!!$apiKeyId) "API key id returned"

    # Analyst cannot list/reveal
    $setAnalyst2 = Invoke-Api $client "Post" ("/api/rbac/users/$userAId") $tokenAAdmin @{ role = "analyst" } $true
    Expect-Status $setAnalyst2 200 "Set analyst (for api-keys gate test)" | Out-Null

    $loginAnalyst2 = Invoke-Api $client "Post" "/api/auth/login" $null @{ email = $emailA; password = $password } $true
    Expect-Status $loginAnalyst2 200 "Login analyst (for api-keys gate test)" | Out-Null
    $tokenAnalyst2 = $loginAnalyst2.Json.token

    $apiKeyListAnalyst = Invoke-Api $client "Get" "/api/api-keys" $tokenAnalyst2 $null $true
    Assert-True ($apiKeyListAnalyst.Status -eq 403) "Analyst cannot GET /api/api-keys (403)"

    $apiKeyRevealAnalyst = Invoke-Api $client "Get" ("/api/api-keys/$apiKeyId/reveal") $tokenAnalyst2 $null $true
    Assert-True ($apiKeyRevealAnalyst.Status -eq 403) "Analyst cannot reveal API key (403)"

    # Restore admin
    $restoreAdmin2 = Invoke-Api $client "Post" ("/api/rbac/users/$userAId") $tokenAAdmin @{ role = "admin" } $true
    Expect-Status $restoreAdmin2 200 "Restore admin" | Out-Null
  }

  Write-Title "8) Cross-tenant report access should be blocked"
  $cross = Invoke-Api $client "Get" ("/api/reports/$reportUuid/download") $tokenBAdmin $null $false
  Assert-True ($cross.Status -eq 404) "Tenant B cannot download Tenant A report (404)"

  Write-Title "9) Workflows / SERP (optional; requires Redis)"
  $flow = Invoke-Api $client "Post" "/api/flows/start" $tokenAAdmin @{ flowName = "seo-content-pipeline"; projectId = $projectAId; seedKeyword = $SeedKeyword } $true
  if ($flow.Status -ge 200 -and $flow.Status -lt 300) {
    Write-Pass "POST /api/flows/start succeeded"
  } else {
    Write-Skip "Flows start skipped/failed (likely Redis not running): HTTP $($flow.Status)"
  }

  $track = Invoke-Api $client "Post" "/api/serp/track-project" $tokenAAdmin @{ projectId = $projectAId; locale = "zh-TW" } $true
  if ($track.Status -ge 200 -and $track.Status -lt 300) {
    Write-Pass "POST /api/serp/track-project enqueued"
  } else {
    Write-Skip "SERP tracking skipped/failed (likely Redis not running): HTTP $($track.Status)"
  }

  $ranks = Invoke-Api $client "Get" ("/api/serp/ranks?projectId=$projectAId&limit=20") $tokenAAdmin $null $true
  if ($ranks.Status -eq 200) {
    $count = 0
    if ($ranks.Json -and $ranks.Json.rows) { $count = @($ranks.Json.rows).Count }
    Write-Pass "GET /api/serp/ranks returned $count rows"
  } else {
    Write-Skip "Ranks list skipped/failed: HTTP $($ranks.Status)"
  }

} finally {
  if ($client) { $client.Dispose() }
}

Write-Title "Summary"
$failColor = if ($script:Failures -gt 0) { "Red" } else { "Green" }
Write-Host "Failures: $script:Failures" -ForegroundColor $failColor
Write-Host "Skips:    $script:Skips" -ForegroundColor "Yellow"

if ($script:Failures -gt 0) {
  exit 1
}

exit 0
