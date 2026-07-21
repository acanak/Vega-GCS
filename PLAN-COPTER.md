# Copter Hazırlık Planı

> Durum tespiti: 2026-07-21. Plane ağırlıklı geliştirme sonrası Copter paritesi için yol haritası.
> Ana plan: [PLAN.md](PLAN.md) — özellikle satır 206 (Extended Tuning / Copter PID paneli) ve 217 (Frame class/type seçimi).

## Mevcut durum (zaten Copter-uyumlu olanlar)

Çekirdek altyapı frame-class güdümlü tasarlandığı için Copter büyük ölçüde "bedava" çalışıyor:

| Alan | Durum | Referans |
|---|---|---|
| Araç tipi algılama | ✅ `frameClass(mavType)` → `'copter' \| 'plane' \| 'rover'` | `packages/protocol/src/constants.ts:121` |
| Uçuş modları | ✅ `COPTER_MODES` tam (STABILIZE…AUTOTUNE); UI generic okuyor | `constants.ts:80-98`, `FlightModesView.tsx:69` |
| Quick-mode butonları | ✅ copter → `['RTL','LAND','LOITER']` | `constants.ts:145-150` |
| Arm/Mode/Takeoff | ✅ GUIDED+ARM+NAV_TAKEOFF akışı copter'de aynen çalışır | `ActionsPanel.tsx:33-40` |
| Guided goto | ✅ SET_POSITION_TARGET_GLOBAL_INT, frame-bağımsız | `FlightDataView.tsx:50-70` |
| Görev komutları | ✅ WP/TAKEOFF/LAND/RTL/LOITER_*/SPLINE_WAYPOINT copter için yeterli | `packages/mission/src/commands.ts:12-27` |
| PID ekranı | ✅ `frameClass`'a göre Copter `ATC_*` dallanması var | `PidTuneView.tsx:10-22,120-122` |
| Accel kalibrasyon | ✅ Zaten quadcopter görseli çiziyor | `AccelCalView.tsx` |

## Yapılacaklar (öncelik sırasıyla)

> Durum: P0–P5 ve P6'nın çekirdeği tamamlandı (2026-07-21). Kalan: winch/gripper aux ekranları + SITL doğrulaması.

### ✅ P0 — Altyapı: Setup menüsü araç tipine duyarlı olsun
**Sorun:** `SetupView.tsx:47-49,91,95` menüde "Airframe" (PlaneSetupView) ve "TECS" (TecsTuneView) her araçta görünüyor.
**İş:**
- `SetupView` menü öğelerine `frames?: FrameClass[]` alanı ekle; `vehicleType`'a göre filtrele.
- Plane bağlıyken: Airframe + TECS görünür. Copter bağlıyken: Frame/Motors (aşağıda) görünür.
- Bağlantı yokken tümünü göster (mevcut davranış bozulmasın).

### ✅ P1 — Copter Frame & Motors ekranı (yeni: `CopterFrameView.tsx`)
Mission Planner karşılığı: *Initial Setup → Frame Type* + *Motor Test*.
- **Frame seçimi:** `FRAME_CLASS` (1=Quad, 2=Hexa, 3=Octa, 4=OctaQuad, 5=Y6, 7=Tri…) + `FRAME_TYPE` (0=Plus, 1=X, 2=V, 3=H…) — görsel seçim ızgarası (PLAN.md:217 "2 param + validity table").
- **Motor test:** `MAV_CMD_DO_MOTOR_TEST (209)` — motor no, throttle %, süre; güvenlik kilidi (pervane uyarısı + onay). Motor sırası şeması (frame'e göre A/B/C/D yerleşimi).
- **ESC kalibrasyonu:** `ESC_CALIBRATION` parametresi + yeniden başlatma yönergesi (v1'de yönerge metni yeterli).

### ✅ P2 — Extended Tuning / Copter PID paneli (PLAN.md:206, v1 hedefi)
Mevcut `PidTuneView` temel `ATC_*` dallanmasını yapıyor; MP "Extended Tuning" paritesi için:
- Roll/Pitch/Yaw rate PID + Stabilize P, `ATC_ANG_*`/`ATC_RAT_*` alias tabloları **verbatim** portlanacak (PLAN.md notu).
- Ek bölümler: `PSC_*` (position controller), `WPNAV_*` (waypoint hızları), `LOIT_*`.
- RC tuning knob desteği (`TUNE`, `TUNE_MIN/MAX`) — MP'deki "Ch6 Opt" karşılığı.
- AUTOTUNE eksen seçimi (`AUTOTUNE_AXES`).

### ✅ P3 — HUD/PFD copter modu
**Sorun:** `Hud.tsx:57-76` birincil hız = airspeed; trend vektörü airspeed'den. Airspeed sensörsüz copter'de tape ~0 gösterir.
**İş:**
- `frameClass === 'copter'` iken birincil hız tape'i **groundspeed**, trend de groundspeed'den (`renderPfd.ts:17-18` zaten ikisini taşıyor — sadece besleme değişir).
- Copter'e özel anunciator düşünülebilir: LAND/RTL aktif, prearm.

### ✅ P4 — Copter'e özel Failsafe görünümü
`FailsafeView` generic; copter parametre seti farklı:
- `FS_THR_ENABLE/VALUE` (RC kaybı), `BATT_FS_LOW_ACT/CRT_ACT`, `FS_GCS_ENABLE`, `FS_EKF_ACTION/THRESH`, `RTL_ALT`, `RTL_ALT_FINAL`, `LAND_SPEED`.
- Frame-class'a göre parametre listesi seç (plane listesi mevcut davranış olarak kalır).

### ✅ P5 — Küçük düzeltmeler (tek oturumluk)
- `OSDView.tsx:188` — 'FBWA' varsayılanı → `frameClass`'a göre ('STABILIZE' copter'de).
- `ChatPanel.tsx:23` — ipucu metni FBWA örneği → araç tipine göre örnek mod.
- `craft3d.ts` — sabit kanat mesh'inin yanına quad mesh'i; CompassCal/BoardOrientation `frameClass`'a göre model seçsin.

### P6 — Sonrası (v2 adayları)
- ✅ Harmonic notch / gyro FFT kurulum ekranı (`INS_HNTCH_*`) — Ayar → Titreşim Filtresi.
- ✅ Copter için Simple/Super Simple mod yapılandırması (FlightModesView'da pozisyon başına S/SS kutuları).
- ✅ Landing gear (`LGR_*`) — Donanım → İniş Takımı. Kalan: winch, gripper aux ekranları.
- ✅ `LOITER_TO_ALT(31)` / `DO_LAND_START(189)` görev komutları (CommandGrid'de seçilebilir).

## Test akışı

Dev ortamı zaten ArduCopter SITL (PLAN.md:280): `pnpm dev:sitl` → quad SITL.
Her ekran için asgari doğrulama: SITL'de parametre yaz/oku + motor test (SITL motor test komutlarını kabul eder, güvenli).
Plane regresyonu: `sim_vehicle.py -v ArduPlane` ile Setup menüsünün Plane öğelerini göstermeye devam ettiğini doğrula.

## Önerilen sıra ve kapsam

| Adım | Kapsam | Bağımlılık |
|---|---|---|
| 1 | P0 menü filtresi + P5 küçük düzeltmeler | — |
| 2 | P1 CopterFrameView (frame seçimi + motor test) | P0 |
| 3 | P2 Extended Tuning genişletmesi | — |
| 4 | P3 HUD copter modu | — |
| 5 | P4 Failsafe | — |
