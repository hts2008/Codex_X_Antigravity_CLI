# Runs ONE tiny real task with Antigravity in a throw-away repo and checks every safety mechanism.
$RepoRoot = Split-Path -Parent $PSScriptRoot
& node (Join-Path $RepoRoot "packages\gravitybridge\dist\install.js") --smoke
exit $LASTEXITCODE
