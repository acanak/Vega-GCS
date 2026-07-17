import { useMemo, useRef, useState } from 'react';
import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { paramMeta } from '@wmp/param-meta';
import { ParamCompareView, parseParamFile } from './ParamCompareView';
import { useT } from '../gcs/i18n';

const fmtParam = (v: number): string => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6))));

// ---- Prefix agaci ----
interface TreeNode { prefix: string; label: string; count: number; children: TreeNode[]; }

function buildTree(names: string[]): TreeNode[] {
  interface T { seg: string; prefix: string; count: number; kids: Map<string, T>; }
  const root: T = { seg: '', prefix: '', count: 0, kids: new Map() };
  for (const name of names) {
    const segs = name.split('_');
    let node = root;
    let pref = '';
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      pref = i === 0 ? seg : pref + '_' + seg;
      let child = node.kids.get(seg);
      if (!child) {
        child = { seg, prefix: pref, count: 0, kids: new Map() };
        node.kids.set(seg, child);
      }
      child.count++;
      node = child;
    }
  }
  const toNode = (t: T): TreeNode => {
    let label = t.seg;
    let cur = t;
    // tek-cocuklu zincirleri sikistir (ATC > VERSION gibi tek yolları birlestir)
    while (cur.kids.size === 1) {
      const only = [...cur.kids.values()][0]!;
      if (only.count !== cur.count) break;
      label = label + '_' + only.seg;
      cur = only;
    }
    const children = [...cur.kids.values()].sort((a, b) => a.seg.localeCompare(b.seg)).map(toNode);
    return { prefix: cur.prefix, label, count: cur.count, children };
  };
  return [...root.kids.values()].sort((a, b) => a.seg.localeCompare(b.seg)).map(toNode);
}

function TreeRows({ nodes, depth, expanded, toggle, selected, onSelect }: {
  nodes: TreeNode[]; depth: number; expanded: Set<string>;
  toggle: (p: string) => void; selected: string; onSelect: (p: string) => void;
}) {
  return (
    <>
      {nodes.map((n) => {
        const hasKids = n.children.length > 0;
        const open = expanded.has(n.prefix);
        return (
          <div key={n.prefix}>
            <div
              className={'tree-row' + (selected === n.prefix ? ' sel' : '')}
              style={{ paddingLeft: 6 + depth * 12 }}
              onClick={() => { onSelect(n.prefix); if (hasKids) toggle(n.prefix); }}
            >
              <span className="tree-caret">{hasKids ? (open ? '▾' : '▸') : ''}</span>
              <span className="tree-label">{n.label}</span>
              <span className="tree-count">{n.count}</span>
            </div>
            {hasKids && open && (
              <TreeRows nodes={n.children} depth={depth + 1} expanded={expanded} toggle={toggle} selected={selected} onSelect={onSelect} />
            )}
          </div>
        );
      })}
    </>
  );
}

// ---- Deger satiri ----
function ParamRow({ p, disabled, onWrite }: { p: ParamEntry; disabled: boolean; onWrite: (name: string, type: number, val: number) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(String(p.value));
  const dirty = draft !== String(p.value);
  const m = paramMeta(p.name);
  const v = parseFloat(draft);
  const oob = !!m && m.min !== undefined && m.max !== undefined && Number.isFinite(v) && (v < m.min || v > m.max);
  const commit = (): void => {
    const nv = parseFloat(draft);
    if (Number.isFinite(nv) && nv !== p.value) onWrite(p.name, p.type, nv);
  };
  return (
    <tr>
      <td className="p-name" title={m?.desc ?? m?.disp ?? ''}>{p.name}{m?.disp ? <span className="p-disp">{m.disp}</span> : null}</td>
      <td>
        <input value={draft} disabled={disabled} className={(dirty ? 'dirty ' : '') + (oob ? 'oob' : '')}
          title={m && m.min !== undefined ? t('Aralık: ') + m.min + '..' + m.max : ''}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          onBlur={commit} />
      </td>
      <td className="p-units">{m?.units ?? ''}</td>
      <td className="p-type">{p.type}</td>
    </tr>
  );
}

interface Props { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void; }

export function ParamsView({ gcs, params, setParams }: Props) {
  const t = useT();
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'compare'>('edit');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [selPrefix, setSelPrefix] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const connected = gcs.status === 'connected';
  const fileRef = useRef<HTMLInputElement | null>(null);

  const tree = useMemo(() => buildTree(params.map((p) => p.name)), [params]);
  const toggle = (p: string): void =>
    setExpanded((prev) => { const next = new Set(prev); if (next.has(p)) next.delete(p); else next.add(p); return next; });

  const download = async (): Promise<void> => {
    const conn = gcs.connRef.current;
    if (!conn) return;
    setBusy(true);
    setStatus(t('İndiriliyor…'));
    try {
      const p = await conn.downloadParams((r, t) => setStatus('İndiriliyor ' + r + '/' + t));
      setParams(p);
      setStatus(p.length + t(' parametre okundu ✓'));
    } catch (e) {
      setStatus(t('Hata: ') + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };
  // Dosyaya kaydet: mevcut parametreleri .param olarak indir
  const saveToFile = (): void => {
    if (!params.length) return;
    const lines = ['# Web Mission Planner param dosyası'];
    for (const p of [...params].sort((a, b) => a.name.localeCompare(b.name))) lines.push(p.name + ',' + fmtParam(p.value));
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'params.param'; a.click();
    URL.revokeObjectURL(url);
    setStatus(params.length + t(' parametre dosyaya kaydedildi ✓'));
  };

  // Dosyadan yükle: eslesen+farkli olanlari araca yaz (bagli degilse yerel goster)
  const loadFromFile = async (file: File): Promise<void> => {
    let map: Map<string, number>;
    try { map = parseParamFile(await file.text()); } catch { setStatus(t('Dosya okunamadı')); return; }
    const changes = params.filter((p) => { const fv = map.get(p.name.toUpperCase()); return fv !== undefined && fv !== p.value; });
    if (!changes.length) { setStatus(t('Dosyadaki değerler zaten aynı (ya da eşleşen parametre yok)')); return; }
    const conn = gcs.connRef.current;
    if (!conn || !connected) {
      setParams(params.map((p) => { const fv = map.get(p.name.toUpperCase()); return fv !== undefined ? { ...p, value: fv } : p; }));
      setStatus(changes.length + t(' parametre yüklendi (araç bağlı değil — yazılmadı)'));
      return;
    }
    setBusy(true);
    const updated = params.map((p) => ({ ...p }));
    const byName = new Map(updated.map((p) => [p.name, p] as const));
    let ok = 0; let fail = 0;
    for (const c of changes) {
      const fv = map.get(c.name.toUpperCase())!;
      setStatus(t('Yazılıyor ') + (ok + fail + 1) + '/' + changes.length + ': ' + c.name);
      try { const echoed = await conn.setParam(c.name, fv, c.type); const tgt = byName.get(c.name); if (tgt) tgt.value = echoed; ok++; } catch { fail++; }
    }
    setParams(updated);
    setBusy(false);
    setStatus(ok + t(' yazıldı') + (fail ? ', ' + fail + t(' hata') : '') + ' ✓');
  };

  const write = async (name: string, type: number, val: number): Promise<void> => {
    const conn = gcs.connRef.current;
    if (!conn) return;
    setStatus(t('Yazılıyor: ') + name + '…');
    try {
      const echoed = await conn.setParam(name, val, type);
      setParams(params.map((p) => (p.name === name ? { ...p, value: echoed } : p)));
      setStatus(name + ' = ' + echoed + ' ✓');
    } catch (e) {
      setStatus(t('Yazma hatası: ') + (e instanceof Error ? e.message : String(e)));
    }
  };

  const s = search.trim().toUpperCase();
  const filtered = params.filter(
    (p) => (!selPrefix || p.name === selPrefix || p.name.startsWith(selPrefix + '_')) && (!s || p.name.toUpperCase().includes(s)),
  );
  const shown = filtered.slice(0, 400);

  return (
    <div className="params-view">
      <div className="card params-card">
        <div className="card-hd params-hd">
          <h2>{t('Parametreler')}</h2>
          <div className="params-mode seg">
            <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>{t('Düzenle')}</button>
            <button className={mode === 'compare' ? 'active' : ''} onClick={() => setMode('compare')}>{t('Karşılaştır')}</button>
          </div>
          <span className="params-spacer" />
          {mode === 'edit' && <input className="param-search" placeholder={t('Ara… (örn. WPNAV)')} value={search} onChange={(e) => setSearch(e.target.value)} />}
          {mode === 'edit' && <span className="hd-note">{filtered.length}/{params.length}</span>}
          {mode === 'edit' && (
            <>
              <button className="btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()} title={t('.param dosyasından yükle (eşleşenleri araca yazar)')}>{t('Dosyadan yükle')}</button>
              <button className="btn-ghost" disabled={!params.length} onClick={saveToFile} title={t('Parametreleri .param olarak kaydet')}>{t('Dosyaya kaydet')}</button>
              <input ref={fileRef} type="file" accept=".param,.txt" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFromFile(f); e.target.value = ''; }} />
            </>
          )}
          <button className="btn-primary" disabled={!connected || busy} onClick={() => void download()}>
            {busy ? '…' : params.length ? t('Yenile') : t('İndir')}
          </button>
        </div>
        {mode === 'edit' && status && <div className="params-status">{status}</div>}
        {mode === 'compare' && <ParamCompareView gcs={gcs} params={params} setParams={setParams} />}
        {mode === 'edit' && <div className="card-body params-layout">
          <div className="param-tree">
            <div className={'tree-row' + (selPrefix === '' ? ' sel' : '')} style={{ paddingLeft: 6 }} onClick={() => setSelPrefix('')}>
              <span className="tree-caret" />
              <span className="tree-label">{t('Tümü')}</span>
              <span className="tree-count">{params.length}</span>
            </div>
            <TreeRows nodes={tree} depth={0} expanded={expanded} toggle={toggle} selected={selPrefix} onSelect={setSelPrefix} />
          </div>
          <div className="param-list grid-scroll">
            <table className="cmd-grid params-grid">
              <thead><tr><th>{t('Ad')}</th><th>{t('Değer')}</th><th>{t('Birim')}</th><th>{t('Tip')}</th></tr></thead>
              <tbody>
                {params.length === 0 && (
                  <tr><td colSpan={4} className="empty">{connected ? t('Parametreleri indirin') : t('Önce bağlanın')}</td></tr>
                )}
                {shown.map((p) => <ParamRow key={p.name + ':' + p.value} p={p} disabled={!connected} onWrite={write} />)}
              </tbody>
            </table>
            {filtered.length > shown.length && <div className="empty">… {filtered.length - shown.length} {t('satır daha')}</div>}
          </div>
        </div>}
      </div>
    </div>
  );
}
