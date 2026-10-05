param(
  [Parameter(Mandatory=$true)]
  [string]$TargetRoot
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$TemplateRoot = Join-Path $RepoRoot "project-template\docs\GRAVITYBRIDGE"
$TargetRoot = (Resolve-Path $TargetRoot).Path
$TargetDir = Join-Path $TargetRoot "docs\GRAVITYBRIDGE"

if (-not (Test-Path (Join-Path $TargetRoot ".git"))) {
  $gitTop = & git -C $TargetRoot rev-parse --show-toplevel 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "TargetRoot is not inside a Git repository: $TargetRoot"
  }
}

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

$created = @()
$preserved = @()

Get-ChildItem -Path $TemplateRoot -File | ForEach-Object {
  $dest = Join-Path $TargetDir $_.Name
  if (Test-Path $dest) {
    $preserved += $_.Name
    Write-Host "[preserve] docs/GRAVITYBRIDGE/$($_.Name)"
  } else {
    Copy-Item $_.FullName $dest
    $created += $_.Name
    Write-Host "[create] docs/GRAVITYBRIDGE/$($_.Name)"
  }
}

Write-Host ""
Write-Host "GravityBridge target scaffold complete."
Write-Host "Target: $TargetRoot"
Write-Host "Created: $($created -join ', ')"
Write-Host "Preserved: $($preserved -join ', ')"
Write-Host "Next: run prompts/02_NEW_PROJECT_BOOTSTRAP.md through Codex to populate/verify factual project values."
