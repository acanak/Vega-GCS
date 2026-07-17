#!/usr/bin/env bash
# Web Mission Planner - yerel gelistirme sunucusu (Vite).
# Kullanim: ./scripts/dev.sh   (veya: npm run dev)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- pnpm'i bul (PATH'te olmayabilir) ---
find_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then command -v pnpm; return; fi
  for c in "$HOME/.hermes/node/bin/pnpm" "$HOME/.local/bin/pnpm" "$HOME/.local/share/pnpm/pnpm"; do
    [ -x "$c" ] && { echo "$c"; return; }
  done
  echo ""
}
PNPM="$(find_pnpm)"

# --- bagimliliklari gerekiyorsa kur ---
if [ ! -d "$ROOT/node_modules" ]; then
  if [ -n "$PNPM" ]; then
    echo "==> Bagimliliklar kuruluyor (pnpm install)..."
    "$PNPM" install
  else
    echo "HATA: pnpm bulunamadi. Kurulum: npm install -g pnpm" >&2
    exit 1
  fi
fi

# --- vite'i DOGRUDAN calistir (pnpm'in deps-on-kontrolunu atla) ---
VITE=""
for c in "$ROOT/apps/web-gcs/node_modules/.bin/vite" "$ROOT/node_modules/.bin/vite"; do
  [ -x "$c" ] && { VITE="$c"; break; }
done
if [ -z "$VITE" ]; then
  echo "HATA: vite bulunamadi. Once bagimliliklari kurun (pnpm install)." >&2
  exit 1
fi

echo "==> Vite dev sunucusu baslatiliyor -> http://localhost:5173"
echo "    (Baglanti: WebSerial=USB otopilot  |  WebSocket=ws://localhost:8080 -> kopru/SITL)"
cd "$ROOT/apps/web-gcs"
exec "$VITE" "$@"
