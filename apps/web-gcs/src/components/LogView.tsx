import { useMemo, useRef, useState } from 'react';
import type { LogData } from '@wmp/logparser';
import { listPlottable, getSeries, getTrack, computeSpectrum, getTrajectory } from '@wmp/logparser';
import type { FtpEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { LogChart } from './LogChart';
import type { ChartSeries } from './LogChart';
import { LogTrackMap } from './LogTrackMap';
import { Cesium3DReplay } from './Cesium3DReplay';
import { useT } from '../gcs/i18n';
import { TlogSessionList } from './TlogSessionList';

const SEP = '::';
const fmtSize = (n: number): string => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B');

const PRESETS: Array<{ name: string; fields: Array<[string, string]> }> = [
  { name: 'Attitude', fields: [['ATT', 'Roll'], ['ATT', 'Pitch'], ['ATT', 'Yaw'], ['ATTITUDE', 'roll'], ['ATTITUDE', 'pitch'], ['ATTITUDE', 'yaw']] },
  { name: 'Vibrasyon', fields: [['VIBE', 'VibeX'], ['VIBE', 'VibeY'], ['VIBE', 'VibeZ']] },
  { name: 'Batarya', fields: [['BAT', 'Volt'], ['BAT', 'Curr'], ['BATT', 'Volt']] },
  { name: 'İrtifa', fields: [['CTUN', 'Alt'], ['BARO', 'Alt'], ['GLOBAL_POSITION_INT', 'relative_alt']] },
  { name: 'RC giriş', fields: [['RCIN', 'C1'], ['RCIN', 'C2'], ['RCIN', 'C3'], ['RCIN', 'C4']] },
];

export function LogView({ gcs, onReplay }: { gcs: UseGcs; onReplay?: (f: File) => void }) {
  const t = useT();
  const [data, setData] = useState<LogData | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [domain, setDomain] = useState<'time' | 'freq' | '3d'>('time');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const replayRef = useRef<HTMLInputElement | null>(null);

  // Arac loglari (MAVFtp) — dizin donanima gore degisir:
  // gercek FC (ChibiOS/SD) '/APM/LOGS', SITL 'logs' (cwd'ye goreli), Linux HAL '/var/APM/logs'
  const LOG_DIRS = ['/APM/LOGS', 'logs', '/var/APM/logs'];
  const [vlogs, setVlogs] = useState<FtpEntry[] | null>(null);
  const [vbase, setVbase] = useState('/APM/LOGS');
  const [vbusy, setVbusy] = useState<string | null>(null);
  const [vprog, setVprog] = useState(0);
  const connected = gcs.status === 'connected';

  const loadBytes = (fname: string, buf: Uint8Array): void => {
    setBusy(true);
    setSel(new Set());
    setData(null);
    setName(fname);
    const worker = new Worker(new URL('../gcs/log.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent): void => {
      const m = e.data as { data: LogData } | { error: string };
      if ('error' in m) setName(t('Hata: ') + m.error);
      else setData(m.data);
      setBusy(false);
      worker.terminate();
    };
    worker.postMessage(buf, [buf.buffer]);
  };
  const load = (file: File): void => { void file.arrayBuffer().then((ab) => loadBytes(file.name, new Uint8Array(ab))); };

  const listLogs = async (): Promise<void> => {
    const c = gcs.connRef.current;
    if (!c?.listDirectory) return;
    setVbusy('list');
    setVlogs(null);
    try {
      let found: FtpEntry[] = [];
      let base = LOG_DIRS[0]!;
      for (const dir of LOG_DIRS) {
        try {
          const all = await c.listDirectory(dir);
          const bins = all.filter((e) => !e.dir && /\.bin$/i.test(e.name));
          if (bins.length) { found = bins; base = dir; break; }
        } catch { /* bu dizin yok -> sonrakini dene */ }
      }
      found.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
      setVbase(base);
      setVlogs(found);
    } catch (e) {
      setVlogs([]);
      setName(t('Hata: ') + (e instanceof Error ? e.message : String(e)));
    } finally {
      setVbusy(null);
    }
  };

  const downloadLog = async (entry: FtpEntry): Promise<void> => {
    const c = gcs.connRef.current;
    if (!c?.downloadFile) return;
    setVbusy(entry.name);
    setVprog(0);
    try {
      const bytes = await c.downloadFile(vbase + '/' + entry.name, (r, tot) => setVprog(tot ? r / tot : 0));
      // Diske kaydet
      const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = entry.name; a.click(); URL.revokeObjectURL(url);
      // Ve gorunum icin ayristir
      loadBytes(entry.name, bytes);
    } catch (e) {
      setName(t('Hata: ') + (e instanceof Error ? e.message : String(e)));
    } finally {
      setVbusy(null);
      setVprog(0);
    }
  };

  const present = useMemo(() => {
    const s = new Set<string>();
    if (data) for (const f of listPlottable(data)) s.add(f.msg + SEP + f.field);
    return s;
  }, [data]);
  const byMsg = useMemo(() => {
    const m = new Map<string, string[]>();
    if (data) for (const f of listPlottable(data)) { const a = m.get(f.msg) ?? []; a.push(f.field); m.set(f.msg, a); }
    return m;
  }, [data]);
  const track = useMemo(() => (data ? getTrack(data) : []), [data]);
  const traj = useMemo(() => (data ? getTrajectory(data) : []), [data]);
  const series: ChartSeries[] = useMemo(() => {
    if (!data) return [];
    return [...sel].map((key) => {
      const [msg, field] = key.split(SEP);
      const s = getSeries(data, msg!, field!);
      if (domain === 'freq') { const sp = computeSpectrum(s.x, s.y); return { label: msg + '.' + field, x: sp.freq, y: sp.mag }; }
      return { label: msg + '.' + field, x: s.x, y: s.y };
    });
  }, [data, sel, domain]);

  const toggle = (key: string): void => setSel((p) => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const applyPreset = (fields: Array<[string, string]>): void => {
    const keys = fields.map(([m, f]) => m + SEP + f).filter((k) => present.has(k));
    setSel(new Set(keys));
  };

  return (
    <main className="logview">
      <aside className="log-tree">
        <div className="log-toolbar">
          <button className="btn-primary" onClick={() => fileRef.current?.click()}>{busy ? t('Yükleniyor…') : t('Log yükle')}</button>
          <input ref={fileRef} type="file" accept=".bin,.log,.tlog" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
          {onReplay && (
            <>
              <button className="btn-ghost" onClick={() => replayRef.current?.click()}>▶ {t('Kayıt oynat (.tlog / .bin)')}</button>
              <input ref={replayRef} type="file" accept=".tlog,.bin,.log" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplay(f); e.target.value = ''; }} />
            </>
          )}
        </div>
        <div className="log-vehicle">
          <div className="log-vehicle-hd">{t('Araç logları')} · MAVFtp</div>
          <button className="btn-ghost" disabled={!connected || vbusy !== null} onClick={() => void listLogs()}>
            {vbusy === 'list' ? t('Listeleniyor…') : t('Araçtan listele')}
          </button>
          {vlogs && vlogs.length === 0 && <div className="empty">{t('log bulunamadı')}</div>}
          {vlogs && vlogs.length > 0 && (
            <div className="vlog-list">
              {vlogs.map((e) => (
                <div key={e.name} className="vlog-row">
                  <span className="vlog-name">{e.name}</span>
                  <span className="vlog-size">{fmtSize(e.size)}</span>
                  <button className="vlog-dl" disabled={vbusy !== null} title={t('İndir')} onClick={() => void downloadLog(e)}>
                    {vbusy === e.name ? Math.round(vprog * 100) + '%' : '↓'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <TlogSessionList onReplay={onReplay} />
        {name && <div className="log-name">{name}</div>}
        {data && (
          <div className="log-presets">
            {PRESETS.map((p) => {
              const n = p.fields.filter(([m, f]) => present.has(m + SEP + f)).length;
              return <button key={p.name} className="chip" disabled={n === 0} onClick={() => applyPreset(p.fields)}>{t(p.name)}</button>;
            })}
          </div>
        )}
        <div className="log-fields">
          {byMsg.size === 0 && <div className="empty">{data ? t('çizilebilir alan yok') : t('.bin / .tlog yükleyin')}</div>}
          {[...byMsg.entries()].map(([msg, fields]) => (
            <details key={msg} className="log-msg">
              <summary>{msg} <span className="tree-count">{fields.length}</span></summary>
              {fields.map((f) => {
                const key = msg + SEP + f;
                return (
                  <label key={f} className="log-field">
                    <input type="checkbox" checked={sel.has(key)} onChange={() => toggle(key)} />
                    {f}
                  </label>
                );
              })}
            </details>
          ))}
        </div>
      </aside>
      <section className="log-content">
        <div className="card">
          <div className="card-hd">
            <h2>{domain === '3d' ? t('3B Replay') : domain === 'freq' ? t('Spektrum (FFT)') : t('Grafik')}</h2>
            <div className="log-domain">
              <button className={domain === 'time' ? 'active' : ''} onClick={() => setDomain('time')}>{t('Zaman')}</button>
              <button className={domain === 'freq' ? 'active' : ''} onClick={() => setDomain('freq')}>FFT</button>
              <button className={domain === '3d' ? 'active' : ''} disabled={traj.length < 2} onClick={() => setDomain('3d')}>{t('3B')}</button>
              <span className="hd-note">{domain === '3d' ? traj.length + t(' örnek') : series.length + t(' seri')}</span>
            </div>
          </div>
          <div className="card-body">
            {domain === '3d'
              ? (traj.length < 2 ? <div className="empty">{t('Konum + attitude içeren log gerekli')}</div> : <Cesium3DReplay traj={traj} />)
              : series.length === 0 ? <div className="empty">{t('Soldan alan seçin veya bir preset uygulayın')}</div>
              : <LogChart series={series} xLabel={domain === 'freq' ? 'Hz' : 't (s)'} />}
          </div>
        </div>
        {track.length > 1 && (
          <div className="card">
            <div className="card-hd"><h2>{t('Uçuş izi')}</h2><span className="hd-note">{track.length} {t('nokta')}</span></div>
            <div className="card-body" style={{ padding: 0 }}><LogTrackMap track={track} /></div>
          </div>
        )}
      </section>
    </main>
  );
}
