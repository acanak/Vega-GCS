import type { CapacitorConfig } from '@capacitor/cli';

// Vega GCS mobil sarmalayıcı: web-gcs build çıktısını WKWebView/WebView'da paketler.
// Taşıyıcılar (UDP/TCP/USB-OTG/BLE) vega-native-link plugin'i üzerinden native çalışır.
const config: CapacitorConfig = {
  appId: 'com.vega.gcs',
  appName: 'Vega GCS',
  webDir: '../web-gcs/dist',
  server: {
    // Yerel varlıklar https şemasıyla sunulur (service worker/IndexedDB uyumu)
    androidScheme: 'https',
    iosScheme: 'https',
  },
  ios: {
    contentInset: 'always', // çentik/emniyet alanı
  },
};

export default config;
