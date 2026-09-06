#!/usr/bin/env sh
set -eu

URL="${1:-http://localhost:3000/health/ready}"
for attempt in $(seq 1 30); do
  if curl -fsS "$URL" >/dev/null; then
    echo "Health check passed: $URL"
    exit 0
  fi
  sleep 2
done

echo "Health check failed: $URL" >&2
exit 1
