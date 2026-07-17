import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    cesium(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pfd-icon.svg'],
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Web Mission Planner',
        short_name: 'WMP',
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
