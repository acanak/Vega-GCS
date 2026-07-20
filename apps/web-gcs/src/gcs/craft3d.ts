// Paylaşılan hafif 3D yardımcıları: quaternion matematiği + düşük poligonlu uçak
// gövdesi. BoardOrientationView (kart yönelimi sahnesi) ve CompassCalView
// (küre içi canlı duruş) tarafından kullanılır. Eksen kuralı ArduPilot gövde
// çerçevesi (FRD): +X burun, +Y sağ kanat, +Z aşağı.

export type V3 = [number, number, number];
export type Quat = [number, number, number, number]; // w, x, y, z

export const D2R = Math.PI / 180;

export const qMul = (a: Quat, b: Quat): Quat => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
export const qAxis = (x: number, y: number, z: number, ang: number): Quat => {
  const s = Math.sin(ang / 2);
  return [Math.cos(ang / 2), x * s, y * s, z * s];
};
export const qRot = (q: Quat, v: V3): V3 => {
  const [w, x, y, z] = q;
  const [vx, vy, vz] = v;
  // v' = q * v * q⁻¹ (açılmış form)
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty, vy + w * ty + z * tx - x * tz, vz + w * tz + x * ty - y * tx];
};
export const qDot = (a: Quat, b: Quat): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export const qSlerp = (a: Quat, b: Quat, t: number): Quat => {
  let d = qDot(a, b);
  const bb: Quat = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  d = Math.abs(d);
  if (d > 0.9995) {
    const r: Quat = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t];
    const n = Math.hypot(r[0], r[1], r[2], r[3]);
    return [r[0] / n, r[1] / n, r[2] / n, r[3] / n];
  }
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
};
// ArduPilot euler kuralı: R = Rz(yaw) · Ry(pitch) · Rx(roll)
export const qEuler = (r: number, p: number, y: number): Quat =>
  qMul(qAxis(0, 0, 1, y), qMul(qAxis(0, 1, 0, p), qAxis(1, 0, 0, r)));

// --- Uçak geometrisi -------------------------------------------------------
export type FaceTag = 'hull' | 'wing' | 'pcb' | 'pcbEdge' | 'arrow' | 'chip' | 'conn';
export interface Face { p: V3[]; tag: FaceTag; board?: boolean }

export const quad = (a: V3, b: V3, c: V3, d: V3, tag: FaceTag, board?: boolean): Face => ({ p: [a, b, c, d], tag, board });

function buildCraft(): Face[] {
  const f: Face[] = [];
  // Gövde: kesitler boyunca loft (x, yarı-genişlik, üst z, alt z) — z aşağı pozitif
  const S: Array<[number, number, number, number]> = [
    [2.55, 0.05, -0.06, 0.02],
    [1.7, 0.28, -0.3, 0.24],
    [0.9, 0.32, -0.34, 0.28],
    [-0.7, 0.3, -0.32, 0.26],
    [-2.3, 0.09, -0.14, 0.02],
  ];
  for (let i = 0; i < S.length - 1; i++) {
    const [x1, w1, t1, b1] = S[i]!, [x2, w2, t2, b2] = S[i + 1]!;
    f.push(quad([x1, -w1, t1], [x1, w1, t1], [x2, w2, t2], [x2, -w2, t2], 'hull')); // üst
    f.push(quad([x1, -w1, b1], [x1, w1, b1], [x2, w2, b2], [x2, -w2, b2], 'hull')); // alt
    f.push(quad([x1, w1, t1], [x1, w1, b1], [x2, w2, b2], [x2, w2, t2], 'hull'));   // sağ
    f.push(quad([x1, -w1, t1], [x1, -w1, b1], [x2, -w2, b2], [x2, -w2, t2], 'hull')); // sol
  }
  const [xn, wn, tn, bn] = S[0]!;
  f.push(quad([xn, -wn, tn], [xn, wn, tn], [xn, wn, bn], [xn, -wn, bn], 'hull')); // burun kapağı
  const [xt, wt, tt, bt] = S[S.length - 1]!;
  f.push(quad([xt, -wt, tt], [xt, wt, tt], [xt, wt, bt], [xt, -wt, bt], 'hull')); // kuyruk kapağı
  // Kanatlar (hafif dihedral)
  f.push(quad([0.55, -0.3, -0.06], [-0.45, -0.3, -0.06], [-0.35, -2.6, -0.26], [0.15, -2.6, -0.26], 'wing'));
  f.push(quad([0.55, 0.3, -0.06], [-0.45, 0.3, -0.06], [-0.35, 2.6, -0.26], [0.15, 2.6, -0.26], 'wing'));
  // Yatay stabilize
  f.push(quad([-1.7, -0.09, -0.1], [-2.2, -0.09, -0.1], [-2.2, -0.95, -0.14], [-1.9, -0.95, -0.14], 'wing'));
  f.push(quad([-1.7, 0.09, -0.1], [-2.2, 0.09, -0.1], [-2.2, 0.95, -0.14], [-1.9, 0.95, -0.14], 'wing'));
  // Dikey kuyruk
  f.push({ p: [[-1.6, 0, -0.18], [-2.02, 0, -0.88], [-2.28, 0, -0.88], [-2.28, 0, -0.06]], tag: 'wing' });
  return f;
}

export const CRAFT_FACES: readonly Face[] = buildCraft();

// Pusula küresi içinde canlı duruş: uçağı verilen tutumla, kürenin görünüm
// dönüşünü (rotX/rotY) paylaşarak ortografik çizer. Nokta bulutunun ALTINA
// çizilmelidir (yarı saydam dolgu, örnekleri kapatmaz).
export function drawCraftInSphere(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, R: number,
  att: { roll: number; pitch: number; yaw: number },
  rotX: number, rotY: number,
  rgb: [number, number, number], accent: [number, number, number],
): void {
  const qVeh = qEuler(att.roll, att.pitch, att.yaw);
  const s = R * 0.19;
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY), cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  // FRD dünya noktası → küre görünüm çerçevesi (ekran dikeyi +y, derinlik z2)
  const proj = (p: V3): [number, number, number] => {
    const e = qRot(qVeh, p);
    const px = e[0], py = -e[2], pz = e[1]; // yer: x ileri, -z yukarı → görünüm (x, y-up, z)
    const x1 = px * cosY - pz * sinY, z1 = px * sinY + pz * cosY;
    const y2 = py * cosX - z1 * sinX, z2 = py * sinX + z1 * cosX;
    return [cx + x1 * s, cy - y2 * s, z2];
  };
  interface DF { pts: Array<[number, number, number]>; d: number; b: number; wing: boolean }
  const list: DF[] = [];
  for (const f of CRAFT_FACES) {
    const pts = f.p.map(proj);
    const [p0, p1, p2] = pts as [[number, number, number], [number, number, number], [number, number, number]];
    // ekran uzayında normal-z benzeri parlaklık (basit sabit ışık)
    const nz = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const b = 0.6 + 0.4 * Math.min(1, Math.abs(nz) / (s * s * 0.5));
    list.push({ pts, d: pts.reduce((a, p) => a + p[2], 0) / pts.length, b, wing: f.tag === 'wing' });
  }
  list.sort((a, b) => a.d - b.d);
  for (const f of list) {
    const [r, g, bl] = rgb.map((c) => Math.round(Math.min(255, c * f.b))) as V3;
    ctx.beginPath();
    f.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${bl},${f.wing ? 0.30 : 0.24})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${r},${g},${bl},0.45)`;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  // Burun yönü vurgusu
  const a0 = proj([2.55, 0, 0]), a1 = proj([3.2, 0, 0]);
  ctx.strokeStyle = ctx.fillStyle = `rgba(${accent.join(',')},0.9)`;
  ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
  const ang = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]);
  ctx.beginPath();
  ctx.moveTo(a1[0], a1[1]);
  ctx.lineTo(a1[0] - 6 * Math.cos(ang - 0.42), a1[1] - 6 * Math.sin(ang - 0.42));
  ctx.lineTo(a1[0] - 6 * Math.cos(ang + 0.42), a1[1] - 6 * Math.sin(ang + 0.42));
  ctx.closePath(); ctx.fill();
}
