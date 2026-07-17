import { useI18n, LANGS } from '../gcs/i18n';

/** Topbar dil seçici — bayraklarla; kullanıcı dili nereden değiştireceğini net görür. */
export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label="Dil / Language">
      {LANGS.map((l) => (
        <button
          key={l.key}
          type="button"
          className={'lang-flag-btn' + (lang === l.key ? ' active' : '')}
          title={l.name}
          aria-label={l.name}
          aria-pressed={lang === l.key}
          onClick={() => setLang(l.key)}
        >
          <span className="lang-flag">{l.flag}</span>
        </button>
      ))}
    </div>
  );
}
