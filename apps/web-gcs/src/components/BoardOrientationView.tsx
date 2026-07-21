import { useEffect, useRef, useState } from 'react';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import { MSG, MAV_CMD_SET_MESSAGE_INTERVAL, frameClass } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';
import type { V3, Quat, Face, FaceTag } from '../gcs/craft3d';
import { D2R, qMul, qAxis, qRot, qDot, qSlerp, qEuler, quad, CRAFT_FACES, QUAD_FACES } from '../gcs/craft3d';

// ---------------------------------------------------------------------------
// Kart yönelimi (AHRS_ORIENTATION) kurulum ekranı.
// Kart, uçak gövdesi içinde canlı 3D olarak çizilir; kullanıcı fare/klavye ile
// kartı döndürür, sonuç ArduPilot Rotation enum'undaki en yakın değere oturur.
// Render bağımlılıksızdır: quaternion matematiği + Canvas 2D painter's algorithm.
// Eksen kuralı ArduPilot gövde çerçevesi (FRD): +X burun, +Y sağ kanat, +Z aşağı.
// Ortak 3D matematik/geometri: gcs/craft3d.ts
// ---------------------------------------------------------------------------

// ArduPilot Rotation enum'u (AP_Math/rotations.h) — açılar derece.
interface RotDef { code: number; label: string; r: number; p: number; y: number }
export const AP_ROTATIONS: readonly RotDef[] = [
  { code: 0, label: 'None', r: 0, p: 0, y: 0 },
  { code: 1, label: 'Yaw 45', r: 0, p: 0, y: 45 },
  { code: 2, label: 'Yaw 90', r: 0, p: 0, y: 90 },
  { code: 3, label: 'Yaw 135', r: 0, p: 0, y: 135 },
  { code: 4, label: 'Yaw 180', r: 0, p: 0, y: 180 },
  { code: 5, label: 'Yaw 225', r: 0, p: 0, y: 225 },
  { code: 6, label: 'Yaw 270', r: 0, p: 0, y: 270 },
  { code: 7, label: 'Yaw 315', r: 0, p: 0, y: 315 },
  { code: 8, label: 'Roll 180', r: 180, p: 0, y: 0 },
  { code: 9, label: 'Roll 180 Yaw 45', r: 180, p: 0, y: 45 },
  { code: 10, label: 'Roll 180 Yaw 90', r: 180, p: 0, y: 90 },
  { code: 11, label: 'Roll 180 Yaw 135', r: 180, p: 0, y: 135 },
  { code: 12, label: 'Pitch 180', r: 0, p: 180, y: 0 },
  { code: 13, label: 'Roll 180 Yaw 225', r: 180, p: 0, y: 225 },
  { code: 14, label: 'Roll 180 Yaw 270', r: 180, p: 0, y: 270 },
  { code: 15, label: 'Roll 180 Yaw 315', r: 180, p: 0, y: 315 },
  { code: 16, label: 'Roll 90', r: 90, p: 0, y: 0 },
  { code: 17, label: 'Roll 90 Yaw 45', r: 90, p: 0, y: 45 },
  { code: 18, label: 'Roll 90 Yaw 90', r: 90, p: 0, y: 90 },
  { code: 19, label: 'Roll 90 Yaw 135', r: 90, p: 0, y: 135 },
  { code: 20, label: 'Roll 270', r: 270, p: 0, y: 0 },
  { code: 21, label: 'Roll 270 Yaw 45', r: 270, p: 0, y: 45 },
  { code: 22, label: 'Roll 270 Yaw 90', r: 270, p: 0, y: 90 },
  { code: 23, label: 'Roll 270 Yaw 135', r: 270, p: 0, y: 135 },
  { code: 24, label: 'Pitch 90', r: 0, p: 90, y: 0 },
  { code: 25, label: 'Pitch 270', r: 0, p: 270, y: 0 },
  { code: 26, label: 'Pitch 180 Yaw 90', r: 0, p: 180, y: 90 },
  { code: 27, label: 'Pitch 180 Yaw 270', r: 0, p: 180, y: 270 },
  { code: 28, label: 'Roll 90 Pitch 90', r: 90, p: 90, y: 0 },
  { code: 29, label: 'Roll 180 Pitch 90', r: 180, p: 90, y: 0 },
  { code: 30, label: 'Roll 270 Pitch 90', r: 270, p: 90, y: 0 },
  { code: 31, label: 'Roll 90 Pitch 180', r: 90, p: 180, y: 0 },
  { code: 32, label: 'Roll 270 Pitch 180', r: 270, p: 180, y: 0 },
  { code: 33, label: 'Roll 90 Pitch 270', r: 90, p: 270, y: 0 },
  { code: 34, label: 'Roll 180 Pitch 270', r: 180, p: 270, y: 0 },
  { code: 35, label: 'Roll 270 Pitch 270', r: 270, p: 270, y: 0 },
  { code: 36, label: 'Roll 90 Pitch 180 Yaw 90', r: 90, p: 180, y: 90 },
  { code: 37, label: 'Roll 90 Yaw 270', r: 90, p: 0, y: 270 },
  { code: 39, label: 'Pitch 315', r: 0, p: 315, y: 0 },
  { code: 40, label: 'Roll 90 Pitch 315', r: 90, p: 315, y: 0 },
  { code: 42, label: 'Roll 45', r: 45, p: 0, y: 0 },
  { code: 43, label: 'Roll 315', r: 315, p: 0, y: 0 },
];
const rotQuat = (d: RotDef): Quat => qEuler(d.r * D2R, d.p * D2R, d.y * D2R);
const rotByCode = (code: number): RotDef | undefined => AP_ROTATIONS.find((d) => d.code === code);
const snapRotation = (q: Quat): RotDef => {
  let best = AP_ROTATIONS[0]!, bestD = -1;
  for (const d of AP_ROTATIONS) {
    const dd = Math.abs(qDot(q, rotQuat(d)));
    if (dd > bestD) { bestD = dd; best = d; }
  }
  return best;
};

// --- Geometri --------------------------------------------------------------
// Uçak gövdesi ortak modülden (CRAFT_FACES); burada yalnız kart geometrisi var.
// Kart: yeşil PCB + ileri oku + IMU çipi + arka-sağda konnektör (asimetri, yön ayrımı için)
const BOARD_POS: V3 = [0.15, 0, -0.03]; // gövde içindeki montaj noktası
function buildBoard(): Face[] {
  const f: Face[] = [];
  const L = 0.31, W = 0.23, T = 0.04; // yarı boyutlar
  f.push(quad([L, -W, -T], [L, W, -T], [-L, W, -T], [-L, -W, -T], 'pcb', true));   // üst
  f.push(quad([L, -W, T], [L, W, T], [-L, W, T], [-L, -W, T], 'pcbEdge', true));   // alt
  f.push(quad([L, -W, -T], [L, W, -T], [L, W, T], [L, -W, T], 'pcbEdge', true));
  f.push(quad([-L, -W, -T], [-L, W, -T], [-L, W, T], [-L, -W, T], 'pcbEdge', true));
  f.push(quad([L, W, -T], [-L, W, -T], [-L, W, T], [L, W, T], 'pcbEdge', true));
  f.push(quad([L, -W, -T], [-L, -W, -T], [-L, -W, T], [L, -W, T], 'pcbEdge', true));
  // Uçuş yönü oku (üst yüzeyin hemen üstünde)
  const z = -T - 0.004, s = 0.72;
  f.push({
    p: ([[0.34, 0], [0.1, -0.16], [0.1, -0.07], [-0.3, -0.07], [-0.3, 0.07], [0.1, 0.07], [0.1, 0.16]] as Array<[number, number]>)
      .map(([x, y]) => [x * s, y * s, z] as V3),
    tag: 'arrow', board: true,
  });
  // IMU çipi
  const cx = -0.13, cy = 0.13, ch = 0.05, cz = -T;
  f.push(quad([cx + ch, cy - ch, cz - 0.02], [cx + ch, cy + ch, cz - 0.02], [cx - ch, cy + ch, cz - 0.02], [cx - ch, cy - ch, cz - 0.02], 'chip', true));
  // Konnektör (arka sağ kenar)
  const k: [number, number, number, number, number, number] = [-L, -L + 0.1, 0.08, 0.2, cz - 0.05, cz];
  const [x0, x1, y0, y1, z0, z1] = k;
  f.push(quad([x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0], 'conn', true));
  f.push(quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], 'conn', true));
  f.push(quad([x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1], 'conn', true));
  f.push(quad([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], 'conn', true));
  return f;
}

const BOARD_FACES = buildBoard();
// Araç sınıfına göre gövde + kart yüzeyleri (kopter: quad; diğerleri: uçak)
const PLANE_ALL = CRAFT_FACES.concat(BOARD_FACES);
const QUAD_ALL = QUAD_FACES.concat(BOARD_FACES);

// --- Tema paleti -----------------------------------------------------------
interface Pal { ink: V3; line: V3; data: V3; go: V3; warn: V3; bgTop: string; bgBot: string; light: boolean }
const hexRgb = (h: string, fb: V3): V3 => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return fb;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
function readPal(): Pal {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string): string => cs.getPropertyValue(n);
  const light = document.documentElement.dataset.theme === 'light';
  return {
    ink: hexRgb(v('--ink'), [230, 238, 246]),
    line: hexRgb(v('--line'), [34, 48, 64]),
    data: hexRgb(v('--data'), [70, 224, 208]),
    go: hexRgb(v('--go'), [58, 208, 122]),
    warn: hexRgb(v('--warn'), [255, 77, 77]),
    bgTop: light ? '#eef3f8' : '#0c1218',
    bgBot: light ? '#dfe7ef' : '#080c11',
    light,
  };
}
const faceStyle = (tag: FaceTag, pal: Pal): { c: V3; a: number; ea: number } => {
  switch (tag) {
    case 'hull': return { c: pal.ink, a: pal.light ? 0.1 : 0.07, ea: 0.5 };
    case 'wing': return { c: pal.ink, a: pal.light ? 0.13 : 0.09, ea: 0.5 };
    case 'pcb': return { c: [26, 122, 84], a: 1, ea: 0.9 };
    case 'pcbEdge': return { c: [17, 84, 58], a: 1, ea: 0.9 };
    case 'arrow': return { c: pal.data, a: 1, ea: 0 };
    case 'chip': return { c: [24, 28, 34], a: 1, ea: 0.6 };
    case 'conn': return { c: [150, 158, 168], a: 1, ea: 0.6 };
  }
};

// --- Sahne çizimi ----------------------------------------------------------
interface Cam { az: number; el: number; dist: number }
export const DEFAULT_CAM: Cam = { az: -0.62, el: 0.42, dist: 8.5 };

function drawScene(cv: HTMLCanvasElement, qBoard: Quat, qVeh: Quat, cam: Cam, pal: Pal, noseLabel: string, faces: readonly Face[] = PLANE_ALL, nose: [number, number] = [2.75, 3.5]): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Arka plan
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.bgTop); g.addColorStop(1, pal.bgBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Kamera tabanı (dünya: z yukarı; FRD noktaları çizim öncesi zUp = -z ile çevrilir)
  const ce = Math.cos(cam.el), se = Math.sin(cam.el), ca = Math.cos(cam.az), sa = Math.sin(cam.az);
  const C: V3 = [cam.dist * ce * ca, cam.dist * ce * sa, cam.dist * se];
  const fwd: V3 = [-ce * ca, -ce * sa, -se];
  const right: V3 = [-sa, ca, 0];
  const up: V3 = [-se * ca, -se * sa, ce];
  const focal = Math.min(W, H) * 1.55;
  const cx = W / 2, cy = H / 2 + H * 0.04;
  const proj = (p: V3): [number, number, number] => {
    const rx = p[0] - C[0], ry = p[1] - C[1], rz = p[2] - C[2];
    const d = rx * fwd[0] + ry * fwd[1] + rz * fwd[2];
    const sx = (rx * right[0] + ry * right[1] + rz * right[2]) / d * focal;
    const sy = (rx * up[0] + ry * up[1] + rz * up[2]) / d * focal;
    return [cx + sx, cy - sy, d];
  };
  const toWorld = (p: V3): V3 => [p[0], p[1], -p[2]]; // FRD → z-yukarı

  // Zemin halkası + gölge
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const [x, y] = proj([Math.cos(a) * 3.3, Math.sin(a) * 3.3, -1.55]);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgba(${pal.line.join(',')},0.55)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const [x, y] = proj([Math.cos(a) * 2.4, Math.sin(a) * 2.4 * 0.6, -1.55]);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.fillStyle = pal.light ? 'rgba(20,30,40,0.10)' : 'rgba(0,0,0,0.30)';
  ctx.fill();
  ctx.restore();

  // Yüzeyleri dünyaya taşı, derinliğe göre sırala (painter's algorithm)
  interface DrawFace { pts: Array<[number, number, number]>; tag: FaceTag; depth: number; bright: number }
  const L: V3 = [-0.45, 0.35, 0.82]; // ışık yönü (dünya, z yukarı)
  const list: DrawFace[] = [];
  for (const f of faces) {
    const wpts: V3[] = f.p.map((p) => {
      let v: V3 = p;
      if (f.board) { v = qRot(qBoard, v); v = [v[0] + BOARD_POS[0], v[1] + BOARD_POS[1], v[2] + BOARD_POS[2]]; }
      return toWorld(qRot(qVeh, v));
    });
    // yüzey normali (ilk üç noktadan)
    const [p0, p1, p2] = wpts as [V3, V3, V3];
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const bright = 0.58 + 0.42 * Math.abs(nx * L[0] + ny * L[1] + nz * L[2]);
    const pts = wpts.map(proj);
    list.push({ pts, tag: f.tag, depth: pts.reduce((s, p) => s + p[2], 0) / pts.length, bright });
  }
  list.sort((a, b) => b.depth - a.depth);
  for (const f of list) {
    const st = faceStyle(f.tag, pal);
    const [r, gc, b] = st.c.map((c) => Math.round(Math.min(255, c * f.bright))) as V3;
    ctx.beginPath();
    f.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${gc},${b},${st.a})`;
    ctx.fill();
    if (st.ea > 0) {
      ctx.strokeStyle = `rgba(${pal.line.join(',')},${st.ea})`;
      ctx.lineWidth = f.tag === 'hull' || f.tag === 'wing' ? 0.8 : 0.6;
      ctx.stroke();
    }
  }

  // Burun yönü göstergesi
  const a0 = proj(toWorld(qRot(qVeh, [nose[0], 0, 0])));
  const a1 = proj(toWorld(qRot(qVeh, [nose[1], 0, 0])));
  ctx.strokeStyle = `rgba(${pal.data.join(',')},0.85)`;
  ctx.fillStyle = `rgba(${pal.data.join(',')},0.85)`;
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
  const ang = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]);
  ctx.beginPath();
  ctx.moveTo(a1[0], a1[1]);
  ctx.lineTo(a1[0] - 8 * Math.cos(ang - 0.42), a1[1] - 8 * Math.sin(ang - 0.42));
  ctx.lineTo(a1[0] - 8 * Math.cos(ang + 0.42), a1[1] - 8 * Math.sin(ang + 0.42));
  ctx.closePath(); ctx.fill();
  ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(noseLabel.toUpperCase(), a1[0] + 8, a1[1] + 3);

  // Köşede eksen üçlüsü (X ileri, Y sağ, Z aşağı — araç çerçevesi)
  const ox = 34, oy = H - 30, al = 20;
  const axes: Array<{ v: V3; c: V3; l: string }> = [
    { v: [1, 0, 0], c: pal.warn, l: 'X' },
    { v: [0, 1, 0], c: pal.go, l: 'Y' },
    { v: [0, 0, 1], c: pal.data, l: 'Z' },
  ];
  for (const ax of axes) {
    const w = toWorld(qRot(qVeh, ax.v));
    const sx = w[0] * right[0] + w[1] * right[1] + w[2] * right[2];
    const sy = w[0] * up[0] + w[1] * up[1] + w[2] * up[2];
    const ex = ox + sx * al, ey = oy - sy * al;
    ctx.strokeStyle = ctx.fillStyle = `rgba(${ax.c.join(',')},0.9)`;
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.font = '700 9px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(ax.l, ex + (ex >= ox ? 3 : -9), ey + 3);
  }
}

// --- Bileşen ---------------------------------------------------------------
const YAW_STEP = 45 * D2R, RP_STEP = 90 * D2R, FINE_STEP = 45 * D2R;

export function BoardOrientationView({ gcs, params, setParams, telemetry }: {
  gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void; telemetry: VehicleTelemetry | null;
}) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const entry = params.find((p) => p.name === 'AHRS_ORIENTATION');
  const paramVal = entry ? Math.round(entry.value) : null;

  const [pending, setPending] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Cam>({ ...DEFAULT_CAM });
  const qDispRef = useRef<Quat>([1, 0, 0, 0]);
  const qTargetRef = useRef<Quat>([1, 0, 0, 0]);
  const qVehRef = useRef<Quat>([1, 0, 0, 0]);
  const liveRef = useRef(false);
  const attRef = useRef<{ roll: number; pitch: number; yaw: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const palRef = useRef<Pal | null>(null);
  const facesRef = useRef<readonly Face[]>(PLANE_ALL);
  const noseRef = useRef<[number, number]>([2.75, 3.5]);

  liveRef.current = live;
  attRef.current = telemetry?.attitude ?? null;
  // Araç sınıfına göre gövde modeli (heartbeat yoksa uçak — eski davranış)
  const isCopter = !!telemetry && telemetry.connected && telemetry.vehicleType > 0 && frameClass(telemetry.vehicleType) === 'copter';
  facesRef.current = isCopter ? QUAD_ALL : PLANE_ALL;
  noseRef.current = isCopter ? [0.66, 1.5] : [2.75, 3.5];

  // İlk parametre değeri geldiğinde seçimi karttaki değerle başlat
  const initedRef = useRef(false);
  useEffect(() => {
    if (paramVal !== null && !initedRef.current) {
      initedRef.current = true;
      if (rotByCode(paramVal)) setPending(paramVal);
    }
  }, [paramVal]);

  useEffect(() => {
    const d = rotByCode(pending);
    qTargetRef.current = d ? rotQuat(d) : [1, 0, 0, 0];
  }, [pending]);

  // Canlı modda ATTITUDE mesajını 20 Hz iste (varsayılan akış 4 Hz — sahne takılır);
  // kapatınca/ayrılınca otopilotun varsayılan hızına dön (interval 0 = varsayılan).
  useEffect(() => {
    if (!live || !connected) return;
    gcs.connRef.current?.commandLong(MAV_CMD_SET_MESSAGE_INTERVAL, [MSG.ATTITUDE, 50000, 0, 0, 0, 0, 0]);
    return () => { gcs.connRef.current?.commandLong(MAV_CMD_SET_MESSAGE_INTERVAL, [MSG.ATTITUDE, 0, 0, 0, 0, 0, 0]); };
  }, [live, connected, gcs]);

  // Tema paleti: her karede getComputedStyle çağırmamak için önbellekle,
  // tema/şema değişince (root öznitelikleri) yeniden oku.
  useEffect(() => {
    palRef.current = readPal();
    const mo = new MutationObserver(() => { palRef.current = readPal(); });
    mo.observe(document.documentElement, { attributes: true });
    return () => mo.disconnect();
  }, []);

  // Render döngüsü — kart ve araç tutumu hedeflerine yumuşak slerp.
  // Telemetri düşük frekansta gelse de sahne 60 fps akar; slerp adımları doldurur.
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cv = canvasRef.current;
      if (cv && cv.clientWidth > 0) {
        qDispRef.current = qSlerp(qDispRef.current, qTargetRef.current, 1 - Math.exp(-dt * 9));
        const att = liveRef.current ? attRef.current : null;
        const qVehTarget: Quat = att ? qEuler(att.roll, att.pitch, att.yaw) : [1, 0, 0, 0];
        qVehRef.current = qSlerp(qVehRef.current, qVehTarget, 1 - Math.exp(-dt * 10));
        drawScene(cv, qDispRef.current, qVehRef.current, camRef.current, palRef.current ?? readPal(), t('Burun'), facesRef.current, noseRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [t]);

  // Tekerlek zoom'u (preventDefault için pasif olmayan dinleyici)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const c = camRef.current;
      c.dist = Math.min(16, Math.max(4.5, c.dist * (e.deltaY > 0 ? 1.08 : 0.93)));
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, []);

  // Kartı araç ekseni etrafında döndür, en yakın geçerli rotasyona otur
  const step = (axis: 'x' | 'y' | 'z', dir: 1 | -1, fine?: boolean): void => {
    const ang = dir * (axis === 'z' ? YAW_STEP : fine ? FINE_STEP : RP_STEP);
    const ax: V3 = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
    const q = qMul(qAxis(ax[0], ax[1], ax[2], ang), qTargetRef.current);
    setPending(snapRotation(q).code);
    setStatus(null);
  };

  // Sıfırla: yönelim + kamera görünümü birlikte başa döner
  const resetAll = (): void => {
    setPending(0);
    setStatus(null);
    camRef.current = { ...DEFAULT_CAM };
  };

  const onKey = (e: React.KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    const fine = e.shiftKey;
    if (k === 'q') step('x', -1, fine);
    else if (k === 'e') step('x', 1, fine);
    else if (k === 'w' || k === 'arrowup') step('y', -1, fine);
    else if (k === 's' || k === 'arrowdown') step('y', 1, fine);
    else if (k === 'a' || k === 'arrowleft') step('z', -1);
    else if (k === 'd' || k === 'arrowright') step('z', 1);
    else if (k === 'r') resetAll();
    else if (k === 'v') camRef.current = { ...DEFAULT_CAM };
    else return;
    e.preventDefault();
  };

  const apply = (): void => {
    const d = rotByCode(pending);
    if (!d) return;
    const prev = paramVal;
    void gcs.connRef.current?.setParam('AHRS_ORIENTATION', pending, entry?.type ?? 2);
    if (entry) setParams(params.map((p) => (p.name === 'AHRS_ORIENTATION' ? { ...p, value: pending } : p)));
    setStatus('AHRS_ORIENTATION ' + (prev ?? '—') + ' → ' + pending + ' (' + d.label + ')');
  };

  const sel = rotByCode(pending);
  const cur = paramVal !== null ? rotByCode(paramVal) : undefined;
  const dirty = paramVal !== null && pending !== paramVal;
  const att = telemetry?.attitude;
  const deg = (v: number): string => (v * 180 / Math.PI).toFixed(1) + '°';

  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd">
          <h2>{t('Kart Yönelimi')}</h2>
          <span className="params-spacer" />
          {!connected && <span className="hd-note">{t('bağlı değil')}</span>}
        </div>
        <div className="card-body rc-input">
          <p className="setup-desc">{t('Otopilot kartının uçak gövdesine göre montaj yönü. Kartı 3D görünümde döndürün; seçim en yakın geçerli AHRS_ORIENTATION değerine oturur.')}</p>

          <div className="orient-stage">
            <canvas ref={canvasRef} className="orient-canvas" tabIndex={0}
              onKeyDown={onKey}
              onDoubleClick={() => { camRef.current = { ...DEFAULT_CAM }; }}
              onPointerDown={(e) => { dragRef.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => {
                const d = dragRef.current;
                if (!d) return;
                const c = camRef.current;
                c.az -= (e.clientX - d.x) * 0.008;
                c.el = Math.min(1.35, Math.max(-0.5, c.el + (e.clientY - d.y) * 0.008));
                dragRef.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerUp={() => { dragRef.current = null; }}
            />
            <div className="orient-badge">
              <span className="orient-badge-code">AHRS_ORIENTATION · {sel ? sel.code : pending}</span>
              <span className="orient-badge-label">{sel ? sel.label : t('Bilinmeyen')}</span>
              {sel && <span className="orient-badge-rpy">R {sel.r}° · P {sel.p}° · Y {sel.y}°</span>}
            </div>
            {connected && (
              <label className="orient-livechk chk">
                <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
                {t('Canlı tutum')}
              </label>
            )}
          </div>
          <p className="orient-hint">{t('Sürükle: görüş · tekerlek: zoom · çift tık / V: görünümü sıfırla')} — Q/E roll · W/S pitch · A/D yaw · Shift: 45° · R: {t('Sıfırla')}</p>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Kartı döndür')}</div>
            <div className="orient-controls">
              {([['x', 'Roll', '90°'], ['y', 'Pitch', '90°'], ['z', 'Yaw', '45°']] as const).map(([ax, name, st]) => (
                <div className="orient-ctl" key={ax}>
                  <span className="orient-ctl-name">{name}</span>
                  <button onClick={() => step(ax, -1)} title={name + ' −' + st}>−{st}</button>
                  <button onClick={() => step(ax, 1)} title={name + ' +' + st}>+{st}</button>
                </div>
              ))}
              <div className="orient-ctl">
                <span className="orient-ctl-name">&nbsp;</span>
                <button onClick={resetAll}>{t('Sıfırla')}</button>
              </div>
            </div>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Yönelim')} (AHRS_ORIENTATION)</div>
            <div className="act-row">
              <select value={pending} onChange={(e) => { setPending(Number(e.target.value)); setStatus(null); }}>
                {paramVal !== null && !cur && <option value={paramVal}>{paramVal} · {t('Bilinmeyen')}</option>}
                {AP_ROTATIONS.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.label}</option>)}
              </select>
              <button className="btn-primary" disabled={!connected || !entry || !dirty} onClick={apply}>{t('Uygula')}</button>
              {dirty && cur && <span className="orient-cur">{t('karttaki değer')}: {cur.code} · {cur.label}</span>}
            </div>
            {!entry && <div className="empty">{t('AHRS_ORIENTATION parametresi yok — Parametreler sekmesinden indirin')}</div>}
            <p className="setup-desc">{t('Değişiklikten sonra kartı yeniden başlatın ve ivmeölçer + pusula kalibrasyonlarını tekrarlayın.')}</p>
          </section>

          {connected && att && (
            <section className="rc-sec">
              <div className="rc-sec-hd">{t('Doğrulama — canlı tutum')}</div>
              <div className="batt-live">
                <span className="bl-item">Roll <b>{deg(att.roll)}</b></span>
                <span className="bl-item">Pitch <b>{deg(att.pitch)}</b></span>
                <span className="bl-item">Yaw <b>{deg(att.yaw)}</b></span>
              </div>
              <p className="setup-desc">{t('Burnu yukarı kaldırın → pitch artmalı; sağa yatırın → roll artmalı. Ters tepki, yanlış yönelim demektir.')}</p>
            </section>
          )}

          {status && <div className="setup-result ok">{status}</div>}
        </div>
      </div>
    </div>
  );
}
