#!/usr/bin/env bash
# Runs `playwright test` in its own process group and, however this script
# ends (normal exit, Ctrl+C, SIGTERM), stops that whole group: the browsers and
# the webServer (npm run dev on :3100) that Playwright only closes on SIGINT.
# First SIGINT, so Playwright shuts down cleanly; after 10 s, SIGTERM.
#
#   scripts/playwright-test.sh [playwright test args...]
set -u
set -m # job control: the background job gets its own process group

npx playwright test "$@" &
PW_PID=$!

stop_group() {
  if kill -0 -- "-$PW_PID" 2>/dev/null; then
    kill -INT -- "-$PW_PID" 2>/dev/null
    for _ in $(seq 1 10); do
      kill -0 -- "-$PW_PID" 2>/dev/null || return
      sleep 1
    done
    kill -TERM -- "-$PW_PID" 2>/dev/null
  fi
}
trap 'stop_group; exit 130' INT TERM
trap stop_group EXIT

wait "$PW_PID"
STATUS=$?
exit "$STATUS"
