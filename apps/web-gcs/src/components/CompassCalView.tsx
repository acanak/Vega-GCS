import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { MSG, MAG_CAL_STATUS, MAV_CMD_DO_START_MAG_CAL, MAV_CMD_DO_ACCEPT_MAG_CAL, MAV_CMD_DO_CANCEL_MAG_CAL } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

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

export function CompassCalView({ gcs }: { gcs: UseGcs }) {
  const t = useT();
  const [progress, setProgress] = useState<Record<number, Prog>>({});
  const [reports, setReports] = useState<Record<number, Report>>({});
  const connected = gcs.status === 'connected';

  // Nokta bulutu durumu (imperatif; render tetiklemez)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ptsRef = useRef<Pt[]>([]);
  const binsRef = useRef<Uint16Array>(new Uint16Array(NBINS));
  const minRef = useRef<[number, number, number]>([Infinity, Infinity, Infinity]);
  const maxRef = useRef<[number, number, number]>([-Infinity, -Infinity, -Infinity]);
  const pctRef = useRef(0);
  const rotRef = useRef({ x: -0.5, y: 0.6, auto: true });
  const dragRef = useRef<{ px: number; py: number } | null>(null);

  const resetCloud = (): void => {
    ptsRef.current = [];
    binsRef.current = new Uint16Array(NBINS);
    minRef.current = [Infinity, Infinity, Infinity];
    maxRef.current = [-Infinity, -Infinity, -Infinity];
    pctRef.current = 0;
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

  // Nokta bulutu çizim döngüsü (Canvas 2D, hafif 3D projeksiyon)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
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

          <div className="setup-actions">
            <button className="btn-primary" disabled={!connected} onClick={start}>{t('Başlat')}</button>
            <button className="btn-arm" disabled={!connected} onClick={accept}>{t('Kabul')}</button>
            <button className="btn-disarm" disabled={!connected} onClick={cancel}>{t('İptal')}</button>
          </div>

          {ids.map((id) => {
            const pr = progress[id];
            const rep = reports[id];
            const st = rep?.status ?? pr?.status ?? 0;
            return (
              <div key={id} className="mag-row">
                <div className="mag-hd">
                  <span>{t('Pusula')} {id}</span>
                  <span className={'mag-status s' + st}>{MAG_CAL_STATUS[st] ?? st}</span>
                </div>
                <div className="mag-bar"><div className="mag-fill" style={{ width: (pr?.pct ?? (rep ? 100 : 0)) + '%' }} /></div>
                {rep && (
                  <div className="mag-report">
                    fitness {rep.fitness.toFixed(1)} · ofs {rep.ofs.map((o) => o.toFixed(0)).join(', ')}
                    {rep.autosaved ? ' · ' + t('kaydedildi') : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
