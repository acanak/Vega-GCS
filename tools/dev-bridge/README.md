# Dev Bridge

Tarayıcı ham TCP/UDP açamaz; bu küçük köprü aracın MAVLink akışını WebSocket'e çevirir.

## Kurulum
```
cd tools/dev-bridge && pnpm install
```

## SITL ile (UDP, varsayılan)
```
# 1) SITL:
sim_vehicle.py -v ArduCopter --out=udpout:127.0.0.1:14550
# 2) Köprü:
node bridge.mjs
# 3) Tarayıcıda: WebSocket link -> ws://localhost:8080
```

## TCP modu
```
MODE=tcp TCP_PORT=5760 node bridge.mjs
```

Ortam değişkenleri: `WS_PORT` (8080), `MODE` (udp|tcp), `UDP_PORT` (14550), `TCP_HOST` (127.0.0.1), `TCP_PORT` (5760).
