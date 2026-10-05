$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BridgeEntry = Join-Path $RepoRoot "packages\gravitybridge\dist\index.js"
$ResultSchema = Join-Path $RepoRoot "schemas\result.schema.json"

$failed = $false

function Check-Command([string]$Name, [string[]]$Args = @("--version")) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Host "[FAIL] $Name not found" -ForegroundColor Red
    $script:failed = $true
    return
  }

  $output = & $Name @Args 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] $Name check failed: $output" -ForegroundColor Red
    $script:failed = $true
  } else {
    Write-Host "[OK] $Name $output" -ForegroundColor Green
  }
}

Write-Host "== GravityBridge doctor =="
Check-Command git
Check-Command node
Check-Command npm
Check-Command agy

if (Test-Path $BridgeEntry) {
  Write-Host "[OK] GravityBridge build exists: $BridgeEntry" -ForegroundColor Green
} else {
  Write-Host "[FAIL] GravityBridge build missing. Run scripts\setup.ps1" -ForegroundColor Red
  $failed = $true
}

if (Test-Path $ResultSchema) {
  Write-Host "[OK] result schema exists" -ForegroundColor Green
} else {
  Write-Host "[FAIL] result schema missing" -ForegroundColor Red
  $failed = $true
}

Write-Host "[info] Antigravity plugin inventory:"
& agy plugin list 2>&1

if ($failed) {
  exit 1
}

Write-Host "Doctor checks passed."
