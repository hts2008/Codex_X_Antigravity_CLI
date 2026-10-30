#!/usr/bin/env bash
# Runs ONE tiny real task with Antigravity in a throw-away repo and checks every safety mechanism.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/packages/gravitybridge/dist/install.js" --smoke
