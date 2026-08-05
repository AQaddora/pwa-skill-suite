#!/usr/bin/env bash
#
# install.sh — install pwa-skill-suite for Claude, Codex, or an explicit skills path.
#
# The executable skills depend on shared runtime packages. Both skills and runtime are
# staged inside the destination filesystem before directory-level renames make them
# visible, so an interrupted copy never exposes a partial runtime. Existing installed
# trees are backed up during the swap and restored if any rename fails.
#
# Usage:
#   bash install.sh [--target claude|codex] [--dest /path/to/skills] [--dry-run]
#   bash install.sh --claude          # alias for --target claude (the default)
#   bash install.sh --codex           # alias for --target codex
#
# Target defaults:
#   claude  ${CLAUDE_SKILLS_DIR:-${CLAUDE_HOME:-$HOME/.claude}/skills}
#   codex   ${CODEX_SKILLS_DIR:-${CODEX_HOME:-$HOME/.codex}/skills}
#
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "install.sh: Node.js 20 or newer is required" >&2
  exit 2
fi
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "install.sh: Node.js 20 or newer is required (found $(node --version))" >&2
  exit 2
fi

DRY_RUN=0
TARGET="claude"
DEST_OVERRIDE=""

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --dest)
      if [ "$#" -lt 2 ] || [ -z "$2" ] || [[ "$2" == --* ]]; then
        echo "install.sh: --dest requires a directory path" >&2
        exit 2
      fi
      DEST_OVERRIDE="$2"
      shift 2
      ;;
    --dest=*)
      DEST_OVERRIDE="${1#--dest=}"
      if [ -z "$DEST_OVERRIDE" ]; then
        echo "install.sh: --dest requires a directory path" >&2
        exit 2
      fi
      shift
      ;;
    --target)
      if [ "$#" -lt 2 ]; then
        echo "install.sh: --target requires 'claude' or 'codex'" >&2
        exit 2
      fi
      TARGET="$2"
      shift 2
      ;;
    --target=*)
      TARGET="${1#--target=}"
      shift
      ;;
    --claude)
      TARGET="claude"
      shift
      ;;
    --codex)
      TARGET="codex"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "install.sh: unknown argument '$1' (try --help)" >&2
      exit 2
      ;;
  esac
done

case "$TARGET" in
  claude|codex) ;;
  *)
    echo "install.sh: unsupported target '$TARGET' (expected claude or codex)" >&2
    exit 2
    ;;
esac

if [ -n "$DEST_OVERRIDE" ]; then
  DEST_DIR="$DEST_OVERRIDE"
else
  case "$TARGET" in
    claude)
      if [ -n "${CLAUDE_SKILLS_DIR:-}" ]; then
        DEST_DIR="$CLAUDE_SKILLS_DIR"
      elif [ -n "${CLAUDE_HOME:-}" ]; then
        DEST_DIR="$CLAUDE_HOME/skills"
      elif [ -n "${HOME:-}" ]; then
        DEST_DIR="$HOME/.claude/skills"
      else
        echo "install.sh: HOME is unset; pass --dest or set CLAUDE_SKILLS_DIR" >&2
        exit 2
      fi
      ;;
    codex)
      if [ -n "${CODEX_SKILLS_DIR:-}" ]; then
        DEST_DIR="$CODEX_SKILLS_DIR"
      elif [ -n "${CODEX_HOME:-}" ]; then
        DEST_DIR="$CODEX_HOME/skills"
      elif [ -n "${HOME:-}" ]; then
        DEST_DIR="$HOME/.codex/skills"
      else
        echo "install.sh: HOME is unset; pass --dest or set CODEX_SKILLS_DIR" >&2
        exit 2
      fi
      ;;
  esac
fi

case "$DEST_DIR" in
  ""|/)
    echo "install.sh: refusing unsafe destination '$DEST_DIR'" >&2
    exit 2
    ;;
esac

# Resolve symlink chains without relying on non-portable `readlink -f`. This keeps a
# symlinked installer anchored to the suite that owns it, never to the caller's project.
INSTALLER_SOURCE="${BASH_SOURCE[0]}"
while [ -L "$INSTALLER_SOURCE" ]; do
  INSTALLER_DIR="$(cd -P "$(dirname "$INSTALLER_SOURCE")" && pwd)"
  INSTALLER_LINK="$(readlink "$INSTALLER_SOURCE")"
  case "$INSTALLER_LINK" in
    /*) INSTALLER_SOURCE="$INSTALLER_LINK" ;;
    *) INSTALLER_SOURCE="$INSTALLER_DIR/$INSTALLER_LINK" ;;
  esac
done
SCRIPT_DIR="$(cd -P "$(dirname "$INSTALLER_SOURCE")" && pwd)"
SRC_SKILLS_DIR="$SCRIPT_DIR/skills"
SRC_PACKAGES_DIR="$SCRIPT_DIR/packages"
SRC_PACKAGE_JSON="$SCRIPT_DIR/package.json"
SRC_PACKAGE_LOCK="$SCRIPT_DIR/package-lock.json"
RUNTIME_NAME=".pwa-skill-suite"

if [ ! -d "$SRC_SKILLS_DIR" ]; then
  echo "install.sh: no skills/ directory found at $SRC_SKILLS_DIR" >&2
  exit 1
fi
if [ ! -d "$SRC_PACKAGES_DIR" ]; then
  echo "install.sh: no packages/ runtime found at $SRC_PACKAGES_DIR" >&2
  exit 1
fi
if [ ! -f "$SRC_PACKAGE_JSON" ] || [ ! -f "$SRC_PACKAGE_LOCK" ]; then
  echo "install.sh: package.json and package-lock.json are required for the runtime" >&2
  exit 1
fi

skills=()
for skill_md in "$SRC_SKILLS_DIR"/*/SKILL.md; do
  [ -e "$skill_md" ] || continue
  skills+=("$(basename "$(dirname "$skill_md")")")
done

if [ "${#skills[@]}" -eq 0 ]; then
  echo "install.sh: no skills/*/SKILL.md found under $SRC_SKILLS_DIR" >&2
  exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Would install ${#skills[@]} skill(s) into $DEST_DIR:"
  for name in "${skills[@]}"; do
    echo "  - $name"
  done
  echo "  - shared runtime ($RUNTIME_NAME/packages)"
  echo "(dry run — nothing copied)"
  exit 0
fi

mkdir -p "$DEST_DIR"
DEST_DIR="$(cd "$DEST_DIR" && pwd -P)"
if [ "$DEST_DIR" = / ]; then
  echo "install.sh: refusing unsafe destination '/'" >&2
  exit 2
fi

# `mkdir` is the atomic operation: only one installer can own this destination at a
# time, including callers that reached it through different symlink paths.
LOCK_DIR="$DEST_DIR/.pwa-skill-suite.install.lock"
LOCK_HELD=0
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "install.sh: another install is already using $DEST_DIR" >&2
  if [ -f "$LOCK_DIR/pid" ]; then
    echo "install.sh: lock owner pid: $(sed -n '1p' "$LOCK_DIR/pid")" >&2
  fi
  echo "install.sh: if that process is no longer running, remove $LOCK_DIR and retry" >&2
  exit 3
fi
LOCK_HELD=1

# Keep staging on the destination filesystem so each published tree is a rename,
# not a cross-filesystem copy. Cleanup is restricted to mktemp's validated child.
STAGE_DIR=""
COMMIT_STARTED=0
COMMIT_COMPLETE=0
KEEP_STAGE=0
PUBLISHED_TARGETS=()
BACKUP_TARGETS=()
HAD_ORIGINALS=()

rollback_install() {
  local i target backup discard had_original
  local rollback_failed=0
  if ! mkdir -p "$STAGE_DIR/rollback"; then
    echo "install.sh: rollback could not create $STAGE_DIR/rollback" >&2
    return 1
  fi
  for ((i=${#PUBLISHED_TARGETS[@]} - 1; i >= 0; i--)); do
    target="${PUBLISHED_TARGETS[$i]}"
    backup="${BACKUP_TARGETS[$i]}"
    had_original="${HAD_ORIGINALS[$i]}"
    discard="$STAGE_DIR/rollback/$i"
    if [ -e "$backup" ] || [ -L "$backup" ]; then
      if [ -e "$target" ] || [ -L "$target" ]; then
        if ! mv "$target" "$discard"; then
          echo "install.sh: rollback could not move replacement away from $target" >&2
          rollback_failed=1
          # The original backup is still safe. Do not overwrite either tree.
          continue
        fi
      fi
      if ! mv "$backup" "$target"; then
        echo "install.sh: rollback could not restore $backup to $target" >&2
        # Crucially, the backup remains under STAGE_DIR for manual recovery.
        rollback_failed=1
      fi
    elif [ "$had_original" -eq 0 ] && { [ -e "$target" ] || [ -L "$target" ]; }; then
      # No original existed. If the new tree was published before interruption,
      # move it back into the bounded staging area instead of recursively deleting it.
      if ! mv "$target" "$discard"; then
        echo "install.sh: rollback could not retract new target $target" >&2
        rollback_failed=1
      fi
    fi
  done
  return "$rollback_failed"
}

release_install_lock() {
  if [ "$LOCK_HELD" -ne 1 ]; then
    return 0
  fi
  # Remove only the known owner file and then the empty directory. Unexpected content
  # is never recursively removed and therefore cannot be mistaken for our lock state.
  if [ -e "$LOCK_DIR/pid" ] || [ -L "$LOCK_DIR/pid" ]; then
    if ! rm -f -- "$LOCK_DIR/pid"; then
      return 1
    fi
  fi
  if ! rmdir "$LOCK_DIR"; then
    return 1
  fi
  LOCK_HELD=0
}

cleanup_install() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [ "$COMMIT_STARTED" -eq 1 ] && [ "$COMMIT_COMPLETE" -eq 0 ]; then
    if ! rollback_install; then
      KEEP_STAGE=1
      [ "$status" -ne 0 ] || status=1
      echo "install.sh: ROLLBACK FAILED; original backups remain at:" >&2
      echo "  $STAGE_DIR/backups" >&2
      echo "install.sh: preserve that recovery directory and restore it manually" >&2
    fi
  fi
  if [ "$KEEP_STAGE" -eq 0 ] && [ -n "$STAGE_DIR" ]; then
    case "$STAGE_DIR" in
      "$DEST_DIR"/.pwa-skill-suite.install.*)
        if ! rm -rf -- "$STAGE_DIR"; then
          echo "install.sh: could not clean staging directory $STAGE_DIR" >&2
          [ "$status" -ne 0 ] || status=1
        fi
        ;;
    esac
  fi
  if ! release_install_lock; then
    echo "install.sh: could not release install lock $LOCK_DIR" >&2
    [ "$status" -ne 0 ] || status=1
  fi
  exit "$status"
}
trap cleanup_install EXIT
trap 'exit 130' HUP INT TERM

printf '%s\n' "$$" > "$LOCK_DIR/pid"
STAGE_DIR="$(mktemp -d "$DEST_DIR/.pwa-skill-suite.install.XXXXXX")"
case "$STAGE_DIR" in
  "$DEST_DIR"/.pwa-skill-suite.install.*) ;;
  *)
    echo "install.sh: unsafe staging path '$STAGE_DIR'" >&2
    exit 1
    ;;
esac

mkdir -p "$STAGE_DIR/new-skills" "$STAGE_DIR/new-runtime" "$STAGE_DIR/backups/skills"
for name in "${skills[@]}"; do
  cp -R "$SRC_SKILLS_DIR/$name" "$STAGE_DIR/new-skills/$name"
done
cp -R "$SRC_PACKAGES_DIR" "$STAGE_DIR/new-runtime/packages"
cp "$SRC_PACKAGE_JSON" "$STAGE_DIR/new-runtime/package.json"
cp "$SRC_PACKAGE_LOCK" "$STAGE_DIR/new-runtime/package-lock.json"

# The checkout's npm script resolves through ./skills. In an installation the shared
# runtime is a sibling of the installed pwa-verify skill, so publish an installed-layout
# command without changing the checkout package used by contributors and CI.
node -e '
const fs = require("node:fs");
const file = process.argv[1];
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
pkg.scripts = { ...pkg.scripts, verify: "node ../pwa-verify/scripts/run-verify.mjs" };
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
' "$STAGE_DIR/new-runtime/package.json"

# Reinstalling the same locked runtime must not discard already-installed browser
# dependencies. Copy them into the staged replacement only when the lockfiles match;
# an incompatible runtime deliberately gets a clean dependency directory.
PRESERVED_RUNTIME_DEPS=0
EXISTING_RUNTIME="$DEST_DIR/$RUNTIME_NAME"
if [ -d "$EXISTING_RUNTIME/node_modules" ] \
  && [ ! -L "$EXISTING_RUNTIME/node_modules" ] \
  && [ -f "$EXISTING_RUNTIME/package-lock.json" ] \
  && cmp -s "$EXISTING_RUNTIME/package-lock.json" "$SRC_PACKAGE_LOCK"; then
  cp -R "$EXISTING_RUNTIME/node_modules" "$STAGE_DIR/new-runtime/node_modules"
  PRESERVED_RUNTIME_DEPS=1
fi

publish_tree() {
  local source="$1"
  local target="$2"
  local backup="$3"
  local had_original=0

  if [ -e "$target" ] || [ -L "$target" ]; then
    had_original=1
  fi
  PUBLISHED_TARGETS+=("$target")
  BACKUP_TARGETS+=("$backup")
  HAD_ORIGINALS+=("$had_original")

  if [ "$had_original" -eq 1 ]; then
    mv "$target" "$backup"
  fi
  mv "$source" "$target"
}

COMMIT_STARTED=1
publish_tree \
  "$STAGE_DIR/new-runtime" \
  "$DEST_DIR/$RUNTIME_NAME" \
  "$STAGE_DIR/backups/runtime"
for name in "${skills[@]}"; do
  publish_tree \
    "$STAGE_DIR/new-skills/$name" \
    "$DEST_DIR/$name" \
    "$STAGE_DIR/backups/skills/$name"
done
COMMIT_COMPLETE=1

echo "Installed ${#skills[@]} skill(s) into $DEST_DIR:"
for name in "${skills[@]}"; do
  echo "  installed $name"
done
echo "  installed shared runtime ($RUNTIME_NAME/packages)"
echo "Done. Static audits are ready."
if [ "$PRESERVED_RUNTIME_DEPS" -eq 1 ]; then
  echo "Preserved compatible browser verification dependencies."
else
  echo "To enable browser verification in this installed runtime:"
  echo "  npm ci --prefix \"$DEST_DIR/$RUNTIME_NAME\""
  echo "  npx --prefix \"$DEST_DIR/$RUNTIME_NAME\" playwright install chromium webkit"
fi
