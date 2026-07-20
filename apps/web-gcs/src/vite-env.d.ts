/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
declare module '*.css';

// vite.config.ts define ile enjekte edilen build sabitleri
declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
declare const __BUILD_TIME__: string;
