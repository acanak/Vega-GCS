# Mobil (iOS + Android) Native Destek Planı

> Tarih: 2026-07-21. Hedef: Vega GCS'in telefon/tablette native çalışması ve araca telemetri bağlantısı.
> Tek Capacitor iskeleti iki platformu da kapsar; fark yalnızca taşıyıcı (Link) desteğindedir.
>
> **Durum:** F1–F4 kod olarak tamamlandı (2026-07-21): `apps/mobile` iskeleti, `vega-native-link`
> plugin'i (Kotlin+Swift: UDP/TCP/USB-OTG/BLE), `@wmp/link`'te sürücü-enjeksiyonlu UdpLink/
> StreamDriverLink (8 birim test), ConnectionBar platform-duyarlı. İlk native derleme için:
> `apps/mobile/README.md` (Android SDK / CocoaPods kurulu makinede `npx cap add ...`).

## 0. Android'de durum (özet: çok daha iyi)

Android **USB Host API** ile USB seri erişimine izin verir — Mission Planner Android ve QGC
Android'in USB OTG ile doğrudan Pixhawk'a bağlanabilmesinin sebebi budur:

| Yol | Android | iOS |
|---|---|---|
| USB seri (OTG kablosu ile CP210x/FTDI/CDC — Pixhawk USB, SiK radyo) | ✅ `usb-serial-for-android` + kullanıcı izni | ❌ |
| WiFi UDP/TCP telemetri | ✅ | ✅ |
| BLE telemetri | ✅ | ✅ |
| Web Serial (tarayıcıda, uygulamasız) | ❌ (Android Chrome'da da yok) | ❌ |

Yani Android'de `UsbSerialLink` native plugin'i ile **bugünkü USB senaryosu aynen taşınır**:
OTG kablosu + Pixhawk/SiK → izin diyaloğu → seri port. iOS'taki köprü zorunluluğu Android'de yok
(ama WiFi/BLE yolları orada da çalışır).

## 1. Platform gerçekleri (önce kısıtlar)

**iOS'ta USB seri porta doğrudan erişim yoktur.** Bu tüm GCS'ler için geçerlidir — QGroundControl iOS da USB seri desteklemez:

| Yol | Durum |
|---|---|
| Web Serial API (bugünkü WebSerialLink) | ❌ iOS'ta hiçbir tarayıcıda yok (WebKit zorunluluğu) |
| Native USB host erişimi (CP210x/FTDI/CDC) | ❌ iPhone'da public API yok |
| MFi aksesuar (ExternalAccessory framework) | ⚠️ Yalnızca Apple MFi sertifikalı donanım; SiK radyolar/Pixhawk USB değil |
| iPad M1+ / iPadOS 16+ DriverKit CDC sürücüsü | ⚠️ Mümkün ama yalnız iPad; Apple'dan entitlement onayı + sürücü geliştirme gerekir |
| **Ağ üzerinden telemetri (WiFi UDP/TCP)** | ✅ Tam destek — endüstri standardı çözüm |
| **BLE üzerinden telemetri (CoreBluetooth)** | ✅ Tam destek |

**Sonuç:** iOS'ta "seri port" ihtiyacı, seri↔ağ dönüştüren küçük bir donanım köprüsüyle karşılanır. Piyasada hazır ve ucuz:
- **ESP32 WiFi telemetri köprüsü** (DroneBridge for ESP32, mLRS WiFi backpack, SiK→ESP32): araç tarafında TELEM portuna takılır, iPhone'a WiFi AP açar, MAVLink'i **UDP 14550**'den yayınlar. QGC'nin iOS'taki standart yolu budur.
- **BLE telemetri modülü**: düşük bant genişliği (parametre/telemetri yeterli, log indirme yavaş).
- **Herelink / SkyDroid vb.** entegre linkler: zaten UDP yayını yapar.

## 2. Uygulama mimarisi: Capacitor sarmalayıcı

Kod tabanı bu işe hazır: UI tamamen web (React/Vite), bağlantı `Link` arayüzü ile soyut
(`packages/link` — bugün `WebSerialLink`, `WebSocketLink`). **Capacitor** ile:

- Mevcut web-gcs **değişmeden** WKWebView içinde paketlenir (Electron'un iOS karşılığı).
- Web Worker + IndexedDB WKWebView'da destekli → protokol worker'ı ve tlog kaydı aynen çalışır.
- Eksik taşıyıcılar native plugin ile eklenir; `Link` arayüzü sayesinde üst katman hiç değişmez:

| Yeni Link | Plugin | Not |
|---|---|---|
| `UdpLink` | capacitor UDP socket plugin | ESP32 köprüsü / Herelink — **birincil hedef** |
| `TcpLink` | capacitor TCP socket plugin | SITL (5760) ve bazı köprüler |
| `BleLink` | @capacitor-community/bluetooth-le | BLE telemetri modülleri (iOS + Android) |
| `UsbSerialLink` | özel plugin: `usb-serial-for-android` sarmalayıcı | **yalnız Android** — OTG ile Pixhawk/SiK doğrudan |
| (ops.) `MfiLink` | özel ExternalAccessory plugin'i | yalnız iOS, MFi donanım gerekiyorsa |

Platform algısı: `Capacitor.isNativePlatform()` → ConnectionBar taşıyıcı listesi platforma göre
(iOS: UDP/TCP/BLE; masaüstü/web: WebSerial/WebSocket). `LinkKind` tipi genişletilir.

## 3. Aşamalar

### F1 — Capacitor iskeleti (1 oturum)
`apps/mobile`: Capacitor config, web-gcs dist'i gömme, iOS (Xcode) + Android (Gradle) projeleri.
Mevcut `WebSocketLink` WebView'larda zaten çalışır → köprü çalıştıran bir bilgisayara/rpi'ye
bağlanmak F1'de anında mümkün (SITL testi dahil, iki platformda da).

### F2 — UDP/TCP native link (iOS'un asıl saha senaryosu, Android'de de yararlı)
`packages/link`'e `UdpLink`/`TcpLink`; Capacitor socket plugin'i; ConnectionBar'a
"UDP · WiFi telemetri" seçeneği (varsayılan port 14550). ESP32 DroneBridge ile saha testi.

### F3 — Android USB seri (`UsbSerialLink`)
`usb-serial-for-android` tabanlı özel Capacitor plugin'i: OTG + Pixhawk/SiK doğrudan bağlantı,
izin akışı, baud seçimi. Android'de masaüstü ile birebir aynı kullanıcı deneyimi.

### F4 — BLE link
CoreBluetooth / Android BLE (Nordic UART Service benzeri servisler); MTU/parçalama katmanı.

### F5 — Mağazalar + rötuşlar
App Store + Play Store paketleri, arka plan davranışı (uçuşta ekran kilidi), dokunmatik UI
iyileştirmeleri (harita jestleri, buton boyutları), inceleme notları.

### F6 (opsiyonel, talebe göre)
iPad DriverKit CDC (gerçek USB seri, yalnız M1+ iPad) ya da MFi aksesuar desteği.

## 4. Alternatifler (neden seçilmedi)

- **PWA olarak bırakmak:** iOS PWA'da WebSocket çalışır ama UDP/TCP/BLE yok; köprü olmadan
  araca bağlanılamaz. Native şart.
- **React Native / Swift yeniden yazım:** UI'ın tamamı yeniden yazılır — aylarca iş, Capacitor
  ile sıfır UI değişikliği.
- **Flutter:** aynı sebep.

## 5. Donanım önerisi (saha kiti)

ESP32 (DroneBridge firmware) ~10-15$: TELEM2'ye bağlanır, `SERIAL2_PROTOCOL=2 (MAVLink2)`,
`SERIAL2_BAUD=57` (57600). iPhone ESP32'nin AP'sine katılır → Vega GCS iOS "UDP 14550" ile bağlanır.
