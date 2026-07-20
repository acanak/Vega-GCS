import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Sürüm bilgisini build sırasında sabitle: hangi commit'in yayınlandığını UI'dan doğrulamak için.
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;
function gitSha(): string {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); }
  catch { return 'nogit'; }
}
const BUILD = {
  version: pkgVersion,
  sha: gitSha(),
  time: new Date().toISOString(),
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(BUILD.version),
    __GIT_SHA__: JSON.stringify(BUILD.sha),
    __BUILD_TIME__: JSON.stringify(BUILD.time),
  },
  plugins: [
    react(),
    cesium(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pfd-icon.svg'],
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Vega GCS',
        short_name: 'Vega GCS',
        description: 'ArduPilot web yer kontrol istasyonu',
        theme_color: '#080b0f',
        background_color: '#080b0f',
        display: 'standalone',
        icons: [{ src: '/pfd-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        globIgnores: ['**/cesium/**'],
        maximumFileSizeToCacheInBytes: 6_000_000,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.host === 'tile.openstreetmap.org',
            handler: 'CacheFirst',
            options: { cacheName: 'osm-tiles', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/cesium/'),
            handler: 'CacheFirst',
            options: { cacheName: 'cesium-assets', expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
