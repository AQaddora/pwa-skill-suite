#!/usr/bin/env bash
#
# install.sh — install the pwa-skill-suite skills into your Claude skills directory.
#
# Copies every skills/<name>/ directory (each containing a SKILL.md) into
#   ${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}
# Idempotent: re-running overwrites the installed copy in place. Prints exactly
# what it installed. Nothing here touches the audited project or the network.
#
# Usage:
#   bash install.sh              # install into the skills directory
#   bash install.sh --dry-run    # list what would be installed, copy nothing
#   CLAUDE_SKILLS_DIR=/path bash install.sh   # install elsewhere
#
set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "install.sh: unknown argument '$arg' (try --dry-run or --help)" >&2
      exit 2
      ;;
  esac
done

# Resolve the repo's skills/ directory relative to this script, so the installer
# works regardless of the caller's working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SRC_DIR="$SCRIPT_DIR/skills"
DEST_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

if [ ! -d "$SRC_DIR" ]; then
  echo "install.sh: no skills/ directory found at $SRC_DIR" >&2
  exit 1
fi

# Discover skills: any immediate subdirectory of skills/ that has a SKILL.md.
skills=()
for skill_md in "$SRC_DIR"/*/SKILL.md; do
  [ -e "$skill_md" ] || continue
  skills+=("$(basename "$(dirname "$skill_md")")")
done

if [ "${#skills[@]}" -eq 0 ]; then
  echo "install.sh: no skills/*/SKILL.md found under $SRC_DIR" >&2
  exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Would install ${#skills[@]} skill(s) into $DEST_DIR:"
  for name in "${skills[@]}"; do
    echo "  - $name"
  done
  echo "(dry run — nothing copied)"
  exit 0
fi

mkdir -p "$DEST_DIR"
echo "Installing ${#skills[@]} skill(s) into $DEST_DIR:"
for name in "${skills[@]}"; do
  rm -rf "${DEST_DIR:?}/$name"
  cp -R "$SRC_DIR/$name" "$DEST_DIR/$name"
  echo "  installed $name"
done
echo "Done."
