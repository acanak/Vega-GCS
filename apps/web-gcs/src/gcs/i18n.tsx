import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { EN } from './locale/en';
import { DE } from './locale/de';

// Kaynak dil TÜRKÇE. t('Türkçe metin') -> secili dilde karsiligi, yoksa Türkçe'ye duser.
export type Lang = 'tr' | 'en' | 'de';
export const LANGS: Array<{ key: Lang; name: string; flag: string }> = [
  { key: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { key: 'en', name: 'English', flag: '🇬🇧' },
  { key: 'de', name: 'Deutsch', flag: '🇩🇪' },
];
const LANG_KEYS = LANGS.map((l) => l.key);
const TABLES: Record<Lang, Record<string, string>> = { tr: {}, en: EN, de: DE };
const KEY = 'wmp-lang';

// Modul-seviyesi mevcut dil — React disindan (nadiren) t cagirmak icin.
let currentLang: Lang = 'tr';
export function translate(tr: string): string {
  if (currentLang === 'tr') return tr;
  return TABLES[currentLang][tr] ?? tr;
}

interface I18nCtxValue { lang: Lang; setLang: (l: Lang) => void; t: (tr: string) => string; }
const I18nCtx = createContext<I18nCtxValue>({ lang: 'tr', setLang: () => {}, t: (s) => s });

const initialLang = (): Lang => {
  const s = localStorage.getItem(KEY);
  return (LANG_KEYS as string[]).includes(s ?? '') ? (s as Lang) : 'en'; // varsayilan: Ingilizce
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  currentLang = lang; // render sirasinda modul degiskenini senkron tut
  const setLang = (l: Lang): void => {
    currentLang = l;
    setLangState(l);
    localStorage.setItem(KEY, l);
    document.documentElement.lang = l;
  };
  const t = useCallback((tr: string): string => (lang === 'tr' ? tr : (TABLES[lang][tr] ?? tr)), [lang]);
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

/** Ceviri fonksiyonu — bilesen icinde: const t = useT(); ... t('Bağlan'). */
export function useT(): (tr: string) => string { return useContext(I18nCtx).t; }
export function useI18n(): I18nCtxValue { return useContext(I18nCtx); }
