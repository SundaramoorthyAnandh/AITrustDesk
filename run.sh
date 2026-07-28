#!/usr/bin/env bash
#
# TrustDesk launcher — starts the DB (migrate + seed), the API, and both portals
# with one command, streaming colour-prefixed logs and shutting everything down
# cleanly on Ctrl+C.
#
#   ./run.sh              start everything (installs deps + seeds on first run)
#   ./run.sh --fresh      delete the SQLite DB first, then migrate + seed fresh
#   ./run.sh --no-seed    skip the migrate/seed step (DB already prepared)
#   ./run.sh --api-only   start only the API (no portals)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

API_PORT=4000
CUSTOMER_PORT=5173
AGENT_PORT=5174
DB_FILE="backend/trustdesk.db"

FRESH=0
SEED=1
API_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH=1 ;;
    --no-seed) SEED=0 ;;
    --api-only) API_ONLY=1 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# ── colours ──────────────────────────────────────────────────────────
C_MAIN=$'\033[1;36m'; C_API=$'\033[32m'; C_CUST=$'\033[35m'; C_AGENT=$'\033[34m'; C_RST=$'\033[0m'
log() { printf '%s[trustdesk]%s %s\n' "$C_MAIN" "$C_RST" "$*"; }

# ── 1. dependencies ──────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  log "Installing dependencies (first run — this can take a minute)…"
  npm install
fi

# ── 2. free the ports we need (stops any previous run) ───────────────
free_port() {
  local port="$1" pids
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    log "Port $port busy — stopping PID(s): $pids"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
}
free_port "$API_PORT"
[ "$API_ONLY" -eq 0 ] && { free_port "$CUSTOMER_PORT"; free_port "$AGENT_PORT"; }

# ── 3. database: migrate + seed (idempotent) ─────────────────────────
if [ "$FRESH" -eq 1 ]; then
  log "Resetting database ($DB_FILE)…"
  rm -f "$DB_FILE" "$DB_FILE"-wal "$DB_FILE"-shm "$DB_FILE"-journal
fi
if [ "$SEED" -eq 1 ]; then
  log "Preparing database (migrate + seed, idempotent)…"
  npm run load
fi

# ── 4. start services, prefix their logs, kill the whole group on exit ─
cleanup() { echo; log "Shutting down…"; kill 0 2>/dev/null || true; }
trap cleanup INT TERM EXIT

log "Starting API on :$API_PORT …"
( npm run start -w backend 2>&1 | sed "s/^/${C_API}[api]     ${C_RST} /" ) &

# wait for the API to answer /health before starting the portals
if command -v curl >/dev/null 2>&1; then
  for _ in $(seq 1 30); do
    curl -sf "http://localhost:$API_PORT/health" >/dev/null 2>&1 && { log "API is healthy."; break; }
    sleep 1
  done
fi

if [ "$API_ONLY" -eq 0 ]; then
  log "Starting Customer Complaint Portal on :$CUSTOMER_PORT …"
  ( npm run dev -w web/customer-portal 2>&1 | sed "s/^/${C_CUST}[customer]${C_RST} /" ) &

  log "Starting Agent Console on :$AGENT_PORT …"
  ( npm run dev -w web/agent-portal 2>&1 | sed "s/^/${C_AGENT}[agent]   ${C_RST} /" ) &
fi

echo
log "TrustDesk is up:"
log "  API      → http://localhost:$API_PORT  (health: /health)"
if [ "$API_ONLY" -eq 0 ]; then
  log "  Customer → http://localhost:$CUSTOMER_PORT"
  log "  Agent    → http://localhost:$AGENT_PORT"
fi
log "Demo logins (password 'Password123!'): customer alice.johnson@example.com · agent agent@trustdesk.io"
log "Press Ctrl+C to stop everything."
echo

wait
