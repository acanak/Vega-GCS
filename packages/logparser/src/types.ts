// Ortak log veri modeli (DataFlash ve tlog ayni yapiya cozulur).

export type Cell = number | string;

export interface LogSeries {
  labels: string[];
  timeLabel: string;
  rows: Cell[][];
}

export interface LogData {
  messages: Map<string, LogSeries>;
}

export interface FieldRef {
  msg: string;
  field: string;
}

const isTimeLabel = (l: string): boolean => l === 'TimeUS' || l === 'time' || l === 'TimeMS';

/** Cizilebilir sayisal (zaman disi) alanlar. */
export function listPlottable(d: LogData): FieldRef[] {
  const out: FieldRef[] = [];
  for (const [msg, s] of d.messages) {
    const sample = s.rows[0];
    if (!sample) continue;
    s.labels.forEach((f, i) => {
      if (isTimeLabel(f)) return;
      if (typeof sample[i] === 'number') out.push({ msg, field: f });
    });
  }
  return out;
}

/** Bir alanin zaman serisi: x saniye (ilk ornekten itibaren), y deger. */
export function getSeries(d: LogData, msg: string, field: string): { x: number[]; y: number[] } {
  const s = d.messages.get(msg);
  const x: number[] = [];
  const y: number[] = [];
  if (!s) return { x, y };
  const ti = s.labels.indexOf(s.timeLabel);
  const fi = s.labels.indexOf(field);
  if (ti < 0 || fi < 0) return { x, y };
  const scale = s.timeLabel === 'TimeUS' ? 1e-6 : s.timeLabel === 'TimeMS' ? 1e-3 : 1;
  let t0: number | null = null;
  for (const row of s.rows) {
    const tv = Number(row[ti]);
    const yv = Number(row[fi]);
    if (!Number.isFinite(tv) || !Number.isFinite(yv)) continue;
    if (t0 === null) t0 = tv;
    x.push((tv - t0) * scale);
    y.push(yv);
  }
  return { x, y };
}

/** GPS izini derece olarak cikarir (DataFlash GPS.Lat/Lng veya tlog GLOBAL_POSITION_INT). */
export function getTrack(d: LogData): Array<[number, number]> {
  const tryMsg = (name: string, latF: string, lonF: string, div: number): Array<[number, number]> | null => {
    const s = d.messages.get(name);
    if (!s) return null;
    const li = s.labels.indexOf(latF);
    const oi = s.labels.indexOf(lonF);
    if (li < 0 || oi < 0) return null;
    const pts: Array<[number, number]> = [];
    for (const row of s.rows) {
      const la = Number(row[li]) / div;
      const lo = Number(row[oi]) / div;
      if (Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0)) pts.push([lo, la]);
    }
    return pts.length ? pts : null;
  };
  return (
    tryMsg('GPS', 'Lat', 'Lng', 1e7) ??
    tryMsg('POS', 'Lat', 'Lng', 1e7) ??
    tryMsg('GLOBAL_POSITION_INT', 'lat', 'lon', 1e7) ??
    []
  );
}

export interface TrajSample { t: number; lat: number; lon: number; alt: number; roll: number; pitch: number; yaw: number; }

/** Konum (GPS/POS/GLOBAL_POSITION_INT) + attitude (ATT/ATTITUDE) -> 3B replay yorungesi. */
export function getTrajectory(d: LogData): TrajSample[] {
  const pos = d.messages.get('GPS') ?? d.messages.get('POS') ?? d.messages.get('GLOBAL_POSITION_INT');
  if (!pos) return [];
  const tScale = pos.timeLabel === 'TimeUS' ? 1e-6 : pos.timeLabel === 'TimeMS' ? 1e-3 : 1;
  const ti = pos.labels.indexOf(pos.timeLabel);
  const binPos = pos.labels.includes('Lat');
  const latI = pos.labels.indexOf(binPos ? 'Lat' : 'lat');
  const lonI = pos.labels.indexOf(binPos ? 'Lng' : 'lon');
  const altI = pos.labels.indexOf(binPos ? 'Alt' : 'relative_alt');
  const altDiv = binPos ? 1 : 1000;
  if (latI < 0 || lonI < 0 || ti < 0) return [];

  const att = d.messages.get('ATT') ?? d.messages.get('ATTITUDE');
  const attS: Array<{ t: number; r: number; p: number; y: number }> = [];
  if (att) {
    const ats = att.timeLabel === 'TimeUS' ? 1e-6 : att.timeLabel === 'TimeMS' ? 1e-3 : 1;
    const ai = att.labels.indexOf(att.timeLabel);
    const deg = att.labels.includes('Roll');
    const rI = att.labels.indexOf(deg ? 'Roll' : 'roll');
    const pI = att.labels.indexOf(deg ? 'Pitch' : 'pitch');
    const yI = att.labels.indexOf(deg ? 'Yaw' : 'yaw');
    const k = deg ? Math.PI / 180 : 1;
    if (ai >= 0 && rI >= 0) for (const row of att.rows) attS.push({ t: Number(row[ai]) * ats, r: Number(row[rI]) * k, p: Number(row[pI]) * k, y: Number(row[yI]) * k });
  }

  const out: TrajSample[] = [];
  let aj = 0;
  let t0: number | null = null;
  for (const row of pos.rows) {
    const t = Number(row[ti]) * tScale;
    const lat = Number(row[latI]) / 1e7;
    const lon = Number(row[lonI]) / 1e7;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    const alt = altI >= 0 ? Number(row[altI]) / altDiv : 0;
    if (t0 === null) t0 = t;
    let r = 0, p = 0, y = 0;
    if (attS.length) { while (aj < attS.length - 1 && attS[aj + 1]!.t <= t) aj++; const a = attS[aj]!; r = a.r; p = a.p; y = a.y; }
    out.push({ t: t - t0, lat, lon, alt, roll: r, pitch: p, yaw: y });
  }
  return out;
}
