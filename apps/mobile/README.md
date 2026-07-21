# Vega GCS Mobil (Capacitor)

Web-gcs arayüzünü iOS/Android'e paketler. Taşıyıcılar `vega-native-link`
plugin'i ile native çalışır: **UDP** (WiFi telemetri köprüsü), **TCP**,
**USB seri (yalnız Android, OTG)**, **BLE (NUS)**. Ayrıntılar: [PLAN-MOBILE.md](../../PLAN-MOBILE.md).

## Kurulum (bir kez)

```bash
# 1) Web arayüzünü derle (webDir = ../web-gcs/dist)
pnpm --filter @wmp/web-gcs build

# 2) Mobil bağımlılıklar (npm — desktop gibi workspace dışı)
cd apps/mobile
npm install

# 3) Plugin JS tarafını derle
npm --prefix plugins/vega-native-link install
npm --prefix plugins/vega-native-link run build

# 4) Platform projelerini üret
npx cap add android          # Android SDK gerekli
npx cap add ios              # Xcode + CocoaPods gerekli (sudo gem install cocoapods)
```

## Geliştirme döngüsü

```bash
pnpm --filter @wmp/web-gcs build && npx cap sync   # web değişince
npx cap run android                                 # cihazda/emülatörde çalıştır
npx cap open ios                                    # Xcode'da aç → Run
```

## iOS notları

- `Info.plist`'e eklenmesi gerekenler (cap add sonrası bir kez):
  - `NSBluetoothAlwaysUsageDescription` — BLE telemetri için
  - `NSLocalNetworkUsageDescription` + `NSBonjourServices` gerekmiyorsa boş bırakılabilir;
    UDP/TCP yerel ağ erişimi iOS 14+ "Local Network" iznine tabidir (ilk kullanımda sistem sorar).
- USB seri iOS'ta yoktur; `usbOpen` açık hata döndürür (tasarım gereği).

## Android notları

- USB izni: aygıt takılıyken bağlanınca sistem diyaloğu çıkar (plugin yönetir).
- Android 12+ BLE izinleri (`BLUETOOTH_SCAN/CONNECT`) çalışma zamanında istenir;
  Capacitor izin akışı plugin manifest'inde tanımlıdır.
- `minSdkVersion 23`; USB seri sürücüleri: CP210x, FTDI, CH34x, PL2303, CDC-ACM (Pixhawk).

## Mimari

```
apps/web-gcs (değişmeden)  ──►  @wmp/link Link arayüzü
                                   ├─ UdpLink / StreamDriverLink (saf TS, testli)
                                   └─ Capacitor*Driver köprüleri (native/vega-native-link.ts)
                                          └─ VegaNativeLink plugin'i (Kotlin / Swift — bu repo)
```

Native katman tamamen bizim kontrolümüzde — üçüncü parti soket plugin'lerine bağımlılık yok.
