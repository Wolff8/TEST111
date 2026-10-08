#!/usr/bin/env bash
# Feed the Murska Sobota wideband SDR into the live dashboard.
# One tuner ≈ 2.4 MHz. Hop or use a second dongle. Public bands only.
set -euo pipefail

API="${RF_API:-https://REPLACE.trycloudflare.com/api/rf}"
LAT="${SDR_LAT:-46.659}"
LON="${SDR_LON:-16.172}"
GAIN="${SDR_GAIN:-40}"

heartbeat() {
  curl -sS -m 12 "${API}?import=1&lat=${LAT}&lon=${LON}&mhz=${1}&mode=${2}&name=Murska%20Sobota%20SDR" >/dev/null || true
}

ism() {
  heartbeat 433.92 rtl_433
  if command -v rtl_433 >/dev/null; then
    rtl_433 -f 433.92M -g "$GAIN" -F json | while read -r line; do
      curl -sS -m 8 -H 'Content-Type: application/json' -d "$line" "$API" >/dev/null || true
    done
  else
    echo "install rtl_433 for 433.92 ISM weather" >&2
  fi
}

adsb() {
  heartbeat 1090 adsb
  if command -v readsb >/dev/null; then
    readsb --net --net-beast-output "${SDR_TCP:-bore.pub:45870}" --lat "$LAT" --lon "$LON" --gain "$GAIN"
  elif command -v dump1090 >/dev/null; then
    dump1090 --net --lat "$LAT" --lon "$LON" --gain "$GAIN"
  elif [[ -f /run/readsb/aircraft.json ]]; then
    while true; do
      curl -sS -m 8 -H 'Content-Type: application/json' --data-binary @/run/readsb/aircraft.json "$API" >/dev/null || true
      sleep 4
    done
  else
    echo "install readsb/dump1090 for 1090 ADS-B" >&2
  fi
}

hop() {
  echo "hop 433.92 (4 min) then 868.3 (90 s). Ctrl-C to stop."
  while true; do
    heartbeat 433.92 rtl_433
    timeout 240 rtl_433 -f 433.92M -g "$GAIN" -F json | while read -r line; do
      curl -sS -m 8 -H 'Content-Type: application/json' -d "$line" "$API" >/dev/null || true
    done || true
    heartbeat 868.3 rtl_433
    timeout 90 rtl_433 -f 868.3M -g "$GAIN" -F json | while read -r line; do
      curl -sS -m 8 -H 'Content-Type: application/json' -d "$line" "$API" >/dev/null || true
    done || true
  done
}

case "${1:-ism}" in
  ism) ism ;;
  adsb) adsb ;;
  hop) hop ;;
  beat) heartbeat "${2:-433.92}" "${3:-rtl_433}" ;;
  *) echo "usage: $0 ism|adsb|hop|beat [mhz mode]" >&2; exit 2 ;;
esac
