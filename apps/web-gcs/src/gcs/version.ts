// Uygulama sürüm bilgisi — tek kaynak. Değerler build sırasında vite.config.ts (define) ile enjekte edilir.
// package.json version'ı "-beta"/"-alpha"/"-rc" içeriyorsa uygulama ön-yayın (pre-release) fazındadır.

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev';
export const GIT_SHA: string = typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'dev';
export const BUILD_TIME: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

const preMatch = /-(beta|alpha|rc)/i.exec(APP_VERSION);
/** Ön-yayın faz etiketi (BETA/ALPHA/RC) ya da yayın sürümüyse null. */
export const CHANNEL: string | null = preMatch ? preMatch[1]!.toUpperCase() : null;
export const IS_PRERELEASE = CHANNEL !== null;

/** "1.1.0-beta · a1b2c3d · 2026-07-20 14:32 UTC" — yayınlanan yapıyı tanımlayan tam kimlik. */
export function buildId(): string {
  const parts = [APP_VERSION, GIT_SHA];
  if (BUILD_TIME) {
    const d = new Date(BUILD_TIME);
    if (!Number.isNaN(d.getTime())) {
      const p = (n: number): string => String(n).padStart(2, '0');
      parts.push(`${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`);
    }
  }
  return parts.join(' · ');
}
