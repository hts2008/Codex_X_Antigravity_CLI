# Health check. Optional argument: path of a target project repository.
$RepoRoot = Split-Path -Parent $PSScriptRoot
& node (Join-Path $RepoRoot "packages\gravitybridge\dist\install.js") --doctor @args
exit $LASTEXITCODE
