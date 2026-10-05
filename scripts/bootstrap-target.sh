#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <target-project-root>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/project-template/docs/GRAVITYBRIDGE"
TARGET="$(cd "$1" && pwd)"
DEST="$TARGET/docs/GRAVITYBRIDGE"

git -C "$TARGET" rev-parse --show-toplevel >/dev/null
mkdir -p "$DEST"

created=()
preserved=()

for src in "$TEMPLATE"/*; do
  name="$(basename "$src")"
  dest="$DEST/$name"
  if [[ -e "$dest" ]]; then
    preserved+=("$name")
    echo "[preserve] docs/GRAVITYBRIDGE/$name"
  else
    cp "$src" "$dest"
    created+=("$name")
    echo "[create] docs/GRAVITYBRIDGE/$name"
  fi
done

echo
echo "GravityBridge target scaffold complete."
echo "Target: $TARGET"
echo "Next: run prompts/02_NEW_PROJECT_BOOTSTRAP.md through Codex to populate/verify factual project values."
