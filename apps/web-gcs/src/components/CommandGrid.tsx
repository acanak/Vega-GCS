import type { Waypoint } from '@wmp/mission';
import { COMMANDS, cmdDef, FRAME_NAMES } from '@wmp/mission';
import type { MissionDoc, HomePos } from '../gcs/mission-doc';
import { useT } from '../gcs/i18n';

interface Props {
  mission: MissionDoc;
  onPatch: (i: number, patch: Partial<Waypoint>) => void;
  onPatchHome: (patch: Partial<HomePos>) => void;
  onDelete: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
}

const num = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const PKEYS = ['p1', 'p2', 'p3', 'p4'] as const;
const FRAMES = [0, 3, 10];

export function CommandGrid({ mission, onPatch, onPatchHome, onDelete, onMove }: Props) {
  const t = useT();
  return (
    <div className="card grid-card">
      <div className="card-hd">
        <h2>{t('Komutlar')}</h2>
        <span className="hd-note">{mission.items.length} wp</span>
      </div>
      <div className="card-body grid-scroll">
        <table className="cmd-grid">
          <thead>
            <tr>
              <th>#</th><th>{t('Komut')}</th><th>P1</th><th>P2</th><th>P3</th><th>P4</th>
              <th>{t('Enlem')}</th><th>{t('Boylam')}</th><th>{t('İrtifa')}</th><th>{t('Çerçeve')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="home-row">
              <td>H</td><td>HOME</td><td /><td /><td /><td />
              <td><input value={mission.home?.lat ?? ''} onChange={(e) => onPatchHome({ lat: num(e.target.value) })} /></td>
              <td><input value={mission.home?.lon ?? ''} onChange={(e) => onPatchHome({ lon: num(e.target.value) })} /></td>
              <td><input value={mission.home?.alt ?? ''} onChange={(e) => onPatchHome({ alt: num(e.target.value) })} /></td>
              <td /><td />
            </tr>
            {mission.items.map((w, i) => {
              const def = cmdDef(w.command);
              const labels = def?.params ?? ['', '', '', ''];
              const loc = def?.hasLocation ?? false;
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <select value={w.command} onChange={(e) => onPatch(i, { command: Number(e.target.value) })}>
                      {COMMANDS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  {[0, 1, 2, 3].map((pi) => {
                    const key = PKEYS[pi]!;
                    const lab = labels[pi]!;
                    return (
                      <td key={pi}>
                        <input
                          title={lab}
                          placeholder={lab}
                          value={w[key]}
                          disabled={lab === ''}
                          onChange={(e) => onPatch(i, { [key]: num(e.target.value) } as Partial<Waypoint>)}
                        />
                      </td>
                    );
                  })}
                  <td><input value={w.lat} disabled={!loc} onChange={(e) => onPatch(i, { lat: num(e.target.value) })} /></td>
                  <td><input value={w.lon} disabled={!loc} onChange={(e) => onPatch(i, { lon: num(e.target.value) })} /></td>
                  <td><input value={w.alt} disabled={!loc} onChange={(e) => onPatch(i, { alt: num(e.target.value) })} /></td>
                  <td>
                    <select value={w.frame} onChange={(e) => onPatch(i, { frame: Number(e.target.value) })}>
                      {FRAMES.map((f) => <option key={f} value={f}>{FRAME_NAMES[f] ?? f}</option>)}
                    </select>
                  </td>
                  <td className="row-actions">
                    <button onClick={() => onMove(i, -1)} title={t('Yukarı')}>↑</button>
                    <button onClick={() => onMove(i, 1)} title={t('Aşağı')}>↓</button>
                    <button onClick={() => onDelete(i)} title={t('Sil')}>✕</button>
                  </td>
                </tr>
              );
            })}
            {mission.items.length === 0 && (
              <tr><td colSpan={11} className="empty">{t('Haritaya tıklayarak waypoint ekleyin')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
