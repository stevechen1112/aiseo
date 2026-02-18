$ErrorActionPreference = "Stop"

$BaseUrl = if ($env:BASE_URL -and $env:BASE_URL.Trim().Length -gt 0) { $env:BASE_URL.Trim() } else { "http://localhost:3001" }
$SeedKeyword = if ($env:SEED_KEYWORD -and $env:SEED_KEYWORD.Trim().Length -gt 0) { $env:SEED_KEYWORD.Trim() } else { "aiseo" }

function Get-ArgValue([string[]]$Argv, [string[]]$Names) {
  for ($i = 0; $i -lt $Argv.Length; $i++) {
    $a = $Argv[$i]
    if ($a -eq $null) { continue }
    if ($a -eq "--") { continue }

    foreach ($n in $Names) {
      if ($a -ieq $n) {
        if ($i + 1 -lt $Argv.Length) {
          $v = $Argv[$i + 1]
          if ($v -ne "--") { return $v }
        }
      }

      if ($a -like "$n=*") {
        return $a.Substring($n.Length + 1)
      }
    }
  }
  return $null
}

$baseArg = Get-ArgValue $args @('-BaseUrl', '--BaseUrl')
if ($baseArg) { $BaseUrl = $baseArg }

$seedArg = Get-ArgValue $args @('-SeedKeyword', '--SeedKeyword')
if ($seedArg) { $SeedKeyword = $seedArg }

Add-Type -AssemblyName System.Net.Http

$script:Failures = 0
$script:Skips = 0

function Write-Title([string]$Text) { Write-Host "\n=== $Text ===" -ForegroundColor Cyan }
function Write-Pass([string]$Text) { Write-Host "PASS: $Text" -ForegroundColor Green }
function Write-Fail([string]$Text) { Write-Host "FAIL: $Text" -ForegroundColor Red; $script:Failures++ }
function Write-Skip([string]$Text) { Write-Host "SKIP: $Text" -ForegroundColor Yellow; $script:Skips++ }

function Assert-True([bool]$Condition, [string]$Message) {
  if ($Condition) { Write-Pass $Message } else { Write-Fail $Message }
}

function ConvertTo-JsonCompact($Obj) {
  return ($Obj | ConvertTo-Json -Depth 30 -Compress)
}

function New-HttpClient() {
  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(25)
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
    return [pscustomobject]@{ Status = $status; ContentType = $contentType; Bytes = $bytes; Text = $null; Json = $null }
  }

  $text = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $jsonObj = $null
  if ($text) {
    try { $jsonObj = $text | ConvertFrom-Json -ErrorAction Stop } catch { $jsonObj = $null }
  }

  return [pscustomobject]@{ Status = $status; ContentType = $contentType; Bytes = $null; Text = $text; Json = $jsonObj }
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
  Write-Title "0) Health + Unauthorized checks"
  $health = Invoke-Api $client "Get" "/health" $null $null $true
  Assert-True ($health.Status -eq 200) "GET /health reachable"

  $unauthProjects = Invoke-Api $client "Get" "/api/projects" $null $null $true
  Assert-True ($unauthProjects.Status -eq 401) "GET /api/projects without Bearer -> 401"

  $badTokenProjects = Invoke-Api $client "Get" "/api/projects" "not-a-real-token" $null $true
  Assert-True ($badTokenProjects.Status -eq 401) "GET /api/projects with invalid Bearer -> 401"

  Write-Title "1) Auth: register/login/refresh/logout/me"
  $password = "password1234"
  $emailA = Random-Email "reg_a_"

  $regA = Invoke-Api $client "Post" "/api/auth/register" $null @{ email = $emailA; password = $password; name = "Reg A" } $true
  if (-not (Expect-Status $regA 200 "POST /api/auth/register (A)")) { throw "Cannot proceed" }

  $tokenA = $regA.Json.token
  $refreshA = $regA.Json.refreshToken
  $tenantA = $regA.Json.user.tenantId
  $projectA = $regA.Json.user.projectId
  $userAId = $regA.Json.user.id

  Assert-True (!!$tokenA) "register returns access token"
  Assert-True (!!$refreshA) "register returns refresh token"

  $meA = Invoke-Api $client "Get" "/api/auth/me" $tokenA $null $true
  Expect-Status $meA 200 "GET /api/auth/me" | Out-Null
  Assert-True ($meA.Json.user.tenantId -eq $tenantA) "/me tenant matches"

  $loginA = Invoke-Api $client "Post" "/api/auth/login" $null @{ email = $emailA; password = $password } $true
  Expect-Status $loginA 200 "POST /api/auth/login" | Out-Null

  $refreshResp = Invoke-Api $client "Post" "/api/auth/refresh" $null @{ refreshToken = $refreshA } $true
  Expect-Status $refreshResp 200 "POST /api/auth/refresh" | Out-Null
  $tokenA2 = $refreshResp.Json.token
  Assert-True (!!$tokenA2) "refresh returns new access token"

  $logout = Invoke-Api $client "Post" "/api/auth/logout" $tokenA2 @{} $true
  Expect-Status $logout 200 "POST /api/auth/logout" | Out-Null

  Write-Title "2) Projects CRUD + cross-tenant isolation"
  $emailB = Random-Email "reg_b_"
  $regB = Invoke-Api $client "Post" "/api/auth/register" $null @{ email = $emailB; password = $password; name = "Reg B" } $true
  if (-not (Expect-Status $regB 200 "POST /api/auth/register (B)")) { throw "Cannot proceed" }
  $tokenB = $regB.Json.token

  $createProj = Invoke-Api $client "Post" "/api/projects" $tokenA2 @{ name = "Regression Project"; domain = "example.org"; targetKeywords = @("aiseo","seo") } $true
  if (-not (Expect-Status $createProj 200 "POST /api/projects")) { throw "Cannot proceed" }
  $projNew = $createProj.Json.project.id

  $listA = Invoke-Api $client "Get" "/api/projects" $tokenA2 $null $true
  Expect-Status $listA 200 "GET /api/projects (A)" | Out-Null
  $hasNew = @($listA.Json.projects | Where-Object { $_.id -eq $projNew }).Count -gt 0
  Assert-True $hasNew "new project appears in A list"

  $listB = Invoke-Api $client "Get" "/api/projects" $tokenB $null $true
  Expect-Status $listB 200 "GET /api/projects (B)" | Out-Null
  $bSeesA = @($listB.Json.projects | Where-Object { $_.id -eq $projNew }).Count -gt 0
  Assert-True (-not $bSeesA) "B cannot see A project (RLS)"

  $updateByB = Invoke-Api $client "Put" ("/api/projects/$projNew") $tokenB @{ name = "hacked" } $true
  Assert-True ($updateByB.Status -eq 404) "B cannot update A project (404)"

  $deleteByB = Invoke-Api $client "Delete" ("/api/projects/$projNew") $tokenB $null $true
  Assert-True ($deleteByB.Status -eq 404) "B cannot delete A project (404)"

  $updateA = Invoke-Api $client "Put" ("/api/projects/$projNew") $tokenA2 @{ targetKeywords = @("aiseo","seo","platform") } $true
  Expect-Status $updateA 200 "PUT /api/projects/:id (A)" | Out-Null

  Write-Title "3) Backup export/import + Keywords endpoints"
  $import = Invoke-Api $client "Post" "/api/backup/import" $tokenA2 @{ project = @{ name = "Imported"; domain = "imported.test"; settings = @{ } }; keywords = @("aiseo","enterprise seo","keyword research") } $true
  if (-not (Expect-Status $import 200 "POST /api/backup/import")) { throw "Cannot proceed" }

  $kw = Invoke-Api $client "Get" "/api/keywords?page=1&limit=20" $tokenA2 $null $true
  Expect-Status $kw 200 "GET /api/keywords" | Out-Null
  Assert-True ($kw.Json.total -ge 3) "keywords total >= 3"

  $dist = Invoke-Api $client "Get" "/api/keywords/distribution?range=30d" $tokenA2 $null $true
  Expect-Status $dist 200 "GET /api/keywords/distribution" | Out-Null

  Write-Title "4) Notifications settings (admin/manager only)"
  $notifGet = Invoke-Api $client "Get" "/api/notifications/settings" $tokenA2 $null $true
  Expect-Status $notifGet 200 "GET /api/notifications/settings (admin)" | Out-Null

  $notifPost = Invoke-Api $client "Post" "/api/notifications/settings" $tokenA2 @{ slackWebhookUrl = ""; emailRecipients = @("qa@example.com"); types = @("alerts") } $true
  Expect-Status $notifPost 200 "POST /api/notifications/settings" | Out-Null

  Write-Title "5) Reports list + download by report_id"
  $tpl = Invoke-Api $client "Post" "/api/reports/templates" $tokenA2 @{ name = "Reg Tpl"; modules = @("rankings"); range = "7d" } $true
  Expect-Status $tpl 200 "POST /api/reports/templates" | Out-Null
  $tplId = $tpl.Json.template.id

  $gen = Invoke-Api $client "Post" "/api/reports/generate" $tokenA2 @{ templateId = $tplId; sendEmail = $false } $true
  Expect-Status $gen 200 "POST /api/reports/generate" | Out-Null
  $reportUuid = $gen.Json.id
  $reportId = $gen.Json.reportId

  $listReports = Invoke-Api $client "Get" "/api/reports?range=30d&limit=50" $tokenA2 $null $true
  Expect-Status $listReports 200 "GET /api/reports" | Out-Null

  $pdfByUuid = Invoke-Api $client "Get" ("/api/reports/$reportUuid/download") $tokenA2 $null $false
  Expect-Status $pdfByUuid 200 "GET /api/reports/<uuid>/download" | Out-Null

  $pdfByReportId = Invoke-Api $client "Get" ("/api/reports/$reportId/download") $tokenA2 $null $false
  Expect-Status $pdfByReportId 200 "GET /api/reports/<report_id>/download" | Out-Null

  Write-Title "6) RBAC + API Keys full lifecycle (admin-only)"
  # Create a second user in same tenant
  $newUserEmail = Random-Email "member_"
  $rbacCreate = Invoke-Api $client "Post" "/api/rbac/users" $tokenA2 @{ email = $newUserEmail; name = "Member"; role = "analyst" } $true
  Expect-Status $rbacCreate 200 "POST /api/rbac/users" | Out-Null

  $apiKeyCreate = Invoke-Api $client "Post" "/api/api-keys" $tokenA2 @{ name = "Reg Key"; projectId = $projectA; permissions = @("reports:read") } $true
  if ($apiKeyCreate.Status -eq 500 -and $apiKeyCreate.Text -match "encryption") {
    Write-Skip "API key routes skipped (API_KEY_ENCRYPTION_SECRET not configured)"
  } else {
    Expect-Status $apiKeyCreate 200 "POST /api/api-keys" | Out-Null
    $apiKeyId = $apiKeyCreate.Json.apiKey.id

    $apiKeyList = Invoke-Api $client "Get" "/api/api-keys" $tokenA2 $null $true
    Expect-Status $apiKeyList 200 "GET /api/api-keys" | Out-Null

    $apiKeyUpdate = Invoke-Api $client "Post" ("/api/api-keys/$apiKeyId") $tokenA2 @{ name = "Reg Key Renamed" } $true
    Expect-Status $apiKeyUpdate 200 "POST /api/api-keys/:id" | Out-Null

    $apiKeyReveal = Invoke-Api $client "Get" ("/api/api-keys/$apiKeyId/reveal") $tokenA2 $null $true
    Expect-Status $apiKeyReveal 200 "GET /api/api-keys/:id/reveal" | Out-Null

    $apiKeyRevoke = Invoke-Api $client "Post" ("/api/api-keys/$apiKeyId/revoke") $tokenA2 @{} $true
    Expect-Status $apiKeyRevoke 200 "POST /api/api-keys/:id/revoke" | Out-Null

    $revealRevoked = Invoke-Api $client "Get" ("/api/api-keys/$apiKeyId/reveal") $tokenA2 $null $true
    Assert-True ($revealRevoked.Status -eq 400) "reveal revoked api key -> 400"
  }

  Write-Title "7) Agents: keyword research trigger endpoint (optional; requires Redis)"
  $agent = Invoke-Api $client "Post" "/api/agents/keyword-researcher" $tokenA2 @{ projectId = $projectA; seedKeyword = $SeedKeyword } $true
  if ($agent.Status -ge 200 -and $agent.Status -lt 300) {
    Write-Pass "POST /api/agents/keyword-researcher enqueued"
  } else {
    Write-Skip "Agent enqueue skipped/failed (likely Redis not running): HTTP $($agent.Status)"
  }

  Write-Title "8) Flows: start (optional; requires Redis)"
  $flow = Invoke-Api $client "Post" "/api/flows/start" $tokenA2 @{ flowName = "seo-content-pipeline"; projectId = $projectA; seedKeyword = $SeedKeyword } $true
  if ($flow.Status -ge 200 -and $flow.Status -lt 300) {
    Write-Pass "POST /api/flows/start succeeded"
  } else {
    Write-Skip "Flow start skipped/failed: HTTP $($flow.Status)"
  }

} finally {
  if ($client) { $client.Dispose() }
}

Write-Title "Summary"
$failColor = if ($script:Failures -gt 0) { "Red" } else { "Green" }
Write-Host "Failures: $script:Failures" -ForegroundColor $failColor
Write-Host "Skips:    $script:Skips" -ForegroundColor "Yellow"

if ($script:Failures -gt 0) { exit 1 }
exit 0
