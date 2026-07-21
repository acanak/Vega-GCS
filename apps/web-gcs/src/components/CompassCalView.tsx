import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { MSG, MAG_CAL_STATUS, MAV_CMD_DO_START_MAG_CAL, MAV_CMD_DO_ACCEPT_MAG_CAL, MAV_CMD_DO_CANCEL_MAG_CAL, MAV_CMD_SET_MESSAGE_INTERVAL, frameClass } from '@wmp/protocol';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';
import { drawCraftInSphere, craftModelFor, PLANE_CRAFT } from '../gcs/craft3d';
import type { CraftModel } from '../gcs/craft3d';
import { ParamRefreshNote } from './ParamRefresh';

// EK3_SRC1_YAW — yön (yaw) kaynağı seçenekleri
const YAW_SOURCES: ReadonlyArray<{ code: number; label: string }> = [
  { code: 1, label: 'Pusula' },
  { code: 2, label: 'GPS (çift GPS yaw)' },
  { code: 3, label: 'GPS, pusula yedekli' },
  { code: 8, label: 'GSF — GPS + IMU tahmini (pusulasız)' },
];

interface Prog { pct: number; status: number }
interface Report { fitness: number; status: number; autosaved: number; ofs: [number, number, number] }

// --- 3D nokta bulutu ayarları ---
const MAXPTS = 3200;
const NLAT = 9;
const NLON = 18;
const NBINS = NLAT * NLON;
const GREEN_AT = 5; // bir yön kutusu bu kadar örnekle tam yeşil olur

interface Pt { x: number; y: number; z: number; bin: number }

const lerp3 = (a: number[], b: number[], t: number): number[] => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
// kırmızı -> amber -> yeşil
const heat = (t: number): number[] => {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? lerp3([239, 68, 68], [255, 176, 32], c * 2) : lerp3([255, 176, 32], [56, 215, 120], (c - 0.5) * 2);
};
const binOf = (x: number, y: number, z: number): number => {
  const lat = Math.asin(Math.max(-1, Math.min(1, z))); // -pi/2..pi/2
  const lon = Math.atan2(y, x); // -pi..pi
  const li = Math.min(NLAT - 1, Math.max(0, Math.floor(((lat + Math.PI / 2) / Math.PI) * NLAT)));
  const oi = Math.min(NLON - 1, Math.max(0, Math.floor(((lon + Math.PI) / (2 * Math.PI)) * NLON)));
  return li * NLON + oi;
};

// --- Rehberli 6-konum akışı ---
// İvmeölçer tutumundan aracın hangi yüzünün aşağı baktığı bulunur; her konumda
// tek bir 360° dönüş beklenir. Dönüş NYAW dilime bölünür; FACE_DONE dilim
// tarandığında konum tamam sayılır (düşük frekanslı tutum verisi dilim
// kaçırabildiğinden tam kapsama şart koşulmaz).
const NYAW = 8;
const FACE_DONE = 6;
interface FaceDef { key: string; a: [number, number, number] } // a: aşağı bakması gereken gövde ekseni (FRD)
const FACES: readonly FaceDef[] = [
  { key: 'Düz', a: [0, 0, 1] },
  { key: 'Sol yan', a: [0, -1, 0] },
  { key: 'Sağ yan', a: [0, 1, 0] },
  { key: 'Burun aşağı', a: [1, 0, 0] },
  { key: 'Burun yukarı', a: [-1, 0, 0] },
  { key: 'Sırt üstü', a: [0, 0, -1] },
];
// Gövde çerçevesinde yerçekimi-aşağı vektörü (roll/pitch'ten; yaw etkisiz)
const downInBody = (r: number, p: number): [number, number, number] => [-Math.sin(p), Math.sin(r) * Math.cos(p), Math.cos(r) * Math.cos(p)];
// Gövde vektörünü yer çerçevesine döndür (ZYX euler) ve yatay açısını (azimut) döndür
const bodyAzimuth = (v: [number, number, number], r: number, p: number, y: number): number => {
  const cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p), cy = Math.cos(y), sy = Math.sin(y);
  const y1 = v[1] * cr - v[2] * sr, z1 = v[1] * sr + v[2] * cr;
  const x2 = v[0] * cp + z1 * sp, z2 = -v[0] * sp + z1 * cp;
  const ex = x2 * cy - y1 * sy, ey = x2 * sy + y1 * cy;
  void z2;
  return Math.atan2(ey, ex);
};
const detectFace = (r: number, p: number): number => {
  const d = downInBody(r, p);
  for (let i = 0; i < FACES.length; i++) {
    const a = FACES[i]!.a;
    if (d[0] * a[0] + d[1] * a[1] + d[2] * a[2] > 0.75) return i;
  }
  return -1;
};

// Kalibrasyon sonu hataları için yönlendirme
const FAIL_HINTS: Readonly<Record<number, string>> = {
  5: 'Kalibrasyon oturmadı — metal ve mıknatıslardan uzaklaşın, 6 konumun hepsini tamamlayıp tekrar deneyin. Sürekli başarısızsa COMPASS_CAL_FIT toleransını artırın (ör. 16 → 32).',
  6: 'Pusula yönelimi gövde yönelimiyle uyuşmuyor. Kurulum → Kart Yönelimi (AHRS_ORIENTATION) doğru mu kontrol edin; harici pusulada COMPASS_ORIENT yanlış olabilir. COMPASS_AUTO_ROT=2 çoğu durumda otomatik düzeltir.',
  7: 'Manyetik alan bozuk görünüyor — bulunduğunuz yeri değiştirin (beton demiri, araç, hoparlör, elektrik hattından uzaklaşın) ve tekrar deneyin.',
};

export function CompassCalView({ gcs, telemetry, params, setParams }: {
  gcs: UseGcs; telemetry: VehicleTelemetry | null; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void;
}) {
  const t = useT();
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  // Birden çok parametreyi tek state güncellemesiyle yaz (döngüde tekil yazım stale state bırakır)
  const writeMany = (updates: Record<string, number>): void => {
    const c = gcs.connRef.current;
    for (const [name, value] of Object.entries(updates)) {
      const e = pget(name);
      if (e) void c?.setParam(name, value, e.type);
    }
    setParams(params.map((p) => (p.name in updates ? { ...p, value: updates[p.name]! } : p)));
  };
  const [progress, setProgress] = useState<Record<number, Prog>>({});
  const [reports, setReports] = useState<Record<number, Report>>({});
  const [faceProg, setFaceProg] = useState<number[]>(() => FACES.map(() => 0));
  const connected = gcs.status === 'connected';
  const running = Object.entries(progress).some(([id, p]) => p.status >= 1 && p.status <= 3 && !reports[Number(id)]);

  // Nokta bulutu durumu (imperatif; render tetiklemez)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ptsRef = useRef<Pt[]>([]);
  const binsRef = useRef<Uint16Array>(new Uint16Array(NBINS));
  const minRef = useRef<[number, number, number]>([Infinity, Infinity, Infinity]);
  const maxRef = useRef<[number, number, number]>([-Infinity, -Infinity, -Infinity]);
  const pctRef = useRef(0);
  const rotRef = useRef({ x: -0.5, y: 0.6, auto: true });
  const dragRef = useRef<{ px: number; py: number } | null>(null);
  const faceSetsRef = useRef<Array<Set<number>>>(FACES.map(() => new Set()));
  const attRef = useRef<{ roll: number; pitch: number; yaw: number } | null>(null);
  const modelRef = useRef<CraftModel>(PLANE_CRAFT);

  const resetCloud = (): void => {
    ptsRef.current = [];
    binsRef.current = new Uint16Array(NBINS);
    minRef.current = [Infinity, Infinity, Infinity];
    maxRef.current = [-Infinity, -Infinity, -Infinity];
    pctRef.current = 0;
    faceSetsRef.current = FACES.map(() => new Set());
    setFaceProg(FACES.map(() => 0));
  };

  const addSample = (mx: number, my: number, mz: number): void => {
    if (!mx && !my && !mz) return;
    const mn = minRef.current, mx2 = maxRef.current;
    mn[0] = Math.min(mn[0], mx); mn[1] = Math.min(mn[1], my); mn[2] = Math.min(mn[2], mz);
    mx2[0] = Math.max(mx2[0], mx); mx2[1] = Math.max(mx2[1], my); mx2[2] = Math.max(mx2[2], mz);
    const cx = (mn[0] + mx2[0]) / 2, cy = (mn[1] + mx2[1]) / 2, cz = (mn[2] + mx2[2]) / 2;
    let x = mx - cx, y = my - cy, z = mz - cz;
    const m = Math.hypot(x, y, z);
    if (m < 1e-6) return;
    x /= m; y /= m; z /= m;
    const bin = binOf(x, y, z);
    if (binsRef.current[bin]! < 65535) binsRef.current[bin]!++;
    const arr = ptsRef.current;
    arr.push({ x, y, z, bin });
    if (arr.length > MAXPTS) arr.shift();
  };

  // MAVLink: cal ilerleme/rapor + canlı manyetometre örnekleri
  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    const subs = [
      conn.subscribeMessage(MSG.MAG_CAL_PROGRESS, (f) => {
        const id = Number(f.compass_id);
        const pct = Number(f.completion_pct);
        pctRef.current = Math.max(pctRef.current, pct);
        setProgress((p) => ({ ...p, [id]: { pct, status: Number(f.cal_status) } }));
      }),
      conn.subscribeMessage(MSG.MAG_CAL_REPORT, (f) => {
        const id = Number(f.compass_id);
        setReports((r) => ({ ...r, [id]: { fitness: Number(f.fitness), status: Number(f.cal_status), autosaved: Number(f.autosaved), ofs: [Number(f.ofs_x), Number(f.ofs_y), Number(f.ofs_z)] } }));
      }),
      conn.subscribeMessage(MSG.RAW_IMU, (f) => addSample(Number(f.xmag), Number(f.ymag), Number(f.zmag))),
      conn.subscribeMessage(MSG.SCALED_IMU2, (f) => addSample(Number(f.xmag), Number(f.ymag), Number(f.zmag))),
      conn.subscribeMessage(MSG.SCALED_IMU3, (f) => addSample(Number(f.xmag), Number(f.ymag), Number(f.zmag))),
    ];
    return () => subs.forEach((u) => u());
  }, [gcs.status, gcs.connRef]);

  // Kalibrasyon sırasında ATTITUDE'u 10 Hz iste (rehber tutumu akıcı izlesin), bitince varsayılana dön
  useEffect(() => {
    if (!running || !connected) return;
    gcs.connRef.current?.commandLong(MAV_CMD_SET_MESSAGE_INTERVAL, [MSG.ATTITUDE, 100000, 0, 0, 0, 0, 0]);
    return () => { gcs.connRef.current?.commandLong(MAV_CMD_SET_MESSAGE_INTERVAL, [MSG.ATTITUDE, 0, 0, 0, 0, 0, 0]); };
  }, [running, connected, gcs]);

  // Rehber: canlı tutumdan konumu algıla, o konumdaki dönüş dilimlerini işaretle
  const att = telemetry?.attitude;
  attRef.current = (connected && att) ? att : null;
  // Araç sınıfına göre 3D model (heartbeat yoksa uçak — eski davranış)
  modelRef.current = connected && telemetry && telemetry.vehicleType > 0 ? craftModelFor(frameClass(telemetry.vehicleType)) : PLANE_CRAFT;
  const curFace = att ? detectFace(att.roll, att.pitch) : -1;
  useEffect(() => {
    if (!running || !att || curFace < 0) return;
    const f = FACES[curFace]!;
    // Konumun "dönüş" açısı: aşağı eksene dik bir gövde ekseninin yatay azimutu
    const b: [number, number, number] = Math.abs(f.a[0]) > 0.5 ? [0, 0, 1] : [1, 0, 0];
    const az = bodyAzimuth(b, att.roll, att.pitch, att.yaw);
    const bin = ((Math.floor(((az + Math.PI) / (2 * Math.PI)) * NYAW) % NYAW) + NYAW) % NYAW;
    const set = faceSetsRef.current[curFace]!;
    if (!set.has(bin)) {
      set.add(bin);
      setFaceProg(faceSetsRef.current.map((s) => s.size));
    }
  }, [att, running, curFace]);

  // Nokta bulutu çizim döngüsü (Canvas 2D, hafif 3D projeksiyon)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    // Küre içi uçak için tema renkleri (bir kez okunur)
    const cs = getComputedStyle(document.documentElement);
    const parseHex = (s: string, fb: [number, number, number]): [number, number, number] => {
      const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
      if (!m) return fb;
      const n = parseInt(m[1]!, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const craftRgb = parseHex(cs.getPropertyValue('--ink-dim'), [131, 148, 163]);
    const accentRgb = parseHex(cs.getPropertyValue('--data'), [70, 224, 208]);
    let raf = 0;
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cyy = h / 2;
      const R = Math.min(w, h) * 0.4;

      const rot = rotRef.current;
      if (rot.auto && !dragRef.current) rot.y += 0.006;
      const cosY = Math.cos(rot.y), sinY = Math.sin(rot.y), cosX = Math.cos(rot.x), sinX = Math.sin(rot.x);

      // referans küre silueti + ekvator
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cyy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (let a = 0; a <= 64; a++) {
        const th = (a / 64) * Math.PI * 2;
        const ex = Math.cos(th), ez = Math.sin(th);
        const x1 = ex * cosY - ez * sinY, z1 = ex * sinY + ez * cosY;
        const y2 = -z1 * sinX, sy = cyy - y2 * R;
        const sx = cx + x1 * R;
        if (a === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      // Kürenin içinde uçağın canlı duruşu (noktaların altına, yarı saydam)
      if (attRef.current) drawCraftInSphere(ctx, cx, cyy, R, attRef.current, rot.x, rot.y, craftRgb, accentRgb, modelRef.current);

      // noktaları arkadan öne çiz
      const pts = ptsRef.current;
      const proj: Array<{ sx: number; sy: number; d: number; c: number }> = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;
        proj.push({ sx: cx + x1 * R, sy: cyy - y2 * R, d: z2, c: Math.min(1, (binsRef.current[p.bin] || 0) / GREEN_AT) });
      }
      proj.sort((a, b) => a.d - b.d);
      for (const q of proj) {
        const front = q.d > 0;
        const col = heat(q.c);
        ctx.globalAlpha = front ? 0.95 : 0.28;
        ctx.fillStyle = `rgb(${col[0]! | 0},${col[1]! | 0},${col[2]! | 0})`;
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, front ? 2.4 : 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // kapsama (dolu kutu oranı) + resmi ilerleme
      let filled = 0;
      for (let i = 0; i < NBINS; i++) if (binsRef.current[i]) filled++;
      const cov = Math.round((filled / NBINS) * 100);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '700 26px var(--mono, monospace)';
      ctx.textAlign = 'center';
      ctx.fillText(pctRef.current + '%', cx, h - 16);
      ctx.font = '10px var(--mono, monospace)';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(t('kapsama') + ' ' + cov + '%', cx, h - 4);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [t]);

  // Fare ile döndürme
  const onDown = (e: ReactPointerEvent): void => { dragRef.current = { px: e.clientX, py: e.clientY }; rotRef.current.auto = false; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onMove = (e: ReactPointerEvent): void => {
    const d = dragRef.current; if (!d) return;
    rotRef.current.y += (e.clientX - d.px) * 0.01;
    rotRef.current.x += (e.clientY - d.py) * 0.01;
    d.px = e.clientX; d.py = e.clientY;
  };
  const onUp = (): void => { dragRef.current = null; };

  const start = (): void => { setProgress({}); setReports({}); resetCloud(); gcs.connRef.current?.commandLong(MAV_CMD_DO_START_MAG_CAL, [0, 0, 1, 0, 0, 0, 0]); };
  const accept = (): void => gcs.connRef.current?.commandLong(MAV_CMD_DO_ACCEPT_MAG_CAL, [0, 0, 0, 0, 0, 0, 0]);
  const cancel = (): void => gcs.connRef.current?.commandLong(MAV_CMD_DO_CANCEL_MAG_CAL, [0, 0, 0, 0, 0, 0, 0]);

  const ids = [...new Set([...Object.keys(progress), ...Object.keys(reports)].map(Number))].sort();

  // Rehber metni: sıradaki eksik konum + o konumda dönüş ilerlemesi
  const nextFace = faceProg.findIndex((n) => n < FACE_DONE);
  const allDone = nextFace < 0;
  let guide: string;
  if (!running) guide = t('Başlat’a basın — kalibrasyon boyunca rehber sizi 6 konumda adım adım yönlendirir.');
  else if (allDone) guide = t('Tüm konumlar tarandı — küredeki kalan kırmızı bölgeleri kapatın, %100 olunca Kabul edin.');
  else if (curFace === nextFace) guide = t('Doğru konumdasınız — aracı bu duruşta düşey eksen etrafında yavaşça 360° döndürün.') + ' ' + Math.min(100, Math.round(((faceProg[nextFace] ?? 0) / FACE_DONE) * 100)) + '%';
  else guide = t('Aracı şu konuma getirin:') + ' ' + t(FACES[nextFace]!.key);

  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd"><h2>{t('Pusula kalibrasyonu')}</h2></div>
        <div className="card-body setup-body">
          <p className="setup-desc">{t('Aracı her eksende yavaşça çevirin — noktalar küreyi doldurdukça kırmızıdan yeşile döner. Kırmızı bölgeler henüz taranmadı. %100 olunca sonucu Kabul edin.')}</p>

          <div className="mag-cloud">
            <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} />
            {!connected && <div className="mag-cloud-note">{t('bağlı değil')}</div>}
          </div>

          <div className={'mag-guide' + (running ? ' on' : '')}>{guide}</div>
          <div className="mag-faces">
            {FACES.map((f, i) => {
              const n = faceProg[i] ?? 0;
              const done = n >= FACE_DONE;
              const cls = 'mag-face' + (done ? ' done' : '') + (running && i === curFace ? ' cur' : '') + (running && i === nextFace ? ' next' : '');
              return (
                <div key={f.key} className={cls}>
                  <span className="mag-face-name">{t(f.key)}</span>
                  <span className="mag-face-n">{done ? '✓' : Math.min(100, Math.round((n / FACE_DONE) * 100)) + '%'}</span>
                </div>
              );
            })}
          </div>

          <div className="setup-actions">
            <button className="btn-primary" disabled={!connected} onClick={start}>{t('Başlat')}</button>
            <button className="btn-arm" disabled={!connected} onClick={accept}>{t('Kabul')}</button>
            <button className="btn-disarm" disabled={!connected} onClick={cancel}>{t('İptal')}</button>
          </div>

          {ids.map((id) => {
            const pr = progress[id];
            const rep = reports[id];
            const st = rep?.status ?? pr?.status ?? 0;
            const hint = rep && FAIL_HINTS[st];
            return (
              <div key={id} className="mag-row">
                <div className="mag-hd">
                  <span>{t('Pusula')} {id}</span>
                  <span className={'mag-status s' + st}>{t(MAG_CAL_STATUS[st] ?? String(st))}</span>
                </div>
                <div className="mag-bar"><div className="mag-fill" style={{ width: (pr?.pct ?? (rep ? 100 : 0)) + '%' }} /></div>
                {rep && (
                  <div className="mag-report">
                    fitness {rep.fitness.toFixed(1)} · ofs {rep.ofs.map((o) => o.toFixed(0)).join(', ')}
                    {rep.autosaved ? ' · ' + t('kaydedildi') : ''}
                  </div>
                )}
                {hint && <div className="mag-hint">{t(hint)}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pusula kullanımı & yön kaynağı — pusulasız (GPS+IMU) uçuş kurulumu dahil */}
      <div className="card">
        <div className="card-hd"><h2>{t('Pusula kullanımı & yön kaynağı')}</h2>{!connected && <span className="hd-note">{t('bağlı değil')}</span>}</div>
        <div className="card-body rc-input">
          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Pusula alt sistemi')} (COMPASS_ENABLE)</div>
            {(() => {
              const e = pget('COMPASS_ENABLE');
              return (
                <label className={'chk' + (e ? '' : ' missing')} title="COMPASS_ENABLE">
                  <input type="checkbox" disabled={!connected || !e} checked={!!e && e.value > 0} onChange={(ev) => writeMany({ COMPASS_ENABLE: ev.target.checked ? 1 : 0 })} />
                  <span>{t('Pusula alt sistemini etkinleştir — kapatınca sürücüler hiç başlatılmaz (tam kapatma)')}</span>
                </label>
              );
            })()}
            <p className="setup-desc">{t('Tam kapatma yeniden başlatma gerektirir; kapalıyken COMPASS_ parametrelerinin çoğu kaybolur ve pusula verisi loglanmaz. Yalnız yön kullanımını kapatmak için aşağıdaki tekil anahtarlar yeterlidir.')}</p>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Pusulaları kullan')}</div>
            <div className="chk-grid">
              {(['COMPASS_USE', 'COMPASS_USE2', 'COMPASS_USE3'] as const).map((name, i) => {
                const e = pget(name);
                return (
                  <label key={name} className={'chk' + (e ? '' : ' missing')} title={name}>
                    <input type="checkbox" disabled={!connected || !e} checked={!!e && e.value > 0} onChange={(ev) => writeMany({ [name]: ev.target.checked ? 1 : 0 })} />
                    <span>{t('Pusula')} {i + 1}</span>
                  </label>
                );
              })}
            </div>
            <p className="setup-desc">{t('Kapalı pusulalar yön hesabında kullanılmaz — arızalı ya da hiç takılı olmayan pusulalar için kapatın.')}</p>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Yön kaynağı')} (EK3_SRC1_YAW)</div>
            {(() => {
              const e = pget('EK3_SRC1_YAW');
              const cur = e ? Math.round(e.value) : 1;
              const known = YAW_SOURCES.some((o) => o.code === cur);
              return (
                <select disabled={!connected || !e} value={e ? cur : ''} onChange={(ev) => writeMany({ EK3_SRC1_YAW: Number(ev.target.value) })}>
                  {!e && <option value="">—</option>}
                  {e && !known && <option value={cur}>{cur} · {t('Bilinmeyen')}</option>}
                  {YAW_SOURCES.map((o) => <option key={o.code} value={o.code}>{o.code} · {t(o.label)}</option>)}
                </select>
              );
            })()}
            <p className="setup-desc">{t('GSF (8): yön, GPS hızı ile IMU verisinden kestirilir — pusula gerekmez. Yön kilidi ancak araç GPS’te ~5 m/s üzeri hızla hareket edince oturur; kalkışı MANUAL/FBWA gibi yön gerektirmeyen bir modda yapın.')}</p>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Hızlı kurulum')}</div>
            <div className="setup-actions">
              <button className="btn-ghost" disabled={!connected || !pget('EK3_SRC1_YAW')}
                onClick={() => writeMany({ COMPASS_USE: 0, COMPASS_USE2: 0, COMPASS_USE3: 0, EK3_SRC1_YAW: 8 })}>
                {t('Pusulasız uçak (GPS + IMU yön)')}
              </button>
              <button className="btn-ghost" disabled={!connected || !pget('EK3_SRC1_YAW')}
                onClick={() => writeMany({ COMPASS_USE: 1, EK3_SRC1_YAW: 1 })}>
                {t('Standart (pusulalı)')}
              </button>
            </div>
            <p className="setup-desc">{t('Pusulasız kurulum uçaklar için uygundur (sürekli ileri hareket); kopterde önerilmez. Değişiklikten sonra yeniden başlatın.')}</p>
          </section>

          {connected && (!pget('EK3_SRC1_YAW') || !pget('COMPASS_USE')) && (
            <ParamRefreshNote gcs={gcs} setParams={setParams}
              text={t('Soluk alanlar bu araçta henüz yok — parametreleri yeniden indirmeyi deneyin (EK3 parametreleri AHRS_EKF_TYPE = 3 gerektirir).')} />
          )}
        </div>
      </div>
    </div>
  );
}
