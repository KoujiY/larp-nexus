# Shared .env loader for loadtest scripts (dot-source from run-k6.ps1 / smoke.ps1).
# Robust parsing: tolerates spaces around '=', quotes, BOM, UTF-16.
# NOTE: keep messages ASCII -- PS 5.1 misreads UTF-8-no-BOM files as ANSI.

function Import-LoadtestEnv {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ScriptRoot,
    [string[]]$RequiredKeys = @()
  )

  $envFile = Join-Path $ScriptRoot '.env'
  if (-not (Test-Path $envFile)) {
    Write-Host '[ERROR] loadtest\.env not found. Run: copy loadtest\env.example loadtest\.env'
    exit 1
  }

  $vars = @{}
  # -Encoding UTF8 is mandatory: PS 5.1 defaults to ANSI (CP950) and DBCS
  # mis-pairing of UTF-8 Chinese comment bytes can swallow the newline,
  # merging the next KEY=VALUE line into the comment.
  foreach ($raw in Get-Content $envFile -Encoding UTF8) {
    $line = $raw.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { continue }
    $i = $line.IndexOf('=')
    if ($i -lt 1) { continue }
    $vars[$line.Substring(0, $i).Trim()] = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
  }

  foreach ($key in $RequiredKeys) {
    if (-not $vars[$key]) {
      Write-Host "[ERROR] $key missing or empty in loadtest\.env"
      Write-Host "        keys found: $($vars.Keys -join ', ')"
      exit 1
    }
  }

  return $vars
}
