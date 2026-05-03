#!/usr/bin/env bash
# Backend chooses free ports and writes frontend/.proxy-dev-ports.json; wait for that
# file before starting Vite so the dev proxy and WS URL match the Axum port.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
rm -f frontend/.proxy-dev-ports.json

cleanup() {
  kill "${BACKEND_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

MITM=1 cargo run -p proxy-app &
BACKEND_PID=$!

deadline=$((SECONDS + 600))
while [[ ! -f frontend/.proxy-dev-ports.json ]]; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    wait "$BACKEND_PID" || true
    echo "backend exited before writing frontend/.proxy-dev-ports.json"
    exit 1
  fi
  if (( SECONDS > deadline )); then
    echo "timed out waiting for frontend/.proxy-dev-ports.json"
    exit 1
  fi
  sleep 0.05
done

(cd frontend && npm run dev)
