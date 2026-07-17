import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type Effective = 'dark' | 'light';

// Secilebilir tema semalari (her biri hem dark hem light varyantli, styles.css'te tanimli).
export type Scheme = 'aurora' | 'graphite' | 'nord' | 'copper' | 'indigo' | 'viridian';
export const SCHEMES: Array<{ key: Scheme; name: string }> = [
  { key: 'aurora', name: 'Aurora' },
  { key: 'graphite', name: 'Grafit' },
  { key: 'nord', name: 'Nord' },
  { key: 'copper', name: 'Bakır' },
  { key: 'indigo', name: 'İndigo' },
  { key: 'viridian', name: 'Viridian' },
];
const SCHEME_KEYS = SCHEMES.map((s) => s.key);

interface ThemeCtxValue {
  mode: ThemeMode;
  effective: Effective;
  setMode: (m: ThemeMode) => void;
  scheme: Scheme;
  setScheme: (s: Scheme) => void;
}
const ThemeCtx = createContext<ThemeCtxValue>({
  mode: 'dark', effective: 'dark', setMode: () => {}, scheme: 'aurora', setScheme: () => {},
});
const KEY = 'wmp-theme';
const SKEY = 'wmp-scheme';

const systemPref = (): Effective => (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const s = localStorage.getItem(KEY);
    return s === 'light' || s === 'dark' || s === 'auto' ? s : 'dark';
  });
  const [scheme, setSchemeState] = useState<Scheme>(() => {
    const s = localStorage.getItem(SKEY);
    return (SCHEME_KEYS as string[]).includes(s ?? '') ? (s as Scheme) : 'aurora';
  });
  const [sys, setSys] = useState<Effective>(systemPref);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = (): void => setSys(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const effective: Effective = mode === 'auto' ? sys : mode;
  useEffect(() => { document.documentElement.dataset.theme = effective; }, [effective]);
  useEffect(() => { document.documentElement.dataset.scheme = scheme; }, [scheme]);
  const setMode = (m: ThemeMode): void => { setModeState(m); localStorage.setItem(KEY, m); };
  const setScheme = (s: Scheme): void => { setSchemeState(s); localStorage.setItem(SKEY, s); };
  return (
    <ThemeCtx.Provider value={{ mode, effective, setMode, scheme, setScheme }}>{children}</ThemeCtx.Provider>
  );
}

export function useTheme(): ThemeCtxValue { return useContext(ThemeCtx); }
