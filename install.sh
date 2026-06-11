#!/usr/bin/env bash
# Install the vibe-toolkit architecture-docs system into a target repository.
# Usage: ./install.sh /path/to/target-repo
set -euo pipefail

TARGET="${1:?usage: ./install.sh <target-repo>}"
SRC="$(cd "$(dirname "$0")/template" && pwd)"

[ -d "$TARGET" ] || { echo "error: $TARGET is not a directory" >&2; exit 1; }
TARGET="$(cd "$TARGET" && pwd)"

copied=0
skipped=0

# Copy every template file, never overwriting anything that already exists.
while IFS= read -r src_file; do
  rel="${src_file#"$SRC"/}"
  case "$rel" in CLAUDE.md.section) continue ;; esac
  dest="$TARGET/$rel"
  if [ -e "$dest" ]; then
    echo "skip (exists): $rel"
    skipped=$((skipped + 1))
  else
    mkdir -p "$(dirname "$dest")"
    cp "$src_file" "$dest"
    copied=$((copied + 1))
  fi
done < <(find "$SRC" -type f)

# Append the agent contract to CLAUDE.md, guarded by a marker so reruns are no-ops.
if [ -f "$TARGET/CLAUDE.md" ] && grep -q "vibe-toolkit:architecture" "$TARGET/CLAUDE.md"; then
  echo "skip (exists): CLAUDE.md architecture section"
else
  { [ -f "$TARGET/CLAUDE.md" ] && printf "\n"; cat "$SRC/CLAUDE.md.section"; } >> "$TARGET/CLAUDE.md"
  echo "appended architecture contract to CLAUDE.md"
fi

(cd "$TARGET" && node scripts/arch-docs.mjs check)

echo
echo "installed: $copied file(s) copied, $skipped skipped (already present)"
echo "next steps:"
echo "  1. Edit docs/architecture/principles.md — replace the example constraints"
echo "  2. Fill in docs/architecture/views/{context,containers}.md for your system"
echo "  3. Start non-trivial work with /vibe-request; use /vibe-adr and /vibe-design for decisions and components"
