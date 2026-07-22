// PostHog analitiği — YALNIZ hosted web uygulamasında (Cloudflare) çalışır.
// Electron desktop, Capacitor (iOS/Android) ve yerel geliştirme ortamında
// hiç yüklenmez (dynamic import sayesinde chunk bile indirilmez).
//
// Anahtar: PostHog panelinde Settings → Project → "Project API Key".
// Normalde `phc_...` ile başlar; olay akmıyorsa buradaki değeri onunla değiştir.
// Bu anahtar herkese açık (public) bir ingest token'dır, commit edilmesi güvenlidir.
import { isNative } from './native/vega-native-link';

const POSTHOG_KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ?? 'phc_qUmqPnfQyjczw6Z8rtrucwXqbAaREyEsYKPzy3GH3F2x';
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';

/** Hosted (tarayıcıdan https ile açılan production) ortam mı? */
function isHostedWeb(): boolean {
  if (!import.meta.env.PROD) return false; // vite dev
  if (isNative()) return false; // Capacitor iOS/Android
  if (navigator.userAgent.includes('Electron')) return false; // desktop
  if (window.location.protocol !== 'https:') return false; // Electron 127.0.0.1 http sunucusu vb.
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return false; // Capacitor Android https://localhost, vite preview
  return true;
}

export function initAnalytics(): void {
  if (!isHostedWeb() || !POSTHOG_KEY) return;
  // Uygulama açılışını bloklamasın: chunk'ı ayrı ve tembel yükle.
  void import('posthog-js').then(({ default: posthog }) => {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // Tıklama/etkileşim takibi (autocapture) ve pageview varsayılan olarak açık.
      capture_exceptions: true, // window.onerror + unhandledrejection → Error Tracking
      session_recording: {
        maskAllInputs: true, // koordinat/parametre girişleri kayda maskeli girsin
      },
      persistence: 'localStorage', // çerez kullanma
    });
    posthog.register({
      app_version: __APP_VERSION__,
      git_sha: __GIT_SHA__,
    });
  }).catch(() => { /* analitik yüklenemedi — uygulamayı etkilemesin */ });
}
