#!/bin/bash
# Keep one working HTTPS quick tunnel and publish its URL to /tmp/ops-public-url.txt
set -u
BIN="${CLOUDFLARED_BIN:-/tmp/cloudflared}"
LOG=/tmp/ops-cf.log
URLFILE=/tmp/ops-public-url.txt
LOCK=/tmp/ops-public-link.lock
ENVFILE="${OPS_ENV_FILE:-/agent/.env}"

if ! mkdir "$LOCK" 2>/dev/null; then
  echo "keep-public-link already running"
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

kill_other_tunnels() {
  local keep="${1:-0}"
  for p in $(pgrep -f '/tmp/cloudflared tunnel --url' || true); do
    if [ "$p" != "$keep" ]; then
      kill "$p" 2>/dev/null || true
    fi
  done
}

write_url() {
  local url="$1"
  echo "$url" > "$URLFILE"
  if [ -f "$ENVFILE" ]; then
    if grep -q '^PUBLIC_BASE_URL=' "$ENVFILE"; then
      sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=$url|" "$ENVFILE"
    else
      echo "PUBLIC_BASE_URL=$url" >> "$ENVFILE"
    fi
  fi
}

while true; do
  kill_other_tunnels 0
  sleep 1
  : > "$LOG"
  "$BIN" tunnel --url http://127.0.0.1:4173 --no-autoupdate --ha-connections 1 --protocol http2 >"$LOG" 2>&1 &
  pid=$!
  url=""
  for i in $(seq 1 40); do
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | tail -1 || true)
    if [ -n "$url" ]; then
      write_url "$url"
      echo "public $url"
      break
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if [ -z "$url" ]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    echo "tunnel start failed; retry"
    sleep 3
    continue
  fi
  # This VM often cannot resolve *.trycloudflare.com (NXDOMAIN), so do not
  # curl the public hostname here — that remint loop kills a live tunnel.
  # Local health + a registered cloudflared connection is the liveness check.
  ok=0
  for i in $(seq 1 24); do
    local_code=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/api/health || echo 000)
    registered=$(grep -c 'Registered tunnel connection' "$LOG" 2>/dev/null || true)
    if [ "$local_code" = "200" ] && [ "${registered:-0}" -ge 1 ]; then
      ok=1
      echo "live $url"
      break
    fi
    echo "waiting local health $local_code registered ${registered:-0}"
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 2
  done
  if [ "$ok" != "1" ]; then
    echo "never became live; remint"
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    sleep 2
    continue
  fi
  while kill -0 "$pid" 2>/dev/null; do
    local_code=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/api/health || true)
    local_code=${local_code:-000}
    if [ "$local_code" != "200" ]; then
      echo "local health $local_code; remint"
      kill "$pid" 2>/dev/null || true
      break
    fi
    sleep 20
  done
  wait "$pid" 2>/dev/null || true
  rm -f "$URLFILE"
  sleep 2
done
