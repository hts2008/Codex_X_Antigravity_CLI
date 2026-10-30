#!/usr/bin/env bash
# Health check. Optional argument: path of a target project repository.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/packages/gravitybridge/dist/install.js" --doctor "$@"
