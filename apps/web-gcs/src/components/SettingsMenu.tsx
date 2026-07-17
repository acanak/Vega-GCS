import { useEffect, useRef, useState } from 'react';
import { useTheme, SCHEMES } from '../gcs/theme';
import type { ThemeMode } from '../gcs/theme';
import { useT } from '../gcs/i18n';

const MODES: Array<[ThemeMode, string, string]> = [
  ['auto', '⌂', 'Oto'],
  ['light', '☀', 'Açık'],
  ['dark', '☾', 'Koyu'],
];

export function SettingsMenu() {
  const { mode, setMode, effective, scheme, setScheme } = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const activeName = SCHEMES.find((s) => s.key === scheme)?.name ?? '';

  return (
    <div className="settings" ref={rootRef}>
      <button
        className={'settings-trigger' + (open ? ' open' : '')}
        aria-haspopup="dialog" aria-expanded={open}
        title={t('Görünüm ayarları')}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="settings-ico">◑</span>
        <span className="settings-label">{activeName}</span>
      </button>
      {open && (
        <div className="settings-pop" role="dialog" aria-label={t('Görünüm')}>
          <div className="settings-sec">
            <div className="settings-hd">{t('Mod')}</div>
            <div className="theme-toggle" role="group" aria-label={t('Tema modu')}>
              {MODES.map(([m, icon, label]) => (
                <button key={m} className={mode === m ? 'active' : ''} title={t(label)} aria-pressed={mode === m} onClick={() => setMode(m)}>
                  {icon}<span className="mode-txt">{t(label)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="settings-sec">
            <div className="settings-hd">{t('Tema')}</div>
            <div className="scheme-grid">
              {SCHEMES.map((s) => (
                <button
                  key={s.key}
                  className={'scheme-card' + (scheme === s.key ? ' active' : '')}
                  aria-pressed={scheme === s.key}
                  onClick={() => setScheme(s.key)}
                >
                  <span className="scheme-preview" data-scheme={s.key} data-theme={effective}>
                    <span className="sp-bar" />
                    <span className="sp-dots">
                      <span className="sp-dot d1" />
                      <span className="sp-dot d2" />
                      <span className="sp-dot d3" />
                      <span className="sp-dot d4" />
                    </span>
                  </span>
                  <span className="scheme-name">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}