#!/usr/bin/env bash
#
# Stop any TrustDesk services left running on the standard ports.
#
set -euo pipefail

for port in 4000 5173 5174; do
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Stopping port $port (PID: $pids)"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  else
    echo "Port $port already free"
  fi
done
