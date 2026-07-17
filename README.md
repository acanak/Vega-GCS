# Web Mission Planner

ArduPilot [Mission Planner](https://github.com/ardupilot/MissionPlanner) yer kontrol istasyonunun web (tarayıcı) versiyonu. Sıfırdan yazılıyor; Mission Planner yalnızca protokol/davranış referansıdır.

Kapsamlı plan ve yol haritası: **[PLAN.md](./PLAN.md)**.

## Durum — Faz 1 (Uçuş Verisi) + Faz 2 (Plan) + Faz 3 (Parametreler)

Uçtan uca akış kuruldu: **araç/SITL → Link → protokol motoru → HUD + harita + kontroller**.

| Paket | İçerik | Doğrulama |
|---|---|---|
| `packages/mavlink-codec` | MAVLink v1/v2 codec + CRC + üretilen diyalekt + jenerik decode/encode (herhangi mesaj) | 16 test ✓ |
| `packages/link` | Takılabilir `Link`: WebSerial + WebSocket | tsc ✓ |
| `packages/protocol` | `ProtocolEngine` (link-bağımsız çekirdek) + `MavConnection`; heartbeat, telemetri decode, arm/mod/komut | 11 test ✓ |
| `tools/mavgen` | MAVLink XML → TS diyalekt üreteci (crc_extra + tel-düzeni, **297 mesaj**) | crc_extra 10 bilinen değere karşı doğrulandı ✓ |
| `packages/mission` | Görev modeli, MAV_CMD kataloğu, .waypoints (QGC WPL 110) I/O, harita geometrisi | 4 test ✓ |
| `apps/web-gcs` | React SPA + **protokol Web Worker** (parse, render thread dışında): bağlantı, HUD, harita, telemetri, arm/mod, mesaj akışı | tsc + vite build ✓ |
| `tools/dev-bridge` | SITL/UDP/TCP MAVLink ↔ WebSocket köprüsü | — |

## Çalıştırma

Hazır scriptler (pnpm'in PATH/ön-kontrol tuzaklarını otomatik atlar; bağımlılık yoksa kurar):

```bash
npm run dev        # ./scripts/dev.sh    → Vite dev sunucusu  http://localhost:5173
npm run bridge     # ./scripts/bridge.sh → SITL/UDP/TCP ↔ WebSocket köprüsü  :8080
npm run dev:sitl   # köprü + uygulamayı birlikte başlatır
```

Elle kurulum: `pnpm install`.

### Gerçek donanım (USB otopilot)
`npm run dev` → tarayıcıda (Chromium) **WebSerial** link seç, baud gir (örn. 57600), Bağlan → USB portunu seç. Köprü gerekmez.

### SITL ile
```bash
# 1) ayrı terminal:
sim_vehicle.py -v ArduCopter --out=udpout:127.0.0.1:14550
# 2) köprü + uygulama:
npm run dev:sitl
# 3) tarayıcıda: WebSocket link -> ws://localhost:8080 -> Bağlan
```

### Testler / build
```bash
npm run build                          # tüm paketler (vite build dahil)
# testler (paket dizininde, pnpm ön-kontrolünü atlayarak):
( cd packages/mavlink-codec && ../../node_modules/.bin/vitest run )
( cd packages/protocol     && ../../node_modules/.bin/vitest run )
# diyalekti yeniden üret:
npm run generate:dialect
```

## Mimari (özet)

Tarayıcı ham TCP/UDP açamaz; MAVLink native çalışmaz. Bu yüzden:
- **WebSerial link** → USB otopilot/radyo (birincil, sunucusuz, Chromium).
- **WebSocket link** → köprü (TCP/UDP/serial ↔ WS), SITL ve ağ telemetrisi için.

MAVLink codec + protokol motoru ileride Web Worker'a taşınacak (parse'ı render thread'inden ayırmak için). Detay: PLAN.md §2–§3.

## Gereksinimler
Node ≥ 22, pnpm. (Bu ortamda pnpm `~/.hermes/node/bin/pnpm` konumunda.)
