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
  printf >&2 '\n%s❌ %s development command failed (exit %s).%s\n' "$RED" "$NAME" "$status" "$RESET"
  exit "$status"
}
trap 'fail "$?"' ERR

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
VERSION="$(node -p 'require("./package.json").version')"
NAME="$NAME v$VERSION"

exit_cleanly() {
  printf >&2 '\n%s🛑 Stopped developing %s.%s\n' "$YELLOW" "$NAME" "$RESET"
  exit 0
}
trap exit_cleanly INT

printf >&2 '\n%s💻 Starting %s development%s\n' "$BLUE" "$NAME" "$RESET"
printf >&2 '%s📦 Installing dependencies…%s\n' "$BLUE" "$RESET"
npm install
printf >&2 '\n%s🔄 Starting Raycast with live reloading…%s\n' "$BLUE" "$RESET"
printf >&2 '%s⌨️  Press Ctrl+C to stop.%s\n' "$YELLOW" "$RESET"
if npm run dev; then
  printf >&2 '\n%s✅ Finished developing %s.%s\n' "$GREEN" "$NAME" "$RESET"
else
  status=$?
  if [[ "$status" -eq 130 ]]; then
    exit_cleanly
  fi
  fail "$status"
fi
