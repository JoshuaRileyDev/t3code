#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_START_CMD=(corepack pnpm dev:desktop)

kill_stale_desktop_processes() {
  pkill -f -- "scripts/dev-runner.ts dev:desktop" >/dev/null 2>&1 || true
  pkill -f -- "apps/desktop/scripts/dev-electron.mjs" >/dev/null 2>&1 || true
  pkill -f -- "apps/desktop/scripts/start-electron.mjs" >/dev/null 2>&1 || true
  pkill -f -- "dist-electron/main.cjs" >/dev/null 2>&1 || true
}

run_app() {
  case "$MODE" in
    run)
      "${APP_START_CMD[@]}"
      ;;
    --debug|debug)
      lldb -- "${APP_START_CMD[@]}"
      ;;
    --logs|logs)
      "${APP_START_CMD[@]}" &
      app_pid=$!
      /usr/bin/log stream --info --style compact --predicate 'process == "Electron" || process == "T3 Code (Dev)" || process == "T3 Code (Alpha)"'
      wait "$app_pid"
      ;;
    --telemetry|telemetry)
      "${APP_START_CMD[@]}" &
      app_pid=$!
      /usr/bin/log stream --info --style compact --predicate 'subsystem == "com.t3tools.t3code" || subsystem == "com.t3tools.t3code.dev.local"'
      wait "$app_pid"
      ;;
    --verify|verify)
      "${APP_START_CMD[@]}" &
      app_pid=$!
      sleep 5
      pgrep -f -- "dist-electron/main.cjs" >/dev/null
      kill "$app_pid" >/dev/null 2>&1 || true
      ;;
    *)
      echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
      exit 2
      ;;
  esac
}

cd "$ROOT_DIR"
kill_stale_desktop_processes
corepack pnpm build:desktop
run_app
