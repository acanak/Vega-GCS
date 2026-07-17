import { useTheme } from '../gcs/theme';
import { useT } from '../gcs/i18n';
import type { ThemeMode } from '../gcs/theme';

const OPTS: Array<[ThemeMode, string, string]> = [
  ['auto', '⌂', 'Oto'],
  ['light', '☀', 'Açık'],
  ['dark', '☾', 'Koyu'],
];

export function ThemeToggle() {
  const t = useT();
  const { mode, setMode } = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label={t('Tema')}>
      {OPTS.map(([m, icon, label]) => (
        <button key={m} className={mode === m ? 'active' : ''} title={t(label)} aria-pressed={mode === m} onClick={() => setMode(m)}>{icon}</button>
      ))}
    </div>
  );
}
