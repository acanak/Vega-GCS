import type { ParamEntry } from '@wmp/protocol';
import { paramMeta } from '@wmp/param-meta';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

export function SerialPortsView({ gcs, params, setParams }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void }) {
  const t = useT();
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);

  const ports: number[] = [];
  for (let n = 0; n <= 8; n++) if (pget('SERIAL' + n + '_BAUD') || pget('SERIAL' + n + '_PROTOCOL')) ports.push(n);

  const write = (name: string, value: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, value, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };

  const protoValues = paramMeta('SERIAL1_PROTOCOL')?.values ?? paramMeta('SERIAL2_PROTOCOL')?.values;
  const baudValues = paramMeta('SERIAL1_BAUD')?.values;

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
                    <td>
                      {baudValues ? (
                        <select value={Math.round(pget('SERIAL' + n + '_BAUD')?.value ?? 0)} onChange={(e) => write('SERIAL' + n + '_BAUD', Number(e.target.value))}>
                          {Object.entries(baudValues).sort((a, b) => Number(a[0]) - Number(b[0])).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                        </select>
                      ) : (
                        <input value={Math.round(pget('SERIAL' + n + '_BAUD')?.value ?? 0)} onChange={(e) => write('SERIAL' + n + '_BAUD', num(e.target.value))} />
                      )}
                    </td>
                    <td>
                      {protoValues ? (
                        <select value={Math.round(pget('SERIAL' + n + '_PROTOCOL')?.value ?? -1)} onChange={(e) => write('SERIAL' + n + '_PROTOCOL', Number(e.target.value))}>
                          {Object.entries(protoValues).sort((a, b) => Number(a[0]) - Number(b[0])).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                        </select>
                      ) : (
                        <input value={Math.round(pget('SERIAL' + n + '_PROTOCOL')?.value ?? -1)} onChange={(e) => write('SERIAL' + n + '_PROTOCOL', num(e.target.value))} />
                      )}
                    </td>
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
