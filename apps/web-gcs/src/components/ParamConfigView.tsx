import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import type { CfgField } from '../gcs/ardupilot-config';
import { useT } from '../gcs/i18n';
import { ParamRefreshNote } from './ParamRefresh';

const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4))));

/** Bir param listesini paramMeta'sız düzenleyen jenerik ekran (select/checkbox/sayı).
 * Ekran SABİTTİR: tüm alanlar her zaman görünür; araçta olmayan parametrelerin
 * alanları soluk/pasif çizilir ve yerinde yeniden başlat + param indirme sunulur. */
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

  // Aynı etiketli alternatif adlar (GPS_TYPE/GPS1_TYPE vb.): araçta VAR olanı,
  // hiçbiri yoksa ilkini göster.
  const byLabel = new Map<string, CfgField>();
  for (const f of fields) {
    const cur = byLabel.get(f.label);
    if (!cur || (!pget(cur.name) && pget(f.name))) byLabel.set(f.label, f);
  }
  const rows = [...byLabel.values()];
  const anyMissing = rows.some((f) => !pget(f.name));

  return (
    <div className="setup-panel setup-wide">
      <div className="card">
        <div className="card-hd"><h2>{title}</h2><span className="params-spacer" />{!connected && <span className="hd-note">{t('bağlı değil')}</span>}</div>
        <div className="card-body setup-body">
          {note && <p className="setup-desc">{note}</p>}
          <div className="cfg-grid">
            {rows.map((f) => {
              const entry = pget(f.name);
              const missing = !entry;
              const cur = entry?.value ?? 0;
              const off = !connected || missing;
              return (
                <label key={f.name} className={'cfg-row' + (missing ? ' missing' : '')}>
                  <span className="cfg-label">{f.label}<span className="cfg-name">{f.name}</span></span>
                  {f.values ? (() => {
                    const c = Math.round(cur);
                    const known = f.values.some((o) => o.code === c);
                    return (
                      <select disabled={off} value={missing ? '' : c} onChange={(e) => write(f.name, Number(e.target.value))}>
                        {missing && <option value="">—</option>}
                        {!missing && !known && <option value={c}>{c} · {t('Bilinmeyen')}</option>}
                        {f.values.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
                      </select>
                    );
                  })() : f.bool ? (
                    <input type="checkbox" disabled={off} checked={!missing && cur > 0} onChange={(e) => write(f.name, e.target.checked ? 1 : 0)} />
                  ) : (
                    <span className="cfg-num">
                      <input disabled={off} value={missing ? '' : fmt(cur)} placeholder="—" onChange={(e) => write(f.name, num(e.target.value))} />
                      {f.unit && <span className="p-units">{f.unit}</span>}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          {connected && anyMissing && (
            <ParamRefreshNote gcs={gcs} setParams={setParams}
              text={t('Soluk alanlar bu araçta henüz yok — ilgili özelliği etkinleştirin (tip/enable parametresi), kartı yeniden başlatın ve parametreleri yeniden indirin. Firmware bu özelliği içermiyorsa alanlar hiç oluşmaz.')} />
          )}
        </div>
      </div>
    </div>
  );
}
