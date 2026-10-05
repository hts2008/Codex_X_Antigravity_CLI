#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE="$ROOT/packages/gravitybridge"
PLUGIN="$ROOT/antigravity-plugin/codex-worker"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "[FAIL] Missing required command: $1" >&2; exit 1; }
  echo "[OK] $1 -> $(command -v "$1")"
}

echo "== GravityBridge setup =="
require git
require node
require npm
require agy

cd "$BRIDGE"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build
npm run typecheck

if [[ "${1:-}" != "--skip-antigravity-plugin" ]]; then
  echo "[info] Installing Antigravity plugin: codex-worker"
  agy plugin install "$PLUGIN" || echo "[WARN] Plugin install failed; it may already exist. Reinstall/update it manually if needed."
fi

echo "Setup completed."
echo "Next: $ROOT/scripts/doctor.sh"
