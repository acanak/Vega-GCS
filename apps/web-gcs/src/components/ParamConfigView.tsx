import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import type { CfgField } from '../gcs/ardupilot-config';
import { useT } from '../gcs/i18n';

const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4))));

/** Bir param listesini paramMeta'sız düzenleyen jenerik ekran (select/checkbox/sayı). Yalnız araçta VAR olan paramları gösterir. */
export function ParamConfigView({ gcs, params, setParams, title, note, fields }: {
  gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void;
  title: string; note?: string; fields: readonly CfgField[];
}) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  const write = (name: string, value: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, value, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };

  // aynı ada sahip çift tanımları (GPS_TYPE/GPS1_TYPE vb.) tekilleştir
  const seen = new Set<string>();
  const present = fields.filter((f) => pget(f.name) && !seen.has(f.name) && seen.add(f.name));

  return (
    <div className="setup-panel setup-wide">
      <div className="card">
        <div className="card-hd"><h2>{title}</h2><span className="params-spacer" />{!connected && <span className="hd-note">{t('bağlı değil')}</span>}</div>
        <div className="card-body setup-body">
          {note && <p className="setup-desc">{note}</p>}
          {present.length === 0 ? (
            <div className="empty">{t('Bu araçta ilgili parametreler yok — Parametreler sekmesinden indirin')}</div>
          ) : (
            <div className="cfg-grid">
              {present.map((f) => {
                const cur = pget(f.name)!.value;
                return (
                  <label key={f.name} className="cfg-row">
                    <span className="cfg-label">{f.label}<span className="cfg-name">{f.name}</span></span>
                    {f.values ? (() => {
                      const c = Math.round(cur);
                      const known = f.values.some((o) => o.code === c);
                      return (
                        <select disabled={!connected} value={c} onChange={(e) => write(f.name, Number(e.target.value))}>
                          {!known && <option value={c}>{c} · {t('Bilinmeyen')}</option>}
                          {f.values.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
                        </select>
                      );
                    })() : f.bool ? (
                      <input type="checkbox" disabled={!connected} checked={cur > 0} onChange={(e) => write(f.name, e.target.checked ? 1 : 0)} />
                    ) : (
                      <span className="cfg-num">
                        <input disabled={!connected} value={fmt(cur)} onChange={(e) => write(f.name, num(e.target.value))} />
                        {f.unit && <span className="p-units">{f.unit}</span>}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
