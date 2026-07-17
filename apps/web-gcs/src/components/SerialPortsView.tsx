import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { SERIAL_PROTOCOLS, SERIAL_BAUDS } from '../gcs/ardupilot-rc';
import type { CodeLabel } from '../gcs/ardupilot-rc';
import { useT } from '../gcs/i18n';

export function SerialPortsView({ gcs, params, setParams }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void }) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);

  const ports: number[] = [];
  for (let n = 0; n <= 8; n++) if (pget('SERIAL' + n + '_BAUD') || pget('SERIAL' + n + '_PROTOCOL')) ports.push(n);

  const write = (name: string, value: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, value, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };

  // kod -> "kod · etiket" listesinden select; JSX döndüren DÜZ FONKSIYON (bileşen DEĞİL) —
  // aksi halde her render'da remount olup açık <select> kapanır.
  const combo = (name: string, list: readonly CodeLabel[], def: number) => {
    const cur = Math.round(pget(name)?.value ?? def);
    const known = list.some((o) => o.code === cur);
    return (
      <select disabled={!connected || !pget(name)} value={cur} onChange={(e) => write(name, Number(e.target.value))}>
        {!known && <option value={cur}>{cur} · {t('Bilinmeyen')}</option>}
        {list.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
      </select>
    );
  };

  return (
    <div className="setup-panel setup-wide">
      <div className="card">
        <div className="card-hd"><h2>{t('Seri portlar')}</h2><span className="hd-note">{ports.length} port</span></div>
        <div className="card-body grid-scroll">
          {ports.length === 0 ? (
            <div className="empty">{t('SERIAL parametreleri yok — Parametreler sekmesinden indirin')}</div>
          ) : (
            <table className="cmd-grid">
              <thead><tr><th>Port</th><th>Baud</th><th>{t('Protokol')}</th></tr></thead>
              <tbody>
                {ports.map((n) => (
                  <tr key={n}>
                    <td className="p-name">SERIAL{n}</td>
                    <td>{combo('SERIAL' + n + '_BAUD', SERIAL_BAUDS, 57)}</td>
                    <td>{combo('SERIAL' + n + '_PROTOCOL', SERIAL_PROTOCOLS, -1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
