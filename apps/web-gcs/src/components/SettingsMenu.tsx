import { useEffect, useRef, useState } from 'react';
import { useTheme, SCHEMES } from '../gcs/theme';
import type { ThemeMode } from '../gcs/theme';
import { useT } from '../gcs/i18n';
import { useSettings, updateSettings } from '../gcs/settings';
import type { LlmProvider } from '../gcs/settings';
import { llmActive, testLlm } from '../gcs/llm-client';

const PROVIDERS: Array<[LlmProvider, string]> = [
  ['off', 'Kapalı'],
  ['anthropic', 'Anthropic'],
  ['openai', 'OpenAI'],
  ['custom', 'Özel (OpenAI-uyumlu)'],
];

const MODEL_HINT: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  custom: 'llama3.1',
};

// LLM (BYOK) bölümü: anahtar yalnız bu tarayıcının localStorage'ında durur.
function LlmSection() {
  const t = useT();
  const { llm } = useSettings();
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<'idle' | 'busy' | 'ok' | 'fail'>('idle');

  const set = (patch: Partial<typeof llm>): void => { setTest('idle'); updateSettings({ llm: patch }); };

  const runTest = async (): Promise<void> => {
    setTest('busy');
    try { await testLlm(llm); setTest('ok'); } catch { setTest('fail'); }
  };

  return (
    <div className="settings-sec">
      <div className="settings-hd">{t('Asistan (LLM)')}</div>
      <select className="set-input" value={llm.provider} aria-label={t('Sağlayıcı')}
        onChange={(e) => set({ provider: e.target.value as LlmProvider })}>
        {PROVIDERS.map(([k, label]) => <option key={k} value={k}>{t(label)}</option>)}
      </select>
      {llm.provider !== 'off' && (
        <>
          {llm.provider === 'custom' && (
            <input className="set-input" type="url" value={llm.baseUrl} placeholder="https://…/v1"
              aria-label={t('Taban URL')} onChange={(e) => set({ baseUrl: e.target.value })} />
          )}
          <input className="set-input" value={llm.model} placeholder={t('Model') + ` (${MODEL_HINT[llm.provider] ?? ''})`}
            aria-label={t('Model')} onChange={(e) => set({ model: e.target.value })} />
          <div className="set-key-row">
            <input className="set-input" type={showKey ? 'text' : 'password'} value={llm.apiKey}
              placeholder="API key" aria-label="API key" autoComplete="off"
              onChange={(e) => set({ apiKey: e.target.value })} />
            <button type="button" className="set-mini" title={showKey ? t('Gizle') : t('Göster')}
              onClick={() => setShowKey((v) => !v)}>{showKey ? '🙈' : '👁'}</button>
          </div>
          <div className="set-key-row">
            <button type="button" className="set-mini set-grow" disabled={!llmActive(llm) || test === 'busy'} onClick={() => void runTest()}>
              {test === 'busy' ? '…' : test === 'ok' ? t('Çalışıyor ✓') : test === 'fail' ? t('Başarısız ✗') : t('Bağlantıyı dene')}
            </button>
            <button type="button" className="set-mini" disabled={!llm.apiKey}
              onClick={() => set({ apiKey: '' })}>{t('Anahtarı sil')}</button>
          </div>
          <div className="set-note">{t('Anahtar yalnız bu tarayıcıda saklanır; sunucularımıza gönderilmez. Kotası sınırlı bir anahtar kullanın.')}</div>
        </>
      )}
    </div>
  );
}

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
        title={t('Ayarlar')}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="settings-ico">◑</span>
        <span className="settings-label">{activeName}</span>
      </button>
      {open && (
        <div className="settings-pop" role="dialog" aria-label={t('Ayarlar')}>
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
          <LlmSection />
        </div>
      )}
    </div>
  );
}