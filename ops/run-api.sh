#!/usr/bin/env bash
# Runs the Tipee API and restarts it if it exits. For hosts without a service
# manager the deploying user can use; prefer ops/tipee-api.service where root
# is available.
#
#   TIPEE_ENV=~/.config/tipee/api.env ops/run-api.sh
set -u
cd "$(dirname "$0")/.."
ENV_FILE="${TIPEE_ENV:-$HOME/.config/tipee/api.env}"
LOG_DIR="${TIPEE_LOG_DIR:-$HOME/logs/tipee}"
mkdir -p "$LOG_DIR"
while true; do
  set -a; . "$ENV_FILE"; set +a
  node --experimental-strip-types packages/api/src/server.ts >> "$LOG_DIR/api.log" 2>&1
  echo "$(date -Is) api exited with $?; restarting in 3s" >> "$LOG_DIR/api.log"
  sleep 3
done
