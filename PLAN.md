# Web Mission Planner — Uygulama Planı

> ArduPilot [Mission Planner](https://github.com/ardupilot/MissionPlanner) (C#/.NET WinForms masaüstü GCS) uygulamasının web (tarayıcı) versiyonunu sıfırdan inşa etme planı.
>
> Bu belge; kaynak kodun 6 alt sistemine dair derinlemesine envanter + 5 web-teknolojisi araştırması sonucunda üretilmiştir. Referans klon: `MissionPlanner` deposu (480 MB, 3678 C# dosyası) analiz edilmiştir; **yeni proje bu depodan türetilmez, sıfırdan yazılır** — Mission Planner yalnızca davranış/protokol referansıdır.

---

## 1. Yönetici Özeti

**Ne inşa ediyoruz:** Bir tarayıcıda çalışan, ArduPilot araçlarını (Copter/Plane/Rover/Sub/Heli/Tracker) izleyen ve kumanda eden modern bir yer kontrol istasyonu (GCS). Hedef: Mission Planner'ın sekmelerine (Flight Data, Flight Planner, Initial Setup, Config/Tuning, Simulation, Logs) uzun vadede tam pariteye ulaşmak.

**Çekirdek mimari zorluk — tek cümlede:** *MAVLink tarayıcıda doğrudan konuşulamaz.* Tarayıcı ham TCP/UDP soketi açamaz; seri porta yalnızca **WebSerial** ile (Chromium masaüstü, USB, ~%72 küresel destek, Safari/iOS ve stabil Firefox hariç) erişilebilir. Bu tek gerçek, QGroundControl (Qt) ve Mission Planner'ın neden birinci sınıf web sürümü olmadığını açıklar ve bizim tüm mimarimizi belirler.

**Sonuç:** İki referans web GCS bunu zaten kanıtladı — Blue Robotics **Cockpit** (Vue + Rust `mavlink-server` köprüsü) ve **ADOS Mission Control** (React/Next + CesiumJS, WebSocket/WebSerial). Ayrıca ArduPilot log inceleme alt sistemini *iki kez* web'e taşıdı (bu repodaki `ExtLibs/wasm` Blazor projesi ve bağımsız "UAV Log Viewer" Vue uygulaması). Yani yaklaşım de-risk edilmiş durumda; masaüstü uygulamayı "WASM'e derlemek" yerine sorumlulukları ayırıyoruz: **ince istemci SPA + araç bağlantısını taşıyan katman.**

---

## 2. Bağlantı Stratejisi (en kritik karar)

**Nihai karar (kullanıcı ile netleşti):** Birincil yol **WebSerial** — USB'ye takılı gerçek otopilotla test edilecek, sunucusuz. **TCP ve UDP de desteklenecek**, ancak tarayıcı ham TCP/UDP soketi açamadığı için doğrudan değil, ince bir köprü (WebSocket ↔ TCP/UDP) üzerinden.

> **Mutlak tarayıcı kısıtı:** Tarayıcı ham TCP/UDP açamaz; seri porta yalnızca WebSerial (Chromium/USB) ile erişir. Bu yüzden TCP/UDP her zaman bir köprü gerektirir.

**Çözüm — takılabilir "Link" katmanı (Mission Planner'ın `ICommsSerial` soyutlamasının web karşılığı).** Tek bir çift yönlü bayt-kanalı arayüzünün (`open/close/readable/writable/isOpen`) arkasına birden çok bağlantı arka ucu koyarız. **Aynı üst-katman protokol kodu (param/mission/command) hiç değişmeden tüm link tiplerinde çalışır:**

| Link tipi | Kullanım | Sunucu gerekir mi? | Tarayıcı desteği |
|---|---|---|---|
| **WebSerial link** | **Birincil:** USB otopilot / SiK telemetri radyosu | Hayır | Chromium masaüstü |
| **WebSocket link → köprü (TCP)** | Ağ telemetrisi, SITL (TCP 5760), ser2net | Evet (ince köprü) | Tüm tarayıcılar |
| **WebSocket link → köprü (UDP)** | Klasik 14550 UDP, companion computer | Evet (ince köprü) | Tüm tarayıcılar |
| WebUSB / WebBluetooth link | İleride: DFU flash, BLE radyolar | Hayır | Chromium |

- **Birincil (sizin test senaryonuz):** WebSerial link → USB otopilot. Sunucusuz, tek indirme.
- **TCP/UDP:** WebSocket link → köprü. Köprü olarak hazır `bluerobotics/mavlink-server` (Rust; serial/TCP/UDP ↔ WS+REST) kullanılır ya da küçük bir Node köprüsü yazılır. Bu köprü ileride SITL geliştirme ve ağ telemetrisi için de aynen kullanılır.
- **Uzak/filo (ileride):** bulut aktarım köprüsü (araç → cloud relay → tarayıcı), WSS + kimlik doğrulama ile.

**Neden köprü tek yol değil:** WebSerial yalnızca yerel USB radyoyu kurtarır; TCP/UDP, ağ telemetrisi, NTRIP, ADS-B decoder, companion computer bağlantılarının hepsi köprü ister. WebSerial birincil, köprü ise TCP/UDP ve ağ senaryoları için tamamlayıcıdır.

---

## 3. Önerilen Mimari

```
┌─────────────────────────────── TARAYICI (SPA) ───────────────────────────────┐
│                                                                               │
│  UI KATMANI (React ana thread)                                                │
│   Flight Data · Flight Planner · Setup · Config/Tuning · Sim · Logs           │
│      │  (rAF ile senkron, saniyede ~60 kez okur)                              │
│      ▼                                                                        │
│  STATE (üç kademe)                                                            │
│   HOT  : mutable telemetri deposu (React render'a bağlı DEĞİL) ── HUD/uPlot   │
│   WARM : rAF ile saniyede 4-10 flush → metin okumaları (Zustand/Valtio)       │
│   COLD : mission/param/config (Zustand + TanStack Query)                      │
│      ▲                                                                        │
│      │ postMessage (transferable typed-array / SharedArrayBuffer ring)        │
│  ┌───┴──────────────── WEB WORKER (parse thread) ─────────────────────────┐   │
│  │  MAVLink CODEC: frame parse/serialize · CRC-extra · dialect (XML→TS)    │   │
│  │  PROTOKOL MOTORU: connect/heartbeat · abonelik veri yolu · param /      │   │
│  │    mission / command(+ACK/retry) / data-stream / MAVFtp / signing       │   │
│  │  LINK: WebSerial  ── veya ──  WebSocket                                  │   │
│  └───────────────┬──────────────────────────────┬──────────────────────────┘   │
└──────────────────│──────────────────────────────│──────────────────────────────┘
        WebSerial (USB)                    WebSocket (wss)
                   │                              │
            ┌──────▼──────┐              ┌────────▼─────────┐
            │ USB autopilot│              │  MAVLink KÖPRÜ   │  (Rust: mavlink-server
            │ / SiK radyo  │              │  serial/UDP/TCP  │   veya dev'de küçük Node)
            └─────────────┘              │  ↔ WebSocket     │
                                         └────────┬─────────┘
                                          ┌───────▼────────┐
                                          │ SITL / gerçek  │
                                          │ araç (UDP/TCP) │
                                          └────────────────┘
```

**Mission Planner'ın iki-katmanlı yapısını koruyoruz** (kaynak analizinden doğrulandı):
1. **Transport katmanı** = `ICommsSerial` → web'de takılabilir Link (WebSerial/WebSocket).
2. **Protokol motoru** = `MAVLinkInterface` (~6900 satır) → web'de Web Worker'da çalışan saf TS.

**Neden Web Worker:** MP'nin IO'su senkron/bloklayıcı (`SemaphoreSlim readlock`, `giveComport` exclusive-access bayrağı). Web'de bunu async/await + link başına async mutex kuyruğuna dönüştürürüz. Parse/CRC/SHA'yı worker'a taşımak, 10-50 Hz telemetride ana thread'i (render) jank'ten korur. Ayrıca arka-plan sekme timer kısıtlaması 1 Hz heartbeat'i bozar — worker bunu da çözer.

---

## 4. Önerilen Teknoloji Yığını

Seçim ölçütü: *5 yıllık bakım ufku* + *ArduPilot GCS'ye özgü ihtiyaçlar (harita/3B/yoğun tablo)*. "Framework 50 Hz'i belirlemez; mimari belirler" — bu yüzden asıl kazanç, yüksek-hızlı telemetriyi framework render döngüsünün **dışında** tutmaktır.

| Katman | Seçim | Gerekçe |
|---|---|---|
| **Monorepo/build** | pnpm workspaces + Turborepo + Vite + TypeScript (strict) | Standart hafif monorepo; `apps/` + `packages/` |
| **Framework** | **React 19 + React Compiler** | En geniş ekosistem (react-map-gl, r3f, TanStack), en büyük işe alım havuzu, uzun ömür. (Güçlü alternatif: Svelte 5 — küçük ekip/perf odaklıysa.) |
| **State (HOT)** | Zustand transient subscribe / signal-ref | Telemetriyi render tetiklemeden okur — Canvas/uPlot rAF döngüsü için |
| **State (WARM/COLD)** | Zustand + Valtio + TanStack Query | rAF flush metin; sunucu durumu için Query |
| **MAVLink codec** | XML→TS üretimi (`mavgen --lang TypeScript`) veya `node-mavlink` diyalektleri | common.xml + ardupilotmega.xml; CI'de upstream XML'den yeniden üretilebilir |
| **Köprü (dev + prod)** | `bluerobotics/mavlink-server` (Rust) — kendi yazmak yerine yeniden kullan | Cockpit'in kanıtlanmış köprüsü; WS+REST fan-out, TLog, çok-uçlu yönlendirme hazır. (Kendi yazacaksan: Go + gomavlib.) |
| **Harita 2B** | **MapLibre GL JS v5** | BSD-2, GPU vektör, self-host, built-in terrain/globe; token/faturalama yok |
| **Harita yoğun katman** | **deck.gl** (MapboxOverlay, interleaved) | Çok araçlı/yüksek-hızlı iz render'ını GPU'ya taşır (TripsLayer/PathLayer) |
| **Çizim/düzenleme** | **Terra Draw** (`maplibre-gl-terradraw`) | mapbox-gl-draw'ın bakımlı halefi; waypoint/polygon/geofence |
| **Geo matematik** | **Turf.js** + özel survey-grid modülü | Mesafe/alan/bearing; lawnmower grid'i Turf primitifleriyle biz yazarız |
| **Offline tile** | **PMTiles/Protomaps** + Terrain-RGB (AWS Terrarium) | Tek dosya, OPFS cache, saha için offline |
| **3B (opsiyonel)** | **CesiumJS** | Terrain-following mission review + 3B log replay (bu repodaki Blazor sayfası hazır şablon) |
| **HUD / attitude** | **Canvas 2D** (imperatif, rAF, OffscreenCanvas) | 60 fps yapay ufuk; React render'dan tam ayrık |
| **Grafikler (tuning/log)** | **uPlot** | 166k nokta ~25 ms; imperatif setData bypass-React mimarisine uyar |
| **Bileşen kütüphanesi** | **Tailwind + shadcn/ui (Radix)** + **TanStack Table** | Yoğun kokpit UI; sahip olunan kod; 1000+ satırlık param grid'i |
| **i18n** | **i18next** | MP `.resx` → JSON'a dönüştür; **Türkçe zaten çevrilmiş** (`MainV2.tr.resx` vb.) — yeniden kullan |
| **PWA/offline** | vite-plugin-pwa (Workbox) + IndexedDB | Saha kullanımı; offline mission/param düzenleme, sync-on-reconnect |
| **Test** | Vitest + Playwright | Protokol state machine'leri için golden-file testleri |

**MAVSDK / Qt-WASM / Blazor-WASM KULLANMA** (araştırma bulgusu): MAVSDK-JavaScript bakımsız POC + Envoy gerektirir ve PX4-öncelikli; Qt-WASM'da seri/UDP yok (köprüden kaçamazsın) + dev WASM binary; ikisi de yanlış yol.

---

## 5. Özellik Haritası (Mission Planner → Web, fazlara göre)

Öncelik: **MVP** (asgari kullanışlı) · **v1** (ciddi ilk sürüm) · **later** (gelişmiş/niş). Karmaşıklık: L/M/H/VH.

### Comms / MAVLink çekirdeği
| Özellik | Öncelik | Karm. | Web notu |
|---|---|---|---|
| Frame parse/serialize (v1/v2) + CRC-extra | MVP | M/L | Saf mantık, worker'a taşınır; STX resync şart |
| Dialect (350 mesaj, MAV_CMD/enum'lar) | MVP | M | XML→TS üretimi |
| Transport soyutlaması (Link arayüzü) | MVP | L | `ICommsSerial` analoğu; `CommsInjection` = köprü dikişi |
| WebSocket link | MVP | L | Birincil dev/SITL yolu |
| WebSerial link | v1 | H | Gerçek USB; enumerasyon yok, kullanıcı diyalogu |
| Connect handshake / heartbeat tespiti | MVP | M | 2× HEARTBEAT bekle → aracı seç |
| GCS heartbeat + housekeeping döngüsü | MVP | L | worker'da setInterval(1000) |
| Merkezi RX pump (parse/verify/route/stats) | MVP | H | worker; abonelik veri yolu |
| Abonelik API (msgid bazlı) | MVP | L | EventEmitter/RxJS |
| Data-stream / SET_MESSAGE_INTERVAL | MVP | L | Hz takibi istemcide |
| COMMAND_LONG/INT + ACK + retry | MVP | M | Promise + one-shot ACK + timeout; link başına mutex |
| Arm/disarm, mod set, reboot | MVP | M | Mod-adı tablosu portlanır |
| Çok-araç / çok-link (sysid/compid) | v1 | M | `Map<id, VehicleState>` |
| Param indir (PARAM_REQUEST_LIST) | MVP | M | ilerleme + eksik index retry |
| Param indir (MAVFtp param.pck hızlı yol) | v1 | H | MAVFtp'ye bağlı |
| Param set (+verify) | v1 | M | PARAM_SET → PARAM_VALUE echo |
| Mission download/upload protokolü | v1 | H | 1e7 koordinat ölçekleme dikkatli portlanmalı |
| Guided goto / pos-vel target | v1 | M | tıkla-uç; web uçuş ekranına ideal |
| Fence + rally get/set | later | M | mission-protokol varyantı tercih |
| Dataflash log listeleme/indirme | v1 | H | chunk reassembly + WS backpressure |
| MAVFtp dosya transferi | later | VH | opcode state machine; param/log/lua açar |
| MAVLink 2 imzalama (signing) | v1 | H | Web Crypto async — worker'da batch |
| GPS RTCM / RTK inject + NTRIP | later | H | NTRIP köprü ister; fragmentasyon saf |
| tlog kayıt + playback | v1 | M | Blob/IndexedDB; aynı parser'ı besle |
| RC override / manual control | later | M | Gamepad API; WAN'da güvenlik uyarısı |

### Flight Data (canlı operasyon panosu)
| Özellik | Öncelik | Karm. | |
|---|---|---|---|
| HUD / yapay ufuk (attitude, hız, irtifa) | MVP | M | Canvas 2D / OffscreenCanvas |
| Harita + araç ikonu + iz | MVP | M | MapLibre symbol + deck.gl TripsLayer |
| Arm/disarm, mod değiştirme, quick actions | MVP | M | command katmanı üstünde ince sarmalayıcı |
| Telemetri okumaları / status bar | MVP | L | WARM tier |
| STATUSTEXT mesaj paneli + sesli uyarı | v1 | L | Web Speech API |
| Guided "Fly To Here" (haritaya tıkla) | v1 | M | click → lat/lng/alt |
| Tuning/graph canlı grafik | v1 | M | uPlot |
| Gauge'lar / aux data | v1 | M | Canvas |
| Video overlay (FPV) | v1 | H | WebRTC (mediamtx/janus) — bkz. §8 |
| Joystick paneli | v1 | M | Gamepad API |

### Flight Planner (görev editörü)
| Özellik | Öncelik | Karm. | |
|---|---|---|---|
| Düzenlenebilir waypoint komut grid'i | MVP | M | TanStack Table; mavcmd.xml→JSON dinamik kolon etiketleri |
| Harita: WP marker + rota polyline (WPOverlay) | MVP | M | Model → GeoJSON yeniden üret |
| Tıkla-ekle / insert / sil / sırala | MVP | L | |
| MAV_CMD kataloğu (66 komut, firmware bazlı) | MVP | M | mavcmd.xml→JSON |
| İrtifa modları (Rel/Abs/Terrain) + frame | MVP | L | birim çarpanları erken modellenmeli |
| Home/Takeoff/RTL/Land quick actions | MVP | L | |
| .waypoints (QGC WPL 110) yükle/kaydet | MVP | L | ~30 satır JS; offline değer |
| Haritada WP sürükleme (tek/orta-nokta/grup) | v1 | H | Terra Draw + dragend |
| Loiter komutları + radius çizimi | v1 | M | turf.circle + tanjant çıkış |
| Spline waypoint + eğri interpolasyon | v1 | H | Spline2 portu (veya Catmull-Rom yaklaşımı) |
| ROI markerları (DO_SET_ROI) | v1 | L | rotaya dahil değil işaretle |
| DO_/condition satırları (jump, servo, speed…) | v1 | L | çoğu sadece etiketli grid satırı |
| Mission upload/download UI (ilerleme) | MVP | H | protokol motoru + progress |
| .plan / .mission JSON (QGC uyumu) | v1 | M | RootObject TS tipi |
| KML/KMZ import (overlay/mission) | v1 | M | togeojson + JSZip |
| Geofence editörü (poligon/daire, dahil/hariç) | v1 | H | Terra Draw + MAV_MISSION_TYPE.FENCE |
| Rally points editörü | v1 | M | |
| **Survey grid üreteci** (lawnmower/corridor) | v1 | H | Grid.cs portu (proj4js UTM + turf); golden-file test |
| Elevation/terrain profil grafiği | v1 | H | terrain kaynağı ister (bkz. §8) |
| Terrain-follow / verify-height | v1 | H | DEM getAltitude endpoint |
| Poligon çizim aracı | v1 | M | Terra Draw + turf.area |
| Undo (Ctrl+Z) | v1 | L | structuredClone snapshot yığını |
| Mesafe/gradient/azimut kolonları | v1 | L | turf.distance/bearing |
| UTM/MGRS giriş/dönüşüm | later | M | proj4js + mgrs.js |
| SHP/DXF/GeoPackage import | later | H | her biri ayrı kütüphane |
| Skywriting (metin→WP) | later | M | opentype.js |

### Config / Tuning (parametre yönetimi)
| Özellik | Öncelik | Karm. | |
|---|---|---|---|
| Tam parametre listesi (raw grid) | MVP | M | virtualized grid; 1000+ satır |
| Param write / read-back / batch commit | MVP | H | köprü ister |
| Param indir / refresh (bulk) | MVP | H | ilerleme çubuğu |
| Param metadata (units/range/values/desc) | MVP | M | apm.pdef.xml (autotest.ardupilot.org) → IndexedDB; fallback bundle |
| Satır-içi akıllı editörler (num/enum/bitmask) | v1 | M | metadata tipine göre cell renderer |
| Değer doğrulama / range uyarı / ifade | v1 | L | mathjs |
| Arama / filtre / prefix ağacı / favoriler | v1 | L | localStorage |
| .param dosya yükle/kaydet | MVP | L | offline param editörü sağlar |
| Param karşılaştırma (dosya vs araç) | v1 | L | diff modal |
| GitHub frame-param preset | later | L | GitHub API |
| Commit-to-flash / reset / re-request | v1 | M | COMMAND_LONG |
| Standard/Advanced auto-gen ekranlar | v1 | M | metadata → bileşen |
| Extended Tuning (Copter PID paneli) | v1 | H | **alias tabloları** verbatim portlanmalı |
| Basic Tuning (araç bazlı) | v1 | M | acsimplepids.xml→JSON |
| Initial param hesaplayıcı | later | M | formüller 1:1 |
| Planner uygulama ayarları | later | L | localStorage/profil |

### Initial Setup (firmware + kalibrasyon sihirbazı)
> **Kritik bulgu:** Firmware flash hariç TÜM sihirbaz 5 MAVLink primitifine dayanır (setParam / getParamList / doCommand+ACK / subscribe / requestDatastream). ~%85'i transport-agnostik, tamamen web'e uygulanabilir.

| Özellik | Öncelik | Karm. | |
|---|---|---|---|
| Sihirbaz kabuğu + koşullu sayfa ağacı | MVP | L | route ağacı + boolean guard'lar |
| Frame class/type seçimi | MVP | L | 2 param + geçerlilik tablosu |
| Accel 6-nokta kalibrasyon | MVP | M | interaktif handshake |
| Level + simple accel cal | MVP | L | tek komut |
| Pusula/mag onboard kalibrasyon | v1 | M | 3 komut + MAG_CAL_PROGRESS/REPORT |
| Pusula konfigürasyon | v1 | L | param formu |
| Radio / RC kalibrasyon | MVP | M | RC_CHANNELS canlı bar + min/max yakala |
| Servo output setup + canlı | v1 | M | SERVO_OUTPUT_RAW |
| ESC kalibrasyon | v1 | L | param + yönerge |
| Motor test | v1 | L | DO_MOTOR_TEST + layout JSON; **props-off onayı** |
| Flight modes config | MVP | L | 6 dropdown + canlı highlight |
| Failsafe config | MVP | M | çok param + canlı status |
| Battery monitor setup + calib | v1 | L | preset + divider hesabı |
| Airspeed / OSD / gimbal / serial | later | L/M | param formları |
| Bootloader update (MAVLink) | v1 | L | tek COMMAND_LONG |
| **Install Firmware (manifest flash)** | v1 | **VH** | px4 bootloader → WebSerial portu veya native agent |
| DFU flashing | later | VH | WebUSB (Chromium) |
| MP-side ellipsoid mag cal | later | H | least-squares çözücü portu |
| DroneCAN/UAVCAN config + node flash | later | VH | SLCAN + Canard portu |

### Simulation & Logs
| Özellik | Öncelik | Karm. | |
|---|---|---|---|
| **DataFlash (.bin/.log) parse** | MVP | M | worker'da TS parser (ArduPilot UAV Log Viewer kanıtı) |
| tlog parse | MVP | M | worker |
| Log grafik (field tree + dual-axis) | MVP | M | uPlot |
| 2B harita iz (GPS/POS/CMD/CAM) | MVP | M | MapLibre polyline |
| Modes/Errors/Events/Messages tabloları | MVP | L | enum→JSON map |
| Preset/saved graph tanımları | v1 | L | graphs/*.xml → JSON |
| Türev-alan ifade motoru (mavextra) | v1 | H | mathjs + birkaç helper portu (IronPython bırak) |
| FFT / vibration analizi | v1 | M | fft.js + Plotly heatmap |
| Otomatik log analizi (verdict) | v1 | M | ~18 Python heuristic'i TS'e portla |
| 3B replay (Cesium) | v1 | H | Blazor sayfası hazır şablon |
| Raw data grid (graph/map sync) | v1 | M | TanStack Virtual |
| Params-from-log | v1 | L | PARM dedup + metadata join |
| tlog playback → HUD/map | v1 | M | clock çarpanı |
| KML/GPX/CSV export | later | L | Blob download |
| On-vehicle log download (MAVLink) | v1 | H | köprü / WebSerial |
| **SITL launcher + auto-connect** | later | VH | backend orchestrator (Docker) ister |

### Cross-cutting altyapı
| Özellik | Öncelik | Karm. | |
|---|---|---|---|
| App shell + view switcher | MVP | M | SPA router |
| App yaşam döngüsü / hata sınırı | MVP | L | web'de updater kaybolur (redeploy) |
| Harita sağlayıcılar + tile cache | v1 | M/H | PWA Service Worker |
| Temalar (dark/light/custom) | v1 | L | CSS değişkenleri + prefers-color-scheme |
| i18n (Türkçe dahil) | v1 | M | i18next; **Türkçe resx yeniden kullan** |
| Speech / audio uyarılar | v1 | L | Web Speech API |
| Joystick / gamepad | v1 | M | Gamepad API |
| Video (FPV/PTZ) | v1 | H | WebRTC gateway |
| Plugin sistemi | later | H | Roslyn imkansız → JS/TS ES-module plugin API yeniden tasarım |
| ADS-B trafik | later | H | köprü / CORS'lu API; yasal feed dikkati |
| Antenna tracker | later | M | MAVLink-tracker WS üstünde |
| Swarm / formasyon | later | H | çok-araç yönlendirme |

---

## 6. Fazlı Yol Haritası

**Faz 0 — İskelet & uçtan-uca kanıt** *(temeli kur)*
- pnpm+Turborepo monorepo, Vite, TS strict, CI, lint/format.
- `packages/mavlink-codec`: XML→TS dialect üretimi + CRC + frame parse/serialize; **birim testleri golden frame'lerle.**
- `packages/protocol`: Web Worker iskeleti, Link arayüzü, WebSocket link.
- Dev köprüsü: `mavlink-server` (Docker) + `sim_vehicle.py -v ArduCopter --out=udp:127.0.0.1:14550`.
- **Kanıt hedefi:** SITL → köprü → tarayıcı; canlı HEARTBEAT + attitude sayıları ekrana düşüyor. Bu, tüm riski erken kapatır.

**Faz 1 — MVP: Flight Data + bağlantı** *(sizin ilk sürüm seçiminiz)*
- Connect/disconnect UI, heartbeat handshake, RX pump, abonelik veri yolu, data-stream request.
- HUD (Canvas), harita + araç ikonu + iz, telemetri okumaları.
- Arm/disarm, mod değiştir, reboot; STATUSTEXT paneli.
- HOT/WARM/COLD state kademeleri + rAF flush disiplini (lint guardrail).
- Temel .waypoints yükle/kaydet (offline değer).
- **WebSerial link** eklenir (gerçek donanım hedefi) — aynı protokol kodu.

**Faz 2 — Flight Planner (görev planlama)**
- Mission model (tek reactive kaynak), komut grid'i, MAV_CMD kataloğu, irtifa modları.
- Harita WPOverlay (GeoJSON), tıkla-ekle/sürükle, home/takeoff/RTL/land.
- Mission upload/download protokolü + ilerleme; .plan/.mission JSON; KML import.
- Guided "Fly To Here".

**Faz 3 — Config / Tuning (parametreler)**
- Param store, bulk download (+MAVFtp param.pck), full param grid, write/read-back.
- Metadata repository (apm.pdef.xml + IndexedDB cache + bundle fallback).
- Akıllı editörler, arama/filtre/favoriler, .param yükle/kaydet, karşılaştırma.
- Friendly/Standard/Advanced + Basic/Extended tuning panelleri (alias tabloları).

**Faz 4 — Initial Setup (kalibrasyon)**
- Sihirbaz kabuğu; frame, accel/level, pusula, RC cal, flight modes, failsafe (MVP alt kümesi).
- Servo output, ESC cal, motor test (güvenlik onayları), battery, bootloader update.
- (Firmware flash Faz 6'ya bırakılır — WebSerial px4 bootloader portu.)

**Faz 5 — Logs & analiz** *(en de-risk'li — ArduPilot iki kez yaptı)*
- DataFlash/tlog worker parser, field-tree grafik (uPlot), 2B iz, Modes/Errors tabloları.
- Preset grafikler, türev-ifade motoru, FFT, otomatik analiz, params-from-log.
- 3B Cesium replay, tlog→HUD playback, CSV/KML export.

**Faz 6 — Gelişmiş & saha**
- Geofence/rally, survey grid üreteci, terrain profil + terrain-follow.
- NTRIP/RTK (köprü), video (WebRTC), joystick, i18n (Türkçe), temalar, PWA offline tile.
- Firmware flash (WebSerial/agent), on-vehicle log download, çok-araç.
- Later: SITL orchestrator, DroneCAN, ADS-B, antenna tracker, swarm, plugin sistemi.

---

## 7. Depo İskeleti (önerilen monorepo)

```
gcs/                              # bu boş dizin = yeni proje kökü
├─ package.json                   # pnpm workspace kökü
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ PLAN.md                        # bu belge
├─ README.md
├─ docker/
│  └─ dev-bridge/                 # mavlink-server + SITL compose (dev)
│     └─ docker-compose.yml
├─ apps/
│  ├─ web-gcs/                    # ana React SPA
│  │  ├─ src/
│  │  │  ├─ routes/               # flight-data, planner, setup, config, sim, logs
│  │  │  ├─ hud/                  # Canvas 2D attitude/HUD (leaf, ref-only)
│  │  │  ├─ map/                  # MapLibre + deck.gl + Terra Draw adaptörleri
│  │  │  ├─ state/                # hot/warm/cold store'lar
│  │  │  ├─ worker/               # protokol worker giriş noktası
│  │  │  └─ i18n/                 # tr.json (MP resx'ten), en.json, ...
│  │  └─ vite.config.ts           # PWA, COOP/COEP (SharedArrayBuffer)
│  └─ telemetry-sim/              # köprüsüz geliştirme için mock MAVLink kaynağı
├─ packages/
│  ├─ mavlink-codec/              # XML→TS dialect, CRC, frame parse/serialize, signing
│  ├─ protocol/                   # connect, abonelik, param/mission/command/MAVFtp SM
│  ├─ link/                       # Link arayüzü + WebSerial + WebSocket impl
│  ├─ mission/                    # Locationwp modeli, dosya formatları, survey grid
│  ├─ params/                     # metadata repo, param store, .param IO
│  ├─ log-parser/                 # DataFlash + tlog parser (worker)
│  ├─ charts/                     # uPlot React sarmalayıcı
│  ├─ map/                        # paylaşılan harita bileşenleri
│  ├─ ui/                         # shadcn/ui tabanlı tasarım sistemi
│  └─ protocol-types/             # paylaşılan TS tipleri (codegen)
└─ tools/
   └─ mavgen/                     # message_definitions/*.xml → TS üretim scripti
```

---

## 8. Zor Problemler / Riskler

1. **Tarayıcı transport sınırı mutlak.** Ham TCP/UDP yok; WebSerial Chromium-only USB. Köprü zorunlu — WebSerial'i tek yol yaparsak Apple/mobil kullanıcıları keseriz. *Azaltma:* köprü birincil, WebSerial ikincil; köprüyü küçük imzalı installer / Tauri wrapper ile "tek indirme" hissine yaklaştır.

2. **Asıl iş üst-katman protokoller** — hiçbir web kütüphanesi vermiyor. Param senkronu, mission handshake, COMMAND_ACK/retry, özellikle **MAVFtp** (session/offset/CRC/burst). Eforun çoğu burada; codec'te değil. *Azaltma:* pymavlink (`mavftp.py`, `mavwp`, `mavparm`) çalıştırılabilir spec olarak portla; MAVFtp'yi erken spike et (en yüksek riskli parça).

3. **Yüksek-hızlı render jank / re-render fırtınası.** 10-50 Hz telemetriyi doğrudan state'e koymak her framework'ü çökertir. *Azaltma:* worker decode → mutable hot store → rAF flush; typed-array/ring-buffer/object-pool (GC baskısı); Canvas/uPlot imperatif. Lint/review guardrail: hot state'i bileşene select etmek yasak.

4. **SharedArrayBuffer → COOP/COEP** cross-origin isolation gerekir; üçüncü-parti tile/embed ile çatışabilir. *Azaltma:* önce transferable ArrayBuffer, gerekiyorsa SAB; hosting'i erken doğrula.

5. **Firmware flash & board detect** tarayıcıda zor: px4 seri bootloader → WebSerial portu (Chromium) veya native agent; DFU → WebUSB; VID/PID tespiti WebSerial/WebUSB ister. Safari/Firefox'ta imkansız. *Azaltma:* manifest/versiyon/bootloader-update-over-MAVLink erken; tam flash'ı Faz 6'ya ertele.

6. **Terrain doğruluğu.** Ücretsiz Terrarium/SRTM ~30 m; dik arazide terrain-following AGL için yetersiz. *Azaltma:* güvenlik-kritik clearance için yüksek-çözünürlük DEM + deterministik sunucu-taraflı elevation query.

7. **Çok-istemci komut güvenliği.** İki operatör (veya bayat reconnect sekmesi) tek araca çelişik komut → tehlike. Native MP tek-operatör olduğu için bu sorunu yaşamaz. *Azaltma:* "primary pilot"/command-authority kilidi + COMMAND_ACK'i doğru istemciye yönlendir.

8. **Güvenlik.** Ağdan erişilebilir GCS = ciddi tehlike (silahlandırma/uçuş). *Azaltma:* WSS/TLS zorunlu, kimlik doğrulama, per-action authz; ADOS gibi outbound v2 frame HMAC imzalama; token'ı localStorage'da tutma (httpOnly cookie).

9. **WAN üzerinden manuel uçuş güvensiz.** WS/WebTransport jitter + reconnect boşlukları RC-override uçuşu riskli kılar. *Azaltma:* v1 kapsamını izleme + mission/command (arm, mod, guided goto, upload) ile sınırla; canlı stick girişini değil.

10. **Reconnect state resync.** Drop/reconnect'te bayat param/mission/mode üzerinde işlem yapma. *Azaltma:* heartbeat ping-pong, exponential-backoff+jitter, köprü cache'inden versiyonlu snapshot replay (araçtan yeniden poll etme).

11. **Dialect drift.** Ham frame gönderip tarayıcıda parse edersek sunucu ve TS dialect lockstep olmalı. *Azaltma:* ikisini de CI'de aynı XML'den üret.

12. **Lisans.** Cockpit (Vue) ve ADOS (GPL-3.0) ve Mission Planner kendisi GPL-3.0. Kod kopyalarsak GPL-3.0 bulaşır. *Azaltma:* lisans duruşunu baştan belirle; kod kopyalamak yerine desenleri yeniden uygula.

13. **Türkçe locale tuzağı.** MP kodu `ToLower()`/culture-sensitive karşılaştırma kullanır; JS'te naive `toLowerCase()` identifier'larda i/İ sorunu yaratır. *Azaltma:* locale-aware Intl; identifier'larda invariant.

14. **Birim yönetimi her yere yayılmış.** MP değerleri display biriminde tutar, MAVLink sınırında çarpana böler (`DataViewtoLocationwp`). *Azaltma:* aynı konvansiyonu erken modelle, yoksa birim hataları.

---

## 9. Hemen Sonraki Adımlar (mimariyi uçtan uca kanıtla)

Öncelik sırasıyla, en küçük çalışan dikey dilim:

1. **Monorepo iskeletini kur** (pnpm + Turbo + Vite + TS strict) ve boş `apps/web-gcs` + `packages/*`.
2. **Dev köprüsü + SITL'i ayağa kaldır:** `docker-compose` ile `mavlink-server` + ArduCopter SITL; `ws://localhost:8080/...` uçlarını doğrula. *(Bu adım için ArduPilot SITL / mavlink-server kurulur — sizde `dotnet` var ama SITL için Python/Docker yeterli.)*
3. **MAVLink codec'i üret ve test et:** `message_definitions/common.xml + ardupilotmega.xml` → TS; golden-frame parse/serialize/CRC birim testleri.
4. **WebSocket link + Web Worker RX pump:** köprüden gelen ham frame'leri parse et, HEARTBEAT'ten aracı tespit et, abonelik veri yoluna bas.
5. **İlk ekran:** ATTITUDE + GLOBAL_POSITION_INT + VFR_HUD'u HOT store'a yaz; Canvas HUD + MapLibre'de araç ikonu; tek bir "Connect" düğmesi. → **Kanıt tamam:** SITL'de uçan bir aracın attitude/konumu tarayıcıda canlı.
6. **Arm/mode/reboot komutları** (COMMAND_LONG + ACK) — ilk yazma yolu ve güvenlik onay deseni.
7. **WebSerial link'i ekle** (gerçek donanım hedefiniz) ve aynı worker/protokol kodunun USB radyoyla da çalıştığını doğrula.

Bu 7 adım Faz 0 + Faz 1 MVP'nin çekirdeğidir ve en büyük iki riski (transport köprüsü + yüksek-hızlı render) erkenden kapatır.

---

## Ek Notlar

- **Referans klon:** Mission Planner kaynağı analiz için `$CLAUDE_JOB_DIR/tmp/MissionPlanner` altında (geçici). Kalıcı referans isterseniz projeye `docs/reference/` altında ilgili dosya yollarını not düşebiliriz.
- **De-risk kanıtı:** Log alt sistemi için bu repoda `ExtLibs/wasm` (Blazor WASM, `DataFlash.razor`/`Tlog.razor`) aynı C# parser'ları WASM'e derleyip Plotly + Cesium ile render ediyor — Faz 5 için doğrudan şablon.
- **Reddedilen yollar:** Qt-WASM, Blazor-WASM (tüm uygulamayı), MAVSDK-JavaScript — üçü de transport köprüsünden kaçamaz + ağır maliyet getirir.
