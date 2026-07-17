import { useMemo, useRef, useState } from 'react';
import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { paramMeta } from '@wmp/param-meta';
import { useT } from '../gcs/i18n';

// ---- .param / QGC dosya cozumleyici ----
// Desteklenen bicimler:
//   NAME,VALUE            (MP .param)
//   NAME<TAB/space>VALUE
//   SYSID COMPID NAME VALUE TYPE   (QGroundControl)
//   # ... yorum satirlari atlanir
export function parseParamFile(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const tok = line.split(/[\s,]+/).filter(Boolean);
    if (tok.length < 2) continue;
    let name: string;
    let valStr: string;
    if (tok.length >= 4 && /^\d+$/.test(tok[0]!) && /^\d+$/.test(tok[1]!)) {
      name = tok[2]!;
      valStr = tok[3]!;
    } else {
      name = tok[0]!;
      valStr = tok[1]!;
    }
    if (!/^[A-Za-z]/.test(name)) continue;
    const v = parseFloat(valStr);
    if (Number.isFinite(v)) out.set(name.toUpperCase(), v);
  }
  return out;
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '';
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toFixed(6)));
}

const eq = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-6);

type RowKind = 'diff' | 'same' | 'file-only' | 'veh-only';
interface Row { name: string; veh?: number; file?: number; type?: number; kind: RowKind; }

const KIND_LABEL: Record<RowKind, string> = {
  diff: 'Farklı',
  same: 'Aynı',
  'file-only': 'Yalnızca dosyada',
  'veh-only': 'Yalnızca araçta',
};

interface Props { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void; }

export function ParamCompareView({ gcs, params, setParams }: Props) {
  const t = useT();
  const [fileParams, setFileParams] = useState<Map<string, number> | null>(null);
  const [fileName, setFileName] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const connected = gcs.status === 'connected';

  const rows = useMemo<Row[]>(() => {
    if (!fileParams) return [];
    const veh = new Map(params.map((p) => [p.name.toUpperCase(), p] as const));
    const names = new Set<string>([...veh.keys(), ...fileParams.keys()]);
    const list: Row[] = [];
    for (const name of names) {
      const vp = veh.get(name);
      const fv = fileParams.get(name);
      let kind: RowKind;
      if (vp && fv !== undefined) kind = eq(vp.value, fv) ? 'same' : 'diff';
      else if (fv !== undefined) kind = 'file-only';
      else kind = 'veh-only';
      list.push({ name, veh: vp?.value, file: fv, type: vp?.type, kind });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [fileParams, params]);

  const counts = useMemo(() => {
    const c = { diff: 0, same: 0, 'file-only': 0, 'veh-only': 0 } as Record<RowKind, number>;
    for (const r of rows) c[r.kind]++;
    return c;
  }, [rows]);

  const s = search.trim().toUpperCase();
  const filtered = rows.filter(
    (r) => (!onlyDiff || r.kind !== 'same') && (!s || r.name.includes(s)),
  );
  const shown = filtered.slice(0, 600);
  const writable = filtered.filter((r) => r.kind === 'diff');
  const selCount = writable.filter((r) => selected.has(r.name)).length;

  const loadFile = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const map = parseParamFile(text);
      setFileParams(map);
      setFileName(file.name);
      setSelected(new Set());
      setStatus(map.size + t(' parametre dosyadan okundu (') + file.name + ')');
    } catch (e) {
      setStatus(t('Dosya okunamadı: ') + (e instanceof Error ? e.message : String(e)));
    }
  };

  const toggleSel = (name: string): void =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const selectAll = (): void => setSelected(new Set(writable.map((r) => r.name)));
  const selectNone = (): void => setSelected(new Set());

  const writeSelected = async (): Promise<void> => {
    const conn = gcs.connRef.current;
    if (!conn) return;
    const todo = writable.filter((r) => selected.has(r.name) && r.type !== undefined && r.file !== undefined);
    if (!todo.length) return;
    setBusy(true);
    let ok = 0; let fail = 0;
    const updated = params.map((p) => ({ ...p }));
    for (const r of todo) {
      try {
        const echoed = await conn.setParam(r.name, r.file!, r.type!);
        const idx = updated.findIndex((p) => p.name.toUpperCase() === r.name);
        if (idx >= 0) updated[idx]!.value = echoed;
        ok++;
        setStatus(t('Yazılıyor ') + ok + '/' + todo.length + '…');
      } catch {
        fail++;
      }
    }
    setParams(updated);
    setSelected(new Set());
    setStatus(ok + t(' parametre yazıldı') + (fail ? ', ' + fail + t(' hata') : '') + ' ✓');
    setBusy(false);
  };

  // Mevcut arac parametrelerini .param dosyasi olarak indir
  const exportCurrent = (): void => {
    if (!params.length) return;
    const lines = ['# Web Mission Planner param dosyası'];
    for (const p of [...params].sort((a, b) => a.name.localeCompare(b.name))) lines.push(p.name + ',' + fmt(p.value));
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'params.param';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card-body compare-layout">
      <div className="compare-bar">
        <input
          ref={fileInput}
          type="file"
          accept=".param,.parm,.txt"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }}
        />
        <button className="btn-primary" onClick={() => fileInput.current?.click()}>{t('Dosya Yükle…')}</button>
        {fileName && <span className="compare-file">{fileName}</span>}
        <button disabled={!params.length} onClick={exportCurrent} title={t('Araçtaki parametreleri .param olarak kaydet')}>{t('Dışa Aktar')}</button>
        <label className="compare-check"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> {t('Yalnızca farklar')}</label>
        <input className="param-search" placeholder={t('Ara…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        {fileParams && (
          <span className="compare-legend">
            <span className="lg diff">◆ {counts.diff} {t('farklı')}</span>
            <span className="lg same">{counts.same} {t('aynı')}</span>
            <span className="lg file">{counts['file-only']} {t('dosyada')}</span>
            <span className="lg veh">{counts['veh-only']} {t('araçta')}</span>
          </span>
        )}
      </div>
      {fileParams && (
        <div className="compare-actions">
          <button onClick={selectAll} disabled={!writable.length}>{t('Tüm farkları seç')}</button>
          <button onClick={selectNone} disabled={!selCount}>{t('Temizle')}</button>
          <button className="btn-primary" disabled={!connected || busy || !selCount} onClick={() => void writeSelected()}>
            {busy ? '…' : t('Seçilenleri araca yaz (') + selCount + ')'}
          </button>
        </div>
      )}
      {status && <div className="params-status">{status}</div>}
      <div className="param-list grid-scroll">
        <table className="cmd-grid params-grid compare-grid">
          <thead><tr><th /><th>{t('Ad')}</th><th>{t('Araç')}</th><th>{t('Dosya')}</th><th>Δ</th><th>{t('Durum')}</th></tr></thead>
          <tbody>
            {!fileParams && <tr><td colSpan={6} className="empty">{t('Karşılaştırmak için bir .param dosyası yükleyin')}</td></tr>}
            {fileParams && shown.length === 0 && <tr><td colSpan={6} className="empty">{t('Gösterilecek satır yok')}</td></tr>}
            {shown.map((r) => {
              const m = paramMeta(r.name);
              const delta = r.veh !== undefined && r.file !== undefined ? r.file - r.veh : undefined;
              const canWrite = r.kind === 'diff';
              return (
                <tr key={r.name} className={'cmp-' + r.kind}>
                  <td className="cmp-sel">
                    {canWrite && <input type="checkbox" checked={selected.has(r.name)} onChange={() => toggleSel(r.name)} />}
                  </td>
                  <td className="p-name" title={m?.desc ?? m?.disp ?? ''}>{r.name}{m?.units ? <span className="p-disp">{m.units}</span> : null}</td>
                  <td className="cmp-num">{r.veh !== undefined ? fmt(r.veh) : '—'}</td>
                  <td className="cmp-num">{r.file !== undefined ? fmt(r.file) : '—'}</td>
                  <td className="cmp-num cmp-delta">{delta !== undefined && !eq(delta, 0) ? (delta > 0 ? '+' : '') + fmt(delta) : ''}</td>
                  <td className="cmp-kind">{t(KIND_LABEL[r.kind])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > shown.length && <div className="empty">… {filtered.length - shown.length} {t('satır daha')}</div>}
      </div>
    </div>
  );
}
