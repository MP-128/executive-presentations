#!/usr/bin/env bash
# Copy the subset of the executive-presentations skill the app needs into ./skill (tech-stack.md §4).
# The original skill is never modified. Excludes .venv, node_modules, __pycache__ and examples/.
set -euo pipefail
SRC="${1:-$HOME/.claude/skills/executive-presentations}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/skill"
rm -rf "$DEST" && mkdir -p "$DEST/scripts"
cp "$SRC/SKILL.md" "$DEST/"
cp -R "$SRC/references" "$SRC/assets" "$DEST/"
cp "$SRC"/scripts/*.js "$SRC"/scripts/*.py "$SRC/scripts/package.json" "$DEST/scripts/"
find "$DEST" -name .DS_Store -delete
printf "Source: %s\nCopied: %s\nExcluded: .venv, node_modules, __pycache__, examples/\n" "$SRC" "$(date +%F)" > "$DEST/SOURCE.md"
echo "Vendored skill into $DEST"
