# One-time (and after every git pull) setup: build GravityBridge and register it with Antigravity + Codex.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 [--skip-agy] [--skip-codex] [--dry-run]
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Bridge = Join-Path $RepoRoot "packages\gravitybridge"

foreach ($c in @("git", "node", "npm")) {
  if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { throw "Required command not found: $c. Install it, open a NEW terminal, and run this script again." }
}

Write-Host "== Building GravityBridge =="
Push-Location $Bridge
try {
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed ($LASTEXITCODE)" }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed ($LASTEXITCODE)" }
}
finally {
  Pop-Location
}

& node (Join-Path $Bridge "dist\install.js") @args
exit $LASTEXITCODE
