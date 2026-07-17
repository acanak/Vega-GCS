#!/usr/bin/env bash
# Tam yerel yigin: ArduPlane SITL (Docker) + WS kopru (TCP 5760) + web uygulamasi.
# Tek komut: npm run dev:sitl
#
# SITL onceden derlenmis imajla baslatilir (orthuk/ardupilot-sitl) — derleme yok.
# Kendi SITL'ini calistiriyorsan:  SITL_DOCKER=0 npm run dev:sitl
# UDP SITL (sim_vehicle --out=udpout:127.0.0.1:14550) icin:  MODE=udp SITL_DOCKER=0 npm run dev:sitl
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${MODE:-tcp}"
TCP_PORT="${TCP_PORT:-5760}"
TCP_HOST="${TCP_HOST:-127.0.0.1}"
NAME="${SITL_NAME:-wmp-sitl}"
SITL_DOCKER="${SITL_DOCKER:-1}"

cleanup() {
  [ -n "${BRIDGE_PID:-}" ] && kill "$BRIDGE_PID" 2>/dev/null || true
  [ "$SITL_DOCKER" = "1" ] && docker stop "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# --- SITL'i Docker'da baslat (onceden derlenmis imaj) ---
# ONEMLI: container YENIDEN KULLANILIR (--rm yok). ArduPilot parametreleri
# container icindeki /home/docker/ardupilot/eeprom.bin'e yazar; --rm ile silinince
# her acilista sifirlaniyordu. stop/start ile eeprom korunur -> parametreler kalici.
# Sifir parametreyle temiz baslamak icin:  SITL_RESET=1 npm run dev:sitl
if [ "$SITL_DOCKER" = "1" ]; then
  [ "${SITL_RESET:-0}" = "1" ] && { echo "==> SITL sifirlaniyor (SITL_RESET=1)"; docker rm -f "$NAME" >/dev/null 2>&1 || true; }
  if docker container inspect "$NAME" >/dev/null 2>&1; then
    echo "==> Var olan SITL container'i baslatiliyor (parametreler korunur; sifirlamak icin SITL_RESET=1)..."
    docker start "$NAME" >/dev/null
  else
    echo "==> Yeni ArduPlane SITL container'i olusturuluyor (orthuk/ardupilot-sitl)..."
    # Not: --defaults <plane.parm> bu imajda arduplane'i cokertiyordu (dumpcore); --model plane zaten uygun.
    docker run --name "$NAME" -d -p 5760:5760 -p 14550:14550 orthuk/ardupilot-sitl \
      /home/docker/ardupilot/build/sitl/bin/arduplane -S --model plane --speedup 1 --slave 0 --sim-address=127.0.0.1 -I0 >/dev/null
  fi
fi

# --- SITL TCP portu hazir olana kadar bekle ---
echo "==> SITL bekleniyor: ${TCP_HOST}:${TCP_PORT}"
READY=0
for _ in $(seq 1 60); do
  if (exec 3<>"/dev/tcp/${TCP_HOST}/${TCP_PORT}") 2>/dev/null; then exec 3<&-; READY=1; echo "==> SITL hazir (${TCP_HOST}:${TCP_PORT})"; break; fi
  sleep 1
done
[ "$READY" = 1 ] || echo "UYARI: ${TCP_HOST}:${TCP_PORT} acilmadi (docker logs $NAME ile bak). Yine de devam..." >&2

# --- Kopru (arka plan) ---
echo "==> Kopru (mod=${MODE}, ${TCP_HOST}:${TCP_PORT} -> WS :8080)..."
MODE="$MODE" TCP_PORT="$TCP_PORT" TCP_HOST="$TCP_HOST" bash "$ROOT/scripts/bridge.sh" &
BRIDGE_PID=$!

sleep 1
echo "==> Web uygulamasi. Tarayicida baglanti turu = WebSocket · kopru, ws://localhost:8080  (Ctrl+C hepsini durdurur)"
bash "$ROOT/scripts/dev.sh"
