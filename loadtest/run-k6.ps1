# k6 launcher: loads loadtest/.env and injects values via -e flags.
# Usage: .\loadtest\run-k6.ps1 s1|s2|s3
# NOTE: keep messages ASCII (see smoke.ps1 for the encoding lesson).

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('s1', 's2', 's3')]
  [string]$Scenario
)

# Resolve k6: PATH first, then the default winget install location
# (PATH changes only reach terminals opened after the install).
$k6 = (Get-Command k6 -ErrorAction SilentlyContinue).Source
if (-not $k6) {
  $fallback = 'C:\Program Files\k6\k6.exe'
  if (Test-Path $fallback) {
    $k6 = $fallback
  } else {
    Write-Host '[ERROR] k6 not found. Install with: winget install k6'
    exit 1
  }
}

$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envFile)) {
  Write-Host '[ERROR] loadtest\.env not found. Run: copy loadtest\env.example loadtest\.env'
  exit 1
}

$vars = @{}
foreach ($raw in Get-Content $envFile -Encoding UTF8) {
  $line = $raw.Trim()
  if ($line -eq '' -or $line.StartsWith('#')) { continue }
  $i = $line.IndexOf('=')
  if ($i -lt 1) { continue }
  $vars[$line.Substring(0, $i).Trim()] = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
}

foreach ($key in 'STAGING_URL', 'LOADTEST_TOKEN', 'VERCEL_BYPASS') {
  if (-not $vars[$key]) {
    Write-Host "[ERROR] $key missing in loadtest\.env"
    exit 1
  }
}

if (-not (Test-Path (Join-Path $PSScriptRoot 'state.json'))) {
  Write-Host '[ERROR] loadtest\state.json not found. Run: node loadtest\seed.mjs'
  exit 1
}

$script = Join-Path $PSScriptRoot "k6\$Scenario.js"
Write-Host "Running $Scenario against $($vars['STAGING_URL'])"

& $k6 run `
  -e "STAGING_URL=$($vars['STAGING_URL'])" `
  -e "LOADTEST_TOKEN=$($vars['LOADTEST_TOKEN'])" `
  -e "VERCEL_BYPASS=$($vars['VERCEL_BYPASS'])" `
  $script

exit $LASTEXITCODE
