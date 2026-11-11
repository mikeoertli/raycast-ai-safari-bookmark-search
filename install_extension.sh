#!/usr/bin/env bash
set -euo pipefail

NAME="Safari Bookmark Search"
# Color status messages on terminals; keep redirected logs free of ANSI escapes.
BLUE="" GREEN="" YELLOW="" RED="" RESET=""
if [[ -t 2 && -z "${NO_COLOR:-}" && "${TERM:-}" != "dumb" ]]; then
  BLUE=$'\033[1;36m'
  GREEN=$'\033[1;32m'
  YELLOW=$'\033[1;33m'
  RED=$'\033[1;31m'
  RESET=$'\033[0m'
fi

fail() {
  local status="$1"
  printf >&2 '\n%s❌ Installation of %s failed (exit %s).%s\n' "$RED" "$NAME" "$status" "$RESET"
  exit "$status"
}
trap 'fail "$?"' ERR

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
VERSION="$(node -p 'require("./package.json").version')"
NAME="$NAME v$VERSION"

printf >&2 '\n%s🚀 Installing %s%s\n' "$BLUE" "$NAME" "$RESET"
if [[ ! -x node_modules/.bin/ray ]]; then
  printf >&2 '%s📦 Installing locked dependencies…%s\n' "$BLUE" "$RESET"
  npm ci
else
  printf >&2 '%s📦 Dependencies are already installed.%s\n' "$GREEN" "$RESET"
fi

printf >&2 '\n%s🧹 Checking manifest and source…%s\n' "$BLUE" "$RESET"
npm run lint
printf >&2 '\n%s🔨 Building the Raycast extension…%s\n' "$BLUE" "$RESET"
npm exec -- ray build --exit-on-error

printf >&2 '\n%s✅ %s installed!%s\n' "$GREEN" "$NAME" "$RESET"
printf >&2 '%s🔎 Open Search Safari Bookmarks by Intent in Raycast.%s\n' "$BLUE" "$RESET"
