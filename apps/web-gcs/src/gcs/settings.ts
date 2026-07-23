// Uygulama ayarları — kullanıcının KENDİ tarayıcısında (localStorage) tutulur.
// API anahtarı gibi değerler hiçbir sunucuya gönderilmez; tek çıkış noktası
// kullanıcının seçtiği LLM sağlayıcısına yapılan doğrudan istektir (llm-client.ts).
import { useSyncExternalStore } from 'react';

const KEY = 'wmp-settings';

export type LlmProvider = 'off' | 'anthropic' | 'openai' | 'custom';

export interface LlmSettings {
  provider: LlmProvider;
  apiKey: string;
  /** Boş bırakılırsa sağlayıcı varsayılanı kullanılır (bkz. llm-client.ts). */
  model: string;
  /** Yalnız 'custom' (OpenAI-uyumlu uç: Ollama, OpenRouter vb.) için taban URL. */
  baseUrl: string;
}

export interface AppSettings {
  llm: LlmSettings;
}

const DEFAULTS: AppSettings = {
  llm: { provider: 'off', apiKey: '', model: '', baseUrl: '' },
};

let cache: AppSettings | null = null;
const listeners = new Set<() => void>();

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const j = JSON.parse(raw) as Partial<AppSettings>;
    return { llm: { ...DEFAULTS.llm, ...(j.llm ?? {}) } };
  } catch { return DEFAULTS; }
}

export function getSettings(): AppSettings {
  if (!cache) cache = load();
  return cache;
}

export function updateSettings(patch: { llm?: Partial<LlmSettings> }): void {
  const cur = getSettings();
  cache = { llm: { ...cur.llm, ...(patch.llm ?? {}) } };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* depolama dolu/kapalı */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** React tarafı: ayarlar değişince yeniden render. */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSettings);
}
