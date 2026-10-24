#!/usr/bin/env bash
# One-time (and after every git pull) setup: build GravityBridge and register it with Antigravity + Codex.
# Options are passed to the installer: --skip-agy, --skip-codex, --dry-run
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE="$ROOT/packages/gravitybridge"
for c in git node npm; do
  command -v "$c" >/dev/null 2>&1 || { echo "[FAIL] Missing required command: $c" >&2; exit 1; }
done
echo "== Building GravityBridge =="
cd "$BRIDGE"
npm ci --no-audit --no-fund
npm run build
node "$BRIDGE/dist/install.js" "$@"
