# Smoke test for staging gates (Deployment Protection + LOADTEST_TOKEN).
# Setup first: copy loadtest\env.example loadtest\.env and fill in values.
# NOTE: keep messages ASCII -- PS 5.1 misreads UTF-8-no-BOM files as ANSI.

# Shared .env parsing (encoding lessons documented there)
. (Join-Path $PSScriptRoot 'env-utils.ps1')
$vars = Import-LoadtestEnv -ScriptRoot $PSScriptRoot `
  -RequiredKeys 'STAGING_URL', 'LOADTEST_TOKEN', 'VERCEL_BYPASS'

$base = $vars['STAGING_URL'].TrimEnd('/')
$url = "$base/api/test/login"
Write-Host "Target: $base"
Write-Host ''

$c1 = & curl.exe -s -o NUL -w '%{http_code}' -X POST $url `
  -H "x-vercel-protection-bypass: $($vars['VERCEL_BYPASS'])" `
  -H "x-loadtest-token: $($vars['LOADTEST_TOKEN'])" `
  -H 'Content-Type: application/json' -d '{}'
Write-Host "[1/3] both headers       -> HTTP $c1  (expect 400 = both gates passed)"

$c2 = & curl.exe -s -o NUL -w '%{http_code}' -X POST $url `
  -H "x-vercel-protection-bypass: $($vars['VERCEL_BYPASS'])" `
  -H 'Content-Type: application/json' -d '{}'
Write-Host "[2/3] no loadtest token  -> HTTP $c2  (expect 404 = token gate works)"

$c3 = & curl.exe -s -o NUL -w '%{http_code}' -X POST $url `
  -H "x-loadtest-token: $($vars['LOADTEST_TOKEN'])" `
  -H 'Content-Type: application/json' -d '{}'
Write-Host "[3/3] no bypass header   -> HTTP $c3  (expect 401 = protection works)"

Write-Host ''
if ($c1 -eq '400' -and $c2 -eq '404' -and $c3 -eq '401') {
  Write-Host 'PASS: all three gates behave as expected'
  exit 0
}
Write-Host 'FAIL: compare actual codes with expected 400 / 404 / 401'
exit 1
