#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0

check() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[FAIL] $1 not found"
    FAILED=1
    return
  fi
  echo "[OK] $1 $("$1" --version 2>&1 | head -n 1)"
}

echo "== GravityBridge doctor =="
check git
check node
check npm
check agy

[[ -f "$ROOT/packages/gravitybridge/dist/index.js" ]]   && echo "[OK] GravityBridge build exists"   || { echo "[FAIL] GravityBridge build missing"; FAILED=1; }

[[ -f "$ROOT/schemas/result.schema.json" ]]   && echo "[OK] result schema exists"   || { echo "[FAIL] result schema missing"; FAILED=1; }

echo "[info] Antigravity plugin inventory:"
agy plugin list 2>&1 || true

exit "$FAILED"
