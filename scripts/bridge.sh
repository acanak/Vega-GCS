#!/usr/bin/env bash
# SITL/UDP/TCP MAVLink <-> WebSocket koprusu.
# Kullanim: ./scripts/bridge.sh            (UDP :14550 dinler, WS :8080 sunar)
#           MODE=tcp TCP_PORT=5760 ./scripts/bridge.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ws bagimliligini kontrol et (workspace uyesi -> koke kurulmus olmali)
if [ ! -e "$ROOT/node_modules/ws" ] && [ ! -e "$ROOT/tools/dev-bridge/node_modules/ws" ]; then
  echo "HATA: 'ws' bulunamadi. Once kok dizinde: pnpm install" >&2
  exit 1
fi

echo "==> Kopru baslatiliyor (WS :${WS_PORT:-8080}, mod=${MODE:-udp})"
exec node "$ROOT/tools/dev-bridge/bridge.mjs" "$@"
