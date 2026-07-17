#!/usr/bin/env bash
# ArduPlane SITL'i onceden derlenmis Docker imajiyla baslatir (orthuk/ardupilot-sitl).
# Derleme YOK; imaj ilk seferde cekilir. TCP :5760'ta MAVLink sunar (kopru buraya baglanir).
# Kullanim: ./scripts/sitl.sh   (veya: npm run sitl)  — Ctrl+C ile durur.
#
# Container YENIDEN KULLANILIR (--rm yok) -> eeprom.bin korunur -> parametreler kalici.
# Sifir parametre icin:  SITL_RESET=1 npm run sitl
set -euo pipefail
NAME="${SITL_NAME:-wmp-sitl}"
[ "${SITL_RESET:-0}" = "1" ] && docker rm -f "$NAME" >/dev/null 2>&1 || true
if docker container inspect "$NAME" >/dev/null 2>&1; then
  echo "==> Var olan SITL container'i baslatiliyor (parametreler korunur) -> TCP :5760  (Ctrl+C durdurur)"
  exec docker start -a "$NAME"
fi
echo "==> Yeni ArduPlane SITL (orthuk/ardupilot-sitl) -> TCP :5760  (Ctrl+C durdurur)"
exec docker run --name "$NAME" -p 5760:5760 -p 14550:14550 orthuk/ardupilot-sitl \
  /home/docker/ardupilot/build/sitl/bin/arduplane -S --model plane --speedup 1 --slave 0 --sim-address=127.0.0.1 -I0
