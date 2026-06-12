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

# Shared .env parsing (encoding lessons documented there)
. (Join-Path $PSScriptRoot 'env-utils.ps1')
$vars = Import-LoadtestEnv -ScriptRoot $PSScriptRoot `
  -RequiredKeys 'STAGING_URL', 'LOADTEST_TOKEN', 'VERCEL_BYPASS'

if (-not (Test-Path (Join-Path $PSScriptRoot 'state.json'))) {
  Write-Host '[ERROR] loadtest\state.json not found. Run: node loadtest\seed.mjs'
  exit 1
}

$script = Join-Path $PSScriptRoot "k6\$Scenario.js"
Write-Host "Running $Scenario against $($vars['STAGING_URL'])"

# Auto-save full k6 output (incl. ERRO lines = client-side 5xx/timeout
# evidence). Vercel Hobby log retention is ~1h, so the durable record of
# failures lives here, not in the dashboard.
$resultsDir = Join-Path $PSScriptRoot 'results'
if (-not (Test-Path $resultsDir)) {
  New-Item -ItemType Directory -Path $resultsDir | Out-Null
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = Join-Path $resultsDir "$Scenario-$stamp.txt"

& $k6 run --no-color `
  -e "STAGING_URL=$($vars['STAGING_URL'])" `
  -e "LOADTEST_TOKEN=$($vars['LOADTEST_TOKEN'])" `
  -e "VERCEL_BYPASS=$($vars['VERCEL_BYPASS'])" `
  $script 2>&1 | Tee-Object -FilePath $outFile

$code = $LASTEXITCODE

# Tee-Object on PS 5.1 always writes UTF-16; re-encode to UTF-8 so the
# file is half the size and friendly to grep/diff tools.
(Get-Content $outFile) | Set-Content -Encoding UTF8 $outFile

Write-Host "Output saved to $outFile"
exit $code
