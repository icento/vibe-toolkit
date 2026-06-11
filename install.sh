#!/usr/bin/env bash
# Install or upgrade the vibe-toolkit architecture-docs system in a target repository.
# Usage: ./install.sh /path/to/target-repo
#
# Upgrade model (conffile-style): .vibe-toolkit/manifest in the target records the
# sha256 of every file as installed. On re-install:
#   - file missing                          -> copied
#   - file unmodified since install         -> auto-updated when the toolkit changed it
#   - file modified by the target's team    -> never touched; warned when an update exists
#   - file present but never recorded       -> adopted if identical to the current toolkit,
#                                              otherwise warned (pre-manifest installs)
# docs/architecture/INDEX.md is generated in the target and is only copied when missing.
set -euo pipefail

TARGET="${1:?usage: ./install.sh <target-repo>}"
TOOLKIT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$TOOLKIT_DIR/template"
VERSION="$(cat "$TOOLKIT_DIR/VERSION")"

[ -d "$TARGET" ] || { echo "error: $TARGET is not a directory" >&2; exit 1; }
TARGET="$(cd "$TARGET" && pwd)"

MANIFEST="$TARGET/.vibe-toolkit/manifest"
VERSION_FILE="$TARGET/.vibe-toolkit/version"
NEW_MANIFEST="$(mktemp)"
trap 'rm -f "$NEW_MANIFEST"' EXIT

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}
hash_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1
  else shasum -a 256 | cut -d' ' -f1; fi
}
recorded_hash() { # $1 = rel path; prints the as-installed hash, empty if none
  [ -f "$MANIFEST" ] && awk -v r="$1" '$2 == r { print $1 }' "$MANIFEST" || true
}

copied=0; updated=0; current=0; kept=0; attn=0; unknown=0

while IFS= read -r src_file; do
  rel="${src_file#"$SRC"/}"
  case "$rel" in CLAUDE.md.section) continue ;; esac
  dest="$TARGET/$rel"
  new_hash="$(hash_file "$src_file")"

  if [ ! -e "$dest" ]; then
    mkdir -p "$(dirname "$dest")"
    cp "$src_file" "$dest"
    echo "$new_hash $rel" >> "$NEW_MANIFEST"
    copied=$((copied + 1))
    continue
  fi

  # The index is generated in the target; the template copy is only a seed.
  case "$rel" in docs/architecture/INDEX.md) continue ;; esac

  cur_hash="$(hash_file "$dest")"
  rec_hash="$(recorded_hash "$rel")"

  if [ -z "$rec_hash" ]; then
    if [ "$cur_hash" = "$new_hash" ]; then
      echo "$new_hash $rel" >> "$NEW_MANIFEST"   # pre-manifest install, already current: adopt
      current=$((current + 1))
    else
      echo "attention:   $rel — no install record and differs from toolkit v$VERSION;"
      echo "             diff against template/$rel and merge by hand"
      unknown=$((unknown + 1))
    fi
  elif [ "$cur_hash" = "$rec_hash" ]; then
    if [ "$cur_hash" = "$new_hash" ]; then
      echo "$new_hash $rel" >> "$NEW_MANIFEST"   # untouched and current
      current=$((current + 1))
    else
      cp "$src_file" "$dest"                     # untouched since install: safe to upgrade
      echo "$new_hash $rel" >> "$NEW_MANIFEST"
      echo "updated:     $rel"
      updated=$((updated + 1))
    fi
  else
    echo "$rec_hash $rel" >> "$NEW_MANIFEST"     # keep the as-installed record
    kept=$((kept + 1))
    if [ "$new_hash" != "$cur_hash" ] && [ "$new_hash" != "$rec_hash" ]; then
      echo "attention:   $rel — modified locally AND toolkit v$VERSION updates it;"
      echo "             diff against template/$rel and merge by hand"
      attn=$((attn + 1))
    fi
  fi
done < <(find "$SRC" -type f)

# The agent contract lives between markers inside the target's CLAUDE.md.
# Same rules as files: append when absent, replace in place when untouched,
# never touch a locally edited section.
SECTION_KEY="CLAUDE.md.section"
new_sec_hash="$(hash_file "$SRC/CLAUDE.md.section")"
if [ -f "$TARGET/CLAUDE.md" ] && grep -q "vibe-toolkit:architecture" "$TARGET/CLAUDE.md"; then
  cur_sec_hash="$(awk '/<!-- vibe-toolkit:architecture -->/,/<!-- \/vibe-toolkit:architecture -->/' \
    "$TARGET/CLAUDE.md" | hash_stdin)"
  rec_sec_hash="$(recorded_hash "$SECTION_KEY")"
  if [ "$cur_sec_hash" = "$new_sec_hash" ]; then
    echo "$new_sec_hash $SECTION_KEY" >> "$NEW_MANIFEST"
    current=$((current + 1))
  elif [ -n "$rec_sec_hash" ] && [ "$cur_sec_hash" = "$rec_sec_hash" ]; then
    awk -v sec="$SRC/CLAUDE.md.section" '
      /<!-- vibe-toolkit:architecture -->/ { while ((getline line < sec) > 0) print line; skip = 1 }
      /<!-- \/vibe-toolkit:architecture -->/ { skip = 0; next }
      !skip { print }
    ' "$TARGET/CLAUDE.md" > "$TARGET/CLAUDE.md.tmp" && mv "$TARGET/CLAUDE.md.tmp" "$TARGET/CLAUDE.md"
    echo "$new_sec_hash $SECTION_KEY" >> "$NEW_MANIFEST"
    echo "updated:     CLAUDE.md architecture section"
    updated=$((updated + 1))
  else
    [ -n "$rec_sec_hash" ] && echo "$rec_sec_hash $SECTION_KEY" >> "$NEW_MANIFEST"
    echo "attention:   CLAUDE.md architecture section — modified locally AND toolkit"
    echo "             v$VERSION updates it; diff against template/CLAUDE.md.section"
    kept=$((kept + 1)); attn=$((attn + 1))
  fi
else
  { [ -f "$TARGET/CLAUDE.md" ] && printf "\n"; cat "$SRC/CLAUDE.md.section"; } >> "$TARGET/CLAUDE.md"
  echo "$new_sec_hash $SECTION_KEY" >> "$NEW_MANIFEST"
  echo "appended architecture contract to CLAUDE.md"
  copied=$((copied + 1))
fi

mkdir -p "$TARGET/.vibe-toolkit"
sort -k2 "$NEW_MANIFEST" > "$MANIFEST"
prev_version="$( [ -f "$VERSION_FILE" ] && cat "$VERSION_FILE" || echo "" )"
echo "$VERSION" > "$VERSION_FILE"

# Older installs may keep a locally-modified pre-`check` script — fall back.
if grep -q '"check"' "$TARGET/scripts/arch-docs.mjs"; then
  (cd "$TARGET" && node scripts/arch-docs.mjs check)
else
  echo "note: target's scripts/arch-docs.mjs predates 'check' (kept: modified locally)"
  (cd "$TARGET" && node scripts/arch-docs.mjs index >/dev/null && node scripts/arch-docs.mjs lint)
fi

echo
if [ -n "$prev_version" ] && [ "$prev_version" != "$VERSION" ]; then
  echo "vibe-toolkit v$prev_version -> v$VERSION"
fi
echo "installed: $copied copied, $updated updated, $current already current," \
  "$kept kept (modified locally), $unknown unrecorded"
if [ $((attn + unknown)) -gt 0 ]; then
  echo "review the 'attention' lines above — those files need a manual diff/merge."
fi
echo "next steps:"
echo "  1. Edit docs/architecture/principles.md — replace the example constraints"
echo "  2. Fill in docs/architecture/views/{context,containers}.md for your system"
echo "  3. Start non-trivial work with /vibe-request; use /vibe-adr and /vibe-design for decisions and components"
