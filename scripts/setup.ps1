param(
  [switch]$SkipAntigravityPlugin
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Bridge = Join-Path $RepoRoot "packages\gravitybridge"
$Plugin = Join-Path $RepoRoot "antigravity-plugin\codex-worker"

function Require-Command([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Required command not found: $Name"
  }
  Write-Host "[ok] $Name -> $($cmd.Source)"
}

Write-Host "== GravityBridge setup =="
Require-Command git
Require-Command node
Require-Command npm
Require-Command agy

Write-Host "[info] Installing GravityBridge dependencies..."
Push-Location $Bridge
try {
  if (Test-Path "package-lock.json") {
    npm ci
  } else {
    npm install
  }
  npm run build
  npm run typecheck
}
finally {
  Pop-Location
}

if (-not $SkipAntigravityPlugin) {
  Write-Host "[info] Installing Antigravity plugin: codex-worker"
  & agy plugin install $Plugin
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Antigravity plugin install returned exit code $LASTEXITCODE. If the plugin already exists, update/reinstall it manually."
  }
}

Write-Host ""
Write-Host "Setup completed."
Write-Host "Next: $RepoRoot\scripts\doctor.ps1"
