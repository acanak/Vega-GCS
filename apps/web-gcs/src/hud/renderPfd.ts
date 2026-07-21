// Birincil ucus gostergesi (PFD) - G1000 tarzi yuksek-fidelite avionics, saf Canvas 2D.
// Roll arki + slip/skid, pitch merdiveni, entegre hiz/irtifa seritleri (trend vektoru +
// secili "bug"), dikey hiz gostergesi (VSI), alttan HSI pusula arki, flight director
// cubuklari ve annunciator'lar. Acilis self-test (intro) ve ibre yumusatma disaridan gelir.
//
// Tema: attitude kuresi (mavi gok / kahve yer) ve uzerindeki beyaz cizgiler her iki temada
// ayni kalir (dogru okuma). Yalnizca "chrome" (seritler, VSI, HSI, deger kutulari, cerceve)
// palete gore degisir; boylece acik temada arayuzle uyumlu, koyu temada klasik EFIS gorunumu.

export type PfdTheme = 'light' | 'dark';

export interface PfdState {
  connected: boolean;
  roll: number; // rad
  pitch: number; // rad
  heading: number; // derece
  airspeed: number; // m/s — hız bandında gösterilen birincil hız (kopter: groundspeed)
  groundspeed: number; // m/s
  speedIsGround?: boolean; // birincil hız groundspeed ise (kopter) — ayrı GS çipi gizlenir
  altitude: number; // m
  vspeed: number; // m/s
  throttle: number; // %
  batteryV: number;
  batteryPct: number;
  gpsFix: number;
  gpsSats: number;
  mode: string;
  armed: boolean;
  selAltitude: number; // referans irtifa bug (m)
  selSpeed: number; // referans hiz bug (m/s)
  selHeading: number; // referans yon bug (derece)
  trendSpeed: number; // 6 sn hiz projeksiyonu (m/s delta)
  trendAlt: number; // 6 sn irtifa projeksiyonu (m delta)
  slip: number; // -1..1
  fdRoll: number; // flight director komut roll (rad), NaN = kapali
  fdPitch: number; // flight director komut pitch (rad)
  intro: number; // 0..1 self-test acilis
}

interface Palette {
  skyTop: string; skyHz: string; gndHz: string; gndBot: string;
  overlay: string;            // kure uzerindeki beyaz cizgi/yazi (ufuk, pitch, roll)
  chromeBgA: string; chromeBgB: string; // serit cam gradyani
  vsiBg: string;
  hsiBg1: string; hsiBg2: string;
  chromeEdge: string;         // serit/HSI kenar cizgisi
  chromeSoft: string; chromeFaint: string; // serit/HSI/VSI uzerindeki tik ve yazilar
  boxBg: string; boxStroke: string; boxInk: string; // deger kutulari
  cyan: string; magenta: string; amber: string; cardAmber: string;
  go: string; caution: string; warn: string;
  annunInk: string; annunFaint: string; // annunciator (kure uzerinde, iki temada acik)
  bezel: string;
}

const PALETTES: Record<PfdTheme, Palette> = {
  dark: {
    skyTop: '#215fa8', skyHz: '#4f97dd', gndHz: '#7a5620', gndBot: '#3a2a12',
    overlay: '#ffffff',
    chromeBgA: 'rgba(10,14,20,0.72)', chromeBgB: 'rgba(10,14,20,0.5)',
    vsiBg: 'rgba(10,14,20,0.6)',
    hsiBg1: 'rgba(14,20,28,0.9)', hsiBg2: 'rgba(8,12,17,0.95)',
    chromeEdge: 'rgba(180,200,220,0.4)',
    chromeSoft: 'rgba(255,255,255,0.8)', chromeFaint: 'rgba(255,255,255,0.5)',
    boxBg: 'rgba(4,8,12,0.95)', boxStroke: '#ffffff', boxInk: '#ffffff',
    cyan: '#25d4ff', magenta: '#ff54ef', amber: '#ffb020', cardAmber: '#ffb020',
    go: '#38d778', caution: '#f2b134', warn: '#ff5555',
    annunInk: '#eaf1f8', annunFaint: 'rgba(255,255,255,0.5)',
    bezel: 'rgba(150,170,190,0.28)',
  },
  light: {
    skyTop: '#3f83c9', skyHz: '#8fc0ea', gndHz: '#9a7434', gndBot: '#6b4d20',
    overlay: '#ffffff',
    chromeBgA: 'rgba(236,241,247,0.9)', chromeBgB: 'rgba(236,241,247,0.66)',
    vsiBg: 'rgba(236,241,247,0.8)',
    hsiBg1: 'rgba(233,239,245,0.96)', hsiBg2: 'rgba(220,229,238,0.98)',
    chromeEdge: 'rgba(60,80,100,0.35)',
    chromeSoft: 'rgba(28,42,56,0.92)', chromeFaint: 'rgba(40,55,70,0.62)',
    boxBg: 'rgba(248,251,254,0.96)', boxStroke: 'rgba(40,60,80,0.85)', boxInk: '#16202b',
    cyan: '#0c8fd0', magenta: '#c81fb6', amber: '#ffb020', cardAmber: '#9a6300',
    go: '#12a150', caution: '#b07414', warn: '#d92d2d',
    annunInk: '#f3f7fb', annunFaint: 'rgba(255,255,255,0.6)',
    bezel: 'rgba(90,110,130,0.5)',
  },
};

const MONO = 'ui-monospace, Menlo, Consolas, monospace';

const nn = (x: number, f = 0): number => (Number.isFinite(x) ? x : f);
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const ease = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function shadow(ctx: CanvasRenderingContext2D, on: boolean): void {
  if (on) {
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
}

export function renderPfd(ctx: CanvasRenderingContext2D, w: number, h: number, s: PfdState, theme: PfdTheme = 'dark'): void {
  const P = PALETTES[theme];
  const intro = ease(s.intro);
  const roll = nn(s.roll);
  const pitchDeg = (nn(s.pitch) * 180) / Math.PI;

  const tapeW = clamp(Math.round(w * 0.12), 44, 66);
  const vsiW = 26;
  const hsiH = clamp(Math.round(h * 0.17), 54, 92);
  const instTop = 0;
  const instBot = h - hsiH;
  const instH = instBot - instTop;
  const cx = w / 2;
  const cy = instTop + instH * 0.52;
  const pxPerDeg = instH / 44;

  ctx.clearRect(0, 0, w, h);

  // ===== Yapay ufuk + pitch merdiveni =====
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, instTop, w, instH);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const big = Math.max(w, h) * 2.4;
  const po = pitchDeg * pxPerDeg;
  let g = ctx.createLinearGradient(0, po - big, 0, po);
  g.addColorStop(0, P.skyTop);
  g.addColorStop(1, P.skyHz);
  ctx.fillStyle = g;
  ctx.fillRect(-big, po - big, 2 * big, big);
  g = ctx.createLinearGradient(0, po, 0, po + big);
  g.addColorStop(0, P.gndHz);
  g.addColorStop(1, P.gndBot);
  ctx.fillStyle = g;
  ctx.fillRect(-big, po, 2 * big, big);
  ctx.strokeStyle = P.overlay;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-big, po);
  ctx.lineTo(big, po);
  ctx.stroke();

  // pitch merdiveni (2.5 minor, 5 orta, 10 major+etiket)
  ctx.strokeStyle = P.overlay;
  ctx.fillStyle = P.overlay;
  ctx.font = '600 10px ' + MONO;
  ctx.textBaseline = 'middle';
  for (let a = -40; a <= 40; a += 2.5) {
    if (a === 0) continue;
    const y = po - a * pxPerDeg;
    if (y < -instH || y > instH) continue;
    const isMajor = a % 10 === 0;
    const isMid = a % 5 === 0;
    const half = isMajor ? 44 : isMid ? 26 : 12;
    ctx.globalAlpha = (isMajor ? 0.95 : isMid ? 0.7 : 0.5) * intro;
    ctx.lineWidth = isMajor ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
    if (isMajor) {
      // ufka bakan kucuk uc
      const tick = a > 0 ? 6 : -6;
      ctx.moveTo(-half, y);
      ctx.lineTo(-half, y + tick);
      ctx.moveTo(half, y);
      ctx.lineTo(half, y + tick);
    }
    ctx.stroke();
    if (isMajor) {
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.abs(a)), -half - 6, y);
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.abs(a)), half + 6, y);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ===== Flight director cubuklari (magenta) =====
  if (Number.isFinite(s.fdRoll) && Number.isFinite(s.fdPitch) && s.connected) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-(roll - s.fdRoll));
    const fy = clamp((s.fdPitch - nn(s.pitch)) * (180 / Math.PI) * pxPerDeg, -60, 60);
    ctx.globalAlpha = intro;
    ctx.strokeStyle = P.magenta;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-46, fy + 10);
    ctx.lineTo(0, fy);
    ctx.lineTo(46, fy + 10);
    ctx.stroke();
    ctx.restore();
  }

  // ===== Roll arki + slip/skid =====
  const rollR = instH * 0.42;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = intro;
  ctx.strokeStyle = P.overlay;
  ctx.fillStyle = P.overlay;
  for (const m of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const ang = (m * Math.PI) / 180;
    const big2 = m % 30 === 0;
    const inner = big2 ? rollR - 13 : rollR - 8;
    ctx.lineWidth = m === 0 ? 0 : 1.4;
    if (m === 0) {
      // tepe ucgen (sabit referans)
      ctx.beginPath();
      ctx.moveTo(0, -rollR);
      ctx.lineTo(-7, -rollR - 12);
      ctx.lineTo(7, -rollR - 12);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(Math.sin(ang) * rollR, -Math.cos(ang) * rollR);
      ctx.lineTo(Math.sin(ang) * inner, -Math.cos(ang) * inner);
      ctx.stroke();
    }
  }
  // hareketli roll isaretcisi + slip/skid trapez
  ctx.rotate(-roll);
  ctx.fillStyle = P.overlay;
  ctx.beginPath();
  ctx.moveTo(0, -rollR + 2);
  ctx.lineTo(-8, -rollR + 15);
  ctx.lineTo(8, -rollR + 15);
  ctx.closePath();
  ctx.fill();
  const slipX = clamp(nn(s.slip), -1, 1) * 16;
  ctx.strokeStyle = P.overlay;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-11 + slipX, -rollR + 17, 22, 5);
  ctx.globalAlpha = 1;
  ctx.restore();

  // ===== Ucak referans sembolu (G1000 turuncu) =====
  ctx.save();
  ctx.translate(cx, cy);
  const drawAircraft = (color: string, lw: number): void => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    // sol kanat
    ctx.beginPath();
    ctx.moveTo(-62, 0);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-26, 9);
    ctx.stroke();
    // sag kanat
    ctx.beginPath();
    ctx.moveTo(62, 0);
    ctx.lineTo(26, 0);
    ctx.lineTo(26, 9);
    ctx.stroke();
    // merkez
    ctx.fillRect(-3, -3, 6, 6);
  };
  drawAircraft('rgba(0,0,0,0.85)', 6);
  drawAircraft(P.amber, 3);
  ctx.restore();

  // ===== Seritler =====
  drawTape(ctx, {
    x: 0, w: tapeW, top: instTop, h: instH, cy, side: 'left', intro,
    value: nn(s.airspeed), sel: nn(s.selSpeed), trend: nn(s.trendSpeed),
    unitPerMajor: 5, pxPerUnit: instH / 30, decimals: 0, label: 'AS',
  }, P);
  const altX = w - tapeW - vsiW;
  drawTape(ctx, {
    x: altX, w: tapeW, top: instTop, h: instH, cy, side: 'right', intro,
    value: nn(s.altitude), sel: nn(s.selAltitude), trend: nn(s.trendAlt),
    unitPerMajor: 10, pxPerUnit: instH / 54, decimals: 0, label: 'ALT',
  }, P);
  drawVsi(ctx, w - vsiW, instTop, instH, vsiW, cy, nn(s.vspeed), intro, P);

  // ===== HSI pusula arki (alt) =====
  drawHsi(ctx, w, h, hsiH, nn(s.heading, NaN), nn(s.selHeading), intro, P);

  // ===== Annunciator'lar =====
  drawAnnunciators(ctx, w, instBot, tapeW, s, intro, P);

  // ===== Bezel =====
  ctx.strokeStyle = P.bezel;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

interface TapeOpts {
  x: number; w: number; top: number; h: number; cy: number; side: 'left' | 'right';
  value: number; sel: number; trend: number; unitPerMajor: number; pxPerUnit: number;
  decimals: number; label: string; intro: number;
}

function drawTape(ctx: CanvasRenderingContext2D, o: TapeOpts, P: Palette): void {
  const right = o.side === 'right';
  const slide = (1 - o.intro) * (right ? 24 : -24);
  ctx.save();
  ctx.translate(slide, 0);
  ctx.globalAlpha = o.intro;

  // cam panel + ic aydinlatma
  const gg = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
  gg.addColorStop(0, right ? P.chromeBgA : P.chromeBgB);
  gg.addColorStop(1, right ? P.chromeBgB : P.chromeBgA);
  ctx.fillStyle = gg;
  ctx.fillRect(o.x, o.top, o.w, o.h);
  ctx.strokeStyle = P.chromeEdge;
  ctx.lineWidth = 1;
  const ex = right ? o.x + 0.5 : o.x + o.w - 0.5;
  ctx.beginPath();
  ctx.moveTo(ex, o.top);
  ctx.lineTo(ex, o.top + o.h);
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(o.x, o.top, o.w, o.h);
  ctx.clip();

  const tickX = right ? o.x : o.x + o.w;
  const dir = right ? 1 : -1;

  // secili bug (cyan)
  if (Number.isFinite(o.sel)) {
    const by = clamp(o.cy - (o.sel - o.value) * o.pxPerUnit, o.top + 2, o.top + o.h - 2);
    ctx.fillStyle = P.cyan;
    ctx.beginPath();
    ctx.moveTo(tickX, by);
    ctx.lineTo(tickX + dir * 8, by - 6);
    ctx.lineTo(tickX + dir * 8, by + 6);
    ctx.closePath();
    ctx.fill();
  }

  // trend vektoru (magenta)
  if (Math.abs(o.trend) > 0.2) {
    const ty = o.cy - o.trend * o.pxPerUnit;
    ctx.strokeStyle = P.magenta;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tickX + dir * 3, o.cy);
    ctx.lineTo(tickX + dir * 3, ty);
    ctx.stroke();
  }

  // skala
  ctx.font = '600 10px ' + MONO;
  ctx.fillStyle = P.chromeSoft;
  ctx.strokeStyle = P.chromeFaint;
  ctx.textBaseline = 'middle';
  const minor = o.unitPerMajor / 5;
  const range = Math.ceil(o.h / o.pxPerUnit / 2) + o.unitPerMajor;
  const start = Math.floor((o.value - range) / minor) * minor;
  for (let v = start; v <= o.value + range; v += minor) {
    const y = o.cy - (v - o.value) * o.pxPerUnit;
    if (y < o.top || y > o.top + o.h) continue;
    const major = Math.abs(v % o.unitPerMajor) < 1e-6;
    ctx.lineWidth = 1;
    ctx.globalAlpha = (major ? 0.85 : 0.5) * o.intro;
    ctx.beginPath();
    ctx.moveTo(tickX, y);
    ctx.lineTo(tickX + dir * (major ? 9 : 5), y);
    ctx.stroke();
    if (major && v >= 0) {
      ctx.textAlign = right ? 'left' : 'right';
      ctx.fillText(String(Math.round(v)), tickX + dir * 12, y);
    }
  }
  ctx.globalAlpha = o.intro;
  ctx.restore();

  // deger kutusu (chevron isaretcili)
  const boxH = 26;
  const notch = 7;
  const bx = right ? o.x - 2 : o.x + 2;
  ctx.save();
  ctx.translate(slide, 0);
  ctx.globalAlpha = o.intro;
  ctx.fillStyle = P.boxBg;
  ctx.strokeStyle = P.boxStroke;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  if (right) {
    ctx.moveTo(bx, o.cy);
    ctx.lineTo(bx + notch, o.cy - boxH / 2);
    ctx.lineTo(bx + o.w, o.cy - boxH / 2);
    ctx.lineTo(bx + o.w, o.cy + boxH / 2);
    ctx.lineTo(bx + notch, o.cy + boxH / 2);
  } else {
    ctx.moveTo(bx + o.w, o.cy);
    ctx.lineTo(bx + o.w - notch, o.cy - boxH / 2);
    ctx.lineTo(bx, o.cy - boxH / 2);
    ctx.lineTo(bx, o.cy + boxH / 2);
    ctx.lineTo(bx + o.w - notch, o.cy + boxH / 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = P.boxInk;
  ctx.font = '700 16px ' + MONO;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.value.toFixed(o.decimals), bx + o.w / 2 + (right ? notch / 2 : -notch / 2), o.cy);
  // etiket
  shadow(ctx, true);
  ctx.fillStyle = P.chromeFaint;
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(o.label, bx + o.w / 2, o.top + 4);
  shadow(ctx, false);
  ctx.restore();
}

function drawVsi(
  ctx: CanvasRenderingContext2D, x: number, top: number, instH: number, vsiW: number, cy: number, vs: number, intro: number, P: Palette,
): void {
  const maxVs = 10;
  const half = instH * 0.42;
  ctx.save();
  ctx.globalAlpha = intro;
  ctx.fillStyle = P.vsiBg;
  ctx.fillRect(x, cy - half - 10, vsiW, 2 * half + 20);
  ctx.strokeStyle = P.chromeFaint;
  ctx.lineWidth = 1;
  ctx.font = '600 8px ' + MONO;
  ctx.fillStyle = P.chromeSoft;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let v = -maxVs; v <= maxVs; v += 2) {
    const y = cy - (v / maxVs) * half;
    const major = v % 4 === 0;
    ctx.globalAlpha = (major ? 0.8 : 0.45) * intro;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (major ? 8 : 5), y);
    ctx.stroke();
  }
  ctx.globalAlpha = intro;
  // pointer + kutu
  const cl = clamp(vs, -maxVs, maxVs);
  const y = cy - (cl / maxVs) * half;
  ctx.strokeStyle = Math.abs(vs) > 0.3 ? P.go : P.chromeSoft;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, cy);
  ctx.lineTo(x + vsiW - 3, y);
  ctx.stroke();
  ctx.fillStyle = P.boxBg;
  ctx.fillRect(x + 1, y - 8, vsiW - 2, 16);
  ctx.fillStyle = P.boxInk;
  ctx.font = '700 9px ' + MONO;
  ctx.fillText(vs.toFixed(1), x + vsiW / 2, y);
  ctx.restore();
}

function drawHsi(
  ctx: CanvasRenderingContext2D, w: number, h: number, hsiH: number, heading: number, sel: number, intro: number, P: Palette,
): void {
  const top = h - hsiH;
  ctx.save();
  ctx.globalAlpha = intro;
  const bg = ctx.createLinearGradient(0, top, 0, h);
  bg.addColorStop(0, P.hsiBg1);
  bg.addColorStop(1, P.hsiBg2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, top, w, hsiH);
  ctx.strokeStyle = P.chromeEdge;
  ctx.beginPath();
  ctx.moveTo(0, top + 0.5);
  ctx.lineTo(w, top + 0.5);
  ctx.stroke();

  const cx = w / 2;
  if (!Number.isFinite(heading)) {
    ctx.fillStyle = P.chromeFaint;
    ctx.font = '600 12px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HDG ---', cx, top + hsiH / 2);
    ctx.restore();
    return;
  }
  const hd = ((heading % 360) + 360) % 360;

  // pusula arki
  const R = w * 1.05;
  const ccy = top + hsiH + R - 30;
  const ppd = 3.4;
  ctx.beginPath();
  ctx.rect(0, top, w, hsiH);
  ctx.clip();
  const cards: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d++) {
    const dd = ((Math.round(hd + d) % 360) + 360) % 360;
    if (dd % 5 !== 0) continue;
    const theta = (d * ppd) / R;
    const sx = cx + Math.sin(theta) * R;
    const sy = ccy - Math.cos(theta) * R;
    const major = dd % 10 === 0;
    const ux = Math.sin(theta);
    const uy = -Math.cos(theta);
    const len = major ? 10 : 6;
    ctx.strokeStyle = P.chromeSoft;
    ctx.lineWidth = 1;
    ctx.globalAlpha = intro;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + ux * len, sy + uy * len);
    ctx.stroke();
    if (dd % 30 === 0) {
      ctx.save();
      ctx.translate(sx + ux * (len + 9), sy + uy * (len + 9));
      ctx.fillStyle = cards[dd] ? P.cardAmber : P.chromeSoft;
      ctx.font = cards[dd] ? '700 13px ' + MONO : '600 10px ' + MONO;
      ctx.textBaseline = 'middle';
      ctx.fillText(cards[dd] ?? String(dd / 10), 0, 0);
      ctx.restore();
    }
  }
  // heading bug (cyan)
  if (Number.isFinite(sel)) {
    let d = (((sel - hd) % 360) + 540) % 360 - 180;
    if (Math.abs(d) <= 60) {
      const theta = (d * ppd) / R;
      const sx = cx + Math.sin(theta) * R;
      const sy = ccy - Math.cos(theta) * R;
      ctx.fillStyle = P.cyan;
      ctx.beginPath();
      ctx.arc(sx, sy - 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // lubber line + kutu
  ctx.save();
  ctx.globalAlpha = intro;
  ctx.fillStyle = P.cardAmber;
  ctx.beginPath();
  ctx.moveTo(cx, top + 12);
  ctx.lineTo(cx - 6, top + 2);
  ctx.lineTo(cx + 6, top + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = P.boxBg;
  ctx.strokeStyle = P.cardAmber;
  ctx.lineWidth = 1.2;
  const bw = 46;
  ctx.beginPath();
  ctx.rect(cx - bw / 2, top + 12, bw, 20);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = P.boxInk;
  ctx.font = '700 14px ' + MONO;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.round(hd)).padStart(3, '0') + '°', cx, top + 22);
  ctx.restore();
}

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, t: string, c: string, a: CanvasTextAlign): void {
  ctx.save();
  shadow(ctx, true);
  ctx.font = '700 12px ' + MONO;
  ctx.textAlign = a;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c;
  ctx.fillText(t, x, y);
  ctx.restore();
}

function drawAnnunciators(
  ctx: CanvasRenderingContext2D, w: number, instBot: number, tapeW: number, s: PfdState, intro: number, P: Palette,
): void {
  ctx.save();
  ctx.globalAlpha = intro;
  const pad = tapeW + 10;
  chip(ctx, pad, 16, (s.mode || '—').toUpperCase(), P.amber, 'left');

  const armText = !s.connected ? 'NO LINK' : s.armed ? 'ARMED' : 'DISARMED';
  const armColor = !s.connected ? P.annunFaint : s.armed ? P.go : P.warn;
  ctx.save();
  shadow(ctx, true);
  ctx.font = '800 17px ' + MONO;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = armColor;
  ctx.fillText(armText, w / 2, 18);
  ctx.restore();

  // Uçakta bant IAS gösterir, GS ayrı çipte; kopterde bant zaten GS — çip gereksiz.
  if (!s.speedIsGround) chip(ctx, pad, instBot - 30, 'GS ' + nn(s.groundspeed).toFixed(1), P.annunInk, 'left');
  const bc = s.batteryPct >= 0 && s.batteryPct < 20 ? P.warn : s.batteryPct < 40 ? P.caution : P.go;
  const bt = (Number.isFinite(s.batteryV) ? s.batteryV.toFixed(1) + 'V' : '--V') + (s.batteryPct >= 0 ? ' ' + Math.round(s.batteryPct) + '%' : '');
  chip(ctx, pad, instBot - 14, bt, bc, 'left');

  chip(ctx, w - pad, instBot - 30, 'THR ' + Math.round(nn(s.throttle)) + '%', P.annunInk, 'right');
  const fix = ['NO GPS', 'NO FIX', '2D', '3D', 'DGPS', 'RTK-F', 'RTK'];
  const gc = s.gpsFix >= 3 ? P.go : s.gpsFix === 2 ? P.caution : P.warn;
  chip(ctx, w - pad, instBot - 14, (fix[s.gpsFix] ?? 'GPS') + ' ' + s.gpsSats, gc, 'right');
  ctx.restore();
}
