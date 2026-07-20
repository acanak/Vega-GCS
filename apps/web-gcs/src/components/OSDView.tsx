import { useMemo, useRef, useState } from 'react';
import type { ParamEntry } from '@wmp/protocol';
import { modeName } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useTelemetry } from '../gcs/useTelemetry';
import { useT } from '../gcs/i18n';
import { OSD_ELEMENTS, OSD_TYPES, OSD_UNITS, OSD_RES, OSD_WARN, OSD_FONTS, OSD_TEMPLATES, GOGGLE_PRESETS, GOGGLE_ZONES, SERIAL_PROTO_MSP_DISPLAYPORT, SERIAL_BAUD_115200 } from '../gcs/ardupilot-osd';

const clampI = (v: number, max: number): number => Math.max(0, Math.min(max, Math.round(v)));
const DIR_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const dirArrow = (deg: number): string => DIR_ARROWS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

// --- OSD grafiksel ogeler (gercek OSD gorunumu) ---
function OsdHorizon({ roll, pitch }: { roll: number; pitch: number }) {
  const deg = (-roll * 180) / Math.PI;
  const off = Math.max(-16, Math.min(16, (pitch * 180) / Math.PI * 1.1));
  return (
    <svg viewBox="0 0 104 46" className="osd-svg" preserveAspectRatio="none">
      <g transform={`translate(52 ${23 + off}) rotate(${deg})`}>
        <line x1={-48} y1={0} x2={-16} y2={0} className="osd-hz" />
        <line x1={16} y1={0} x2={48} y2={0} className="osd-hz" />
        <line x1={-16} y1={0} x2={-12} y2={5} className="osd-hz" />
        <line x1={16} y1={0} x2={12} y2={5} className="osd-hz" />
      </g>
      <path d="M42 23 L48 23 L52 27 L56 23 L62 23" className="osd-ref" />
    </svg>
  );
}
function OsdBattBar({ pct }: { pct: number }) {
  const c = pct < 20 ? '#ff4d4d' : pct < 40 ? '#f2b134' : '#3ad07a';
  return (
    <svg viewBox="0 0 64 12" className="osd-svg">
      <rect x={1} y={1} width={62} height={10} className="osd-barbg" />
      <rect x={2.5} y={2.5} width={(59 * Math.max(0, Math.min(100, pct))) / 100} height={7} fill={c} />
    </svg>
  );
}
function OsdSidebars() {
  return (
    <svg viewBox="0 0 70 44" className="osd-svg" preserveAspectRatio="none">
      <line x1={6} y1={2} x2={6} y2={42} className="osd-ref" />
      <line x1={64} y1={2} x2={64} y2={42} className="osd-ref" />
      {[8, 16, 24, 32].map((y) => <g key={y}><line x1={6} y1={y} x2={11} y2={y} className="osd-ref" /><line x1={59} y1={y} x2={64} y2={y} className="osd-ref" /></g>)}
      <path d="M6 22 l6 -4 l0 8 z" className="osd-ref" /><path d="M64 22 l-6 -4 l0 8 z" className="osd-ref" />
    </svg>
  );
}
function OsdCompass({ hdg }: { hdg: number }) {
  const marks = ['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'];
  const idx = Math.round(hdg / 30) % 12;
  const view = [-2, -1, 0, 1, 2].map((d) => marks[(idx + d + 12) % 12]);
  return (
    <svg viewBox="0 0 88 16" className="osd-svg" preserveAspectRatio="none">
      <line x1={2} y1={11} x2={86} y2={11} className="osd-ref" />
      {view.map((m, i) => <text key={i} x={10 + i * 18} y={9} className="osd-txt" textAnchor="middle">{m}</text>)}
      <path d="M44 12 l-4 4 l8 0 z" className="osd-ref" />
    </svg>
  );
}

export function OSDView({ gcs, params, setParams }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void }) {
  const t = useT();
  const [screen, setScreen] = useState(1);
  const [drag, setDrag] = useState<{ token: string; x: number; y: number } | null>(null);
  const [search, setSearch] = useState('');
  const [adv, setAdv] = useState(false);
  const [goggle, setGoggle] = useState(() => localStorage.getItem('wmp-osd-goggle') || 'none');
  const setGoggleP = (g: string): void => { setGoggle(g); localStorage.setItem('wmp-osd-goggle', g); };
  const [tmpl, setTmpl] = useState('');
  const [local, setLocal] = useState<Record<string, number>>({});
  const gridRef = useRef<HTMLDivElement | null>(null);
  const connected = gcs.status === 'connected';
  const tele = useTelemetry(gcs.connRef);

  const pmap = useMemo(() => new Map(params.map((p) => [p.name, p] as const)), [params]);
  const raw = (name: string): number | undefined => (name in local ? local[name] : pmap.get(name)?.value);
  const val = (name: string, dflt: number): number => { const v = raw(name); return v === undefined ? dflt : v; };
  const has = (name: string): boolean => pmap.has(name);

  const setP = (name: string, value: number): void => {
    setLocal((prev) => ({ ...prev, [name]: value }));
    const entry = pmap.get(name);
    if (entry && connected) {
      setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
      gcs.connRef.current?.setParam(name, value, entry.type).catch(() => {});
    }
  };

  const osdType = val('OSD_TYPE', 0);
  const osdType2 = val('OSD_TYPE2', 0);
  const osdUnits = val('OSD_UNITS', 0);
  const isHd = osdType === 5;

  // MSP/DisplayPort için serial port (SERIALx_PROTOCOL = 42). SERIAL0..9 (bazı FC'ler farklı port kullanır).
  const SERIAL_PORTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const curPort = SERIAL_PORTS.find((x) => val('SERIAL' + x + '_PROTOCOL', -1) === SERIAL_PROTO_MSP_DISPLAYPORT) ?? 0;
  const setOsdPort = (x: number): void => { if (!x) return; setP('SERIAL' + x + '_PROTOCOL', SERIAL_PROTO_MSP_DISPLAYPORT); setP('SERIAL' + x + '_BAUD', SERIAL_BAUD_115200); };
  const needsPort = [osdType, osdType2].some((tp) => tp === 5 || tp === 3);
  // MSP_OPTIONS bit maskesi: 0 = telemetri modu (tek kablo), 1 = DJI düzeltmelerini kapat,
  // 2 = Betaflight font emülasyonu (DJI gözlüklerde ArduPilot fontu olmadığından gerekli)
  const mspOpt = Math.round(val('MSP_OPTIONS', 0));
  const setMspBit = (bit: number, on: boolean): void =>
    setP('MSP_OPTIONS', on ? (mspOpt | (1 << bit)) : (mspOpt & ~(1 << bit)));
  const resParam = 'OSD' + screen + '_TXT_RES';
  const resCode = isHd ? val(resParam, 1) : 0;
  const grid = OSD_RES.find((r) => r.code === resCode) ?? OSD_RES[0]!;
  const { cols, rows } = grid;

  const fx = (token: string, kind: 'EN' | 'X' | 'Y'): string => 'OSD' + screen + '_' + token + '_' + kind;

  const move = (e: React.PointerEvent): void => {
    if (!drag || !gridRef.current) return;
    const r = gridRef.current.getBoundingClientRect();
    const x = clampI(((e.clientX - r.left) / r.width) * cols, cols - 1);
    const y = clampI(((e.clientY - r.top) / r.height) * rows, rows - 1);
    setDrag({ token: drag.token, x, y });
  };
  const up = (e: React.PointerEvent): void => {
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setP(fx(drag.token, 'X'), drag.x);
    setP(fx(drag.token, 'Y'), drag.y);
    setDrag(null);
  };

  // Çok sayıda parametreyi tek state güncellemesiyle yaz (setP döngüde stale params bırakır)
  const setMany = (updates: Record<string, number>): void => {
    setLocal((prev) => ({ ...prev, ...updates }));
    if (connected) {
      setParams(params.map((p) => (p.name in updates ? { ...p, value: updates[p.name]! } : p)));
      for (const [name, value] of Object.entries(updates)) {
        const entry = pmap.get(name);
        if (entry) gcs.connRef.current?.setParam(name, value, entry.type).catch(() => {});
      }
    }
  };

  // Şablon uygula: HD 50×18'e geç, listedeki öğeleri konumlandır, kalanları kapat.
  const applyTemplate = (key: string): void => {
    const tp = OSD_TEMPLATES.find((x) => x.key === key);
    if (!tp) return;
    const u: Record<string, number> = {
      [resParam]: 1, // HD 50×18 — tüm şablonlar bu grid için tasarlandı
      ['OSD' + screen + '_ENABLE']: 1,
    };
    for (const el of OSD_ELEMENTS) {
      const pos = tp.items[el.token];
      if (pos) {
        u[fx(el.token, 'EN')] = 1;
        u[fx(el.token, 'X')] = pos[0];
        u[fx(el.token, 'Y')] = pos[1];
      } else if (val(fx(el.token, 'EN'), 0) > 0) {
        u[fx(el.token, 'EN')] = 0;
      }
    }
    setMany(u);
  };

  const s = search.trim().toUpperCase();
  const list = OSD_ELEMENTS.filter((el) => !s || el.token.includes(s) || el.label.toUpperCase().includes(s));
  const enabledEls = OSD_ELEMENTS.filter((el) => val(fx(el.token, 'EN'), 0) > 0);
  const enabledCount = enabledEls.length;

  const typeNote = osdType === 0 ? t('OSD kapalı (OSD_TYPE = Yok)')
    : osdType === 3 ? t('MSP modunda gözlük kendi düzenini çizer — öğe konumları kullanılmaz')
    : osdType === 4 ? t('Yalnızca TX — yerel çizim yok')
    : null;

  // --- Ogeleri gercek OSD gorunumunde render et (canli telemetri varsa onu, yoksa ornek) ---
  const isF = Number.isFinite;
  const f1 = (v: number): string => (Math.round(v * 10) / 10).toFixed(1);
  const imp = osdUnits === 1;
  const uAlt = imp ? 'ft' : 'm';
  const uSpd = imp ? 'mph' : 'm/s';
  const kAlt = imp ? 3.28084 : 1;
  const kSpd = imp ? 2.23694 : 1;
  const T = tele;
  const alt = Math.round((T && isF(T.position.relativeAlt) ? T.position.relativeAlt : T && isF(T.vfr.alt) ? T.vfr.alt : 57) * kAlt);
  const gs = Math.round((T ? T.vfr.groundspeed : 14) * kSpd);
  const as = Math.round((T ? T.vfr.airspeed : 16) * kSpd);
  const vs = (T ? T.vfr.climb : 1.2) * kSpd;
  const thr = Math.round(T ? T.vfr.throttle : 42);
  const volt = T && isF(T.battery.voltage) && T.battery.voltage > 0 ? T.battery.voltage : 12.4;
  const curr = T && T.battery.current >= 0 ? T.battery.current : 8.2;
  const pct = T && T.battery.remaining >= 0 ? T.battery.remaining : 68;
  const sats = T ? T.gps.satellites : 12;
  const hdg = Math.round(T && isF(T.position.hdg) ? T.position.hdg : 125);
  const mode = T ? modeName(T.vehicleType, T.customMode) : 'FBWA';
  const roll = T ? T.attitude.roll : 0.12;
  const pitch = T ? T.attitude.pitch : -0.04;
  const cells = Math.max(1, Math.round(volt / 3.8));
  const cellv = volt / cells;
  const deg = (r: number): string => Math.round((r * 180) / Math.PI) + '°';

  const SAMPLE: Record<string, string> = {
    ALTITUDE: '↥' + alt + uAlt, TER_HGT: '⏚' + Math.round(alt * 0.9) + uAlt,
    BAT_VOLT: f1(volt) + 'V', RESTVOLT: f1(volt + 0.2) + 'V', CELLVOLT: f1(cellv) + 'V', AVGCELLV: f1(cellv) + 'V', ACRVOLT: f1(cellv + 0.05) + 'V', BAT2_VLT: '0.0V',
    CURRENT: f1(curr) + 'A', CURRENT2: '0.0A', BATUSED: '430mAh', BAT2USED: '0mAh', POWER: Math.round(volt * curr) + 'W',
    RSSI: '⚞' + '96', LINK_Q: 'LQ99', RC_LQ: 'LQ99', RSSIDBM: '-52dBm', RC_SNR: '12dB', RC_ANT: 'A1', RC_PWR: '250mW',
    SATS: '⌖' + sats, HDOP: '0.8', GPSLAT: '39.9250', GPSLONG: '32.8369',
    FLTMODE: mode, ARMING: (T ? T.armed : false) ? 'ARMED' : 'DISARMED', MESSAGE: 'EKF3 IMU0 using GPS',
    GSPEED: gs + uSpd, ASPEED: as + uSpd, ASPD1: as + uSpd, ASPD2: (as - 1) + uSpd, VSPEED: (vs >= 0 ? '↑' : '↓') + f1(Math.abs(vs)),
    HEADING: hdg + '°', THROTTLE: '↑' + thr + '%', ROLL: deg(roll), PITCH: deg(pitch), WIND: '→4' + uSpd,
    TEMP: '32°C', BTEMP: '31°C', ATEMP: '29°C', ESCTEMP: '46°C', ESCRPM: '4200', ESCAMPS: '9.1A', RPM: '4200',
    FLTIME: '03:12', CLK: '14:32', DIST: '1.2km', HOMEDIST: '⌂120' + uAlt, HOMEDIR: '⌂' + dirArrow(315), HOME: '⌂' + dirArrow(315) + '120' + uAlt,
    WAYPOINT: '▲0.4km', XTRACK: '0.3m', CLIMBEFF: '8.5', EFF: '95mAh/km', FENCE: 'FENCE', RNGF: '2.4m',
    VTX_PWR: '25mW', PLUSCODE: '8FVC9G8F+5W', CALLSIGN: 'TC-ABC', STATS: 'STATS',
  };

  const visual = (tok: string): { node: React.ReactNode; gfx?: boolean; w?: number; h?: number } => {
    switch (tok) {
      case 'HORIZON': return { node: <OsdHorizon roll={roll} pitch={pitch} />, gfx: true, w: 104, h: 46 };
      case 'CRSSHAIR': return { node: <span className="osd-cross">✛</span>, gfx: true, w: 16, h: 16 };
      case 'BATTBAR': return { node: <OsdBattBar pct={pct} />, gfx: true, w: 64, h: 12 };
      case 'SIDEBARS': return { node: <OsdSidebars />, gfx: true, w: 70, h: 44 };
      case 'COMPASS': return { node: <OsdCompass hdg={hdg} />, gfx: true, w: 88, h: 16 };
      default: return { node: SAMPLE[tok] ?? '––' };
    }
  };

  return (
    <div className="setup-panel osd-panel">
      <div className="card osd-preview-card">
        <div className="card-hd">
          <h2>{t('OSD tasarım')}</h2>
          <div className="osd-screens">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} className={n === screen ? 'active' : ''} onClick={() => setScreen(n)}>OSD{n}</button>
            ))}
          </div>
        </div>
        <div className="card-body">
          <div className="osd-settings">
            <label className="osd-set">
              <span>{t('OSD tipi')}</span>
              <select value={osdType} onChange={(e) => setP('OSD_TYPE', Number(e.target.value))}>
                {OSD_TYPES.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
              </select>
            </label>
            <label className="osd-set">
              <span>{t('OSD tipi 2')}</span>
              <select value={osdType2} onChange={(e) => setP('OSD_TYPE2', Number(e.target.value))}>
                {OSD_TYPES.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
              </select>
            </label>
            <label className="osd-set">
              <span>{t('Birim')}</span>
              <select value={osdUnits} onChange={(e) => setP('OSD_UNITS', Number(e.target.value))}>
                {OSD_UNITS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </label>
            <label className="osd-set">
              <span>{t('Çözünürlük')}</span>
              <select value={resCode} disabled={!isHd} title={isHd ? '' : t('Yalnızca HD DisplayPort için')}
                onChange={(e) => setP(resParam, Number(e.target.value))}>
                {OSD_RES.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </label>
            <label className="osd-set" title={needsPort ? '' : t('OSD tipi MSP / DisplayPort iken kullanılır')}>
              <span>{t('Port (MSP DisplayPort)')}{needsPort ? '' : ' ⚠'}</span>
              <select value={curPort} onChange={(e) => setOsdPort(Number(e.target.value))}>
                <option value={0}>{t('— seç —')}</option>
                {SERIAL_PORTS.filter((x) => x > 0).map((x) => {
                  const p = val('SERIAL' + x + '_PROTOCOL', -1);
                  return <option key={x} value={x}>SERIAL{x} · {p >= 0 ? 'p' + p : '—'}{p === SERIAL_PROTO_MSP_DISPLAYPORT ? ' ✓' : ''}</option>;
                })}
              </select>
            </label>
            <span className="osd-gridinfo">{cols}×{rows}</span>
          </div>

          <div className="osd-settings">
            <label className="osd-set chk-set">
              <span>{t('Ekran açık')} (OSD{screen})</span>
              <input type="checkbox" checked={val('OSD' + screen + '_ENABLE', screen === 1 ? 1 : 0) > 0} onChange={(e) => setP('OSD' + screen + '_ENABLE', e.target.checked ? 1 : 0)} />
            </label>
            <label className="osd-set">
              <span>{t('Ekran seçme kanalı')}</span>
              <input className="osd-num" value={val('OSD_CHAN', 0)} onChange={(e) => setP('OSD_CHAN', clampI(Number(e.target.value), 16))} title={t('0 = kapalı; ör. 7 = RC7 ile ekran değiştir')} />
            </label>
            <label className="osd-set">
              <span>{t('Font')} (OSD_FONT)</span>
              <select value={val('OSD_FONT', 0)} onChange={(e) => setP('OSD_FONT', Number(e.target.value))}>
                {OSD_FONTS.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
              </select>
            </label>
            <label className="osd-set">
              <span>{t('Gözlük yerleşimi')}</span>
              <select value={goggle} onChange={(e) => setGoggleP(e.target.value)} title={t('Gözlüğün kendi OSD ögelerini grid’de gölgeli gösterir (çakışmayı önlemek için)')}>
                {GOGGLE_PRESETS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </label>
            <button className="btn-ghost osd-adv-btn" onClick={() => setAdv((a) => !a)}>{adv ? '▾' : '▸'} {t('Gelişmiş')}</button>
          </div>

          {needsPort && (
            <div className="osd-settings osd-msp-row">
              <span className="osd-msp-hd">MSP_OPTIONS</span>
              <label className="osd-set chk-set" title={t('DJI gözlüklerde ArduPilot font tablosu olmadığından gereklidir')}>
                <span>{t('Betaflight font emülasyonu')}</span>
                <input type="checkbox" checked={(mspOpt & 4) !== 0} onChange={(e) => setMspBit(2, e.target.checked)} />
              </label>
              <label className="osd-set chk-set" title={t('Hava ünitesi yalnız TX hattıyla (tek kablo) bağlıysa açın')}>
                <span>{t('Telemetri (push) modu')}</span>
                <input type="checkbox" checked={(mspOpt & 1) !== 0} onChange={(e) => setMspBit(0, e.target.checked)} />
              </label>
              <label className="osd-set chk-set" title={t('DJI uyumluluk düzeltmelerini devre dışı bırakır — yalnız gerekirse')}>
                <span>{t('DJI düzeltmelerini kapat')}</span>
                <input type="checkbox" checked={(mspOpt & 2) !== 0} onChange={(e) => setMspBit(1, e.target.checked)} />
              </label>
            </div>
          )}

          <div className="osd-settings osd-tmpl-row">
            <label className="osd-set">
              <span>{t('Şablon')} (HD 50×18)</span>
              <select value={tmpl} onChange={(e) => setTmpl(e.target.value)}>
                <option value="">{t('— seç —')}</option>
                {OSD_TEMPLATES.map((tp) => <option key={tp.key} value={tp.key}>{t(tp.label)}</option>)}
              </select>
            </label>
            <button className="btn-primary" disabled={!tmpl} onClick={() => applyTemplate(tmpl)}
              title={t('Mevcut yerleşimin üzerine yazar; sonrasında öğeleri sürükleyerek düzenleyebilirsiniz')}>
              {t('Uygula')} → OSD{screen}
            </button>
            {tmpl && <span className="osd-tmpl-desc">{t(OSD_TEMPLATES.find((x) => x.key === tmpl)?.desc ?? '')}</span>}
          </div>

          {adv && (
            <div className="osd-adv">
              <label className="osd-set">
                <span>OSD_OPTIONS</span>
                <input className="osd-num" value={val('OSD_OPTIONS', 0)} onChange={(e) => setP('OSD_OPTIONS', Number(e.target.value) || 0)} title={t('Bit maskesi (ör. birim/ok yönü seçenekleri)')} />
              </label>
              <div className="osd-warn-hd">{t('Uyarı eşikleri')}</div>
              {OSD_WARN.map((w) => (
                <label key={w.label} className="osd-set">
                  <span>{w.label}</span>
                  <input className="osd-num" value={val(w.label, 0)} disabled={connected && !has(w.label)} onChange={(e) => setP(w.label, Number(e.target.value) || 0)} />
                </label>
              ))}
            </div>
          )}

          {typeNote && <div className="osd-typenote">⚠ {typeNote}</div>}
          {connected && !has('OSD_TYPE') && <div className="osd-typenote">⚠ {t('OSD parametreleri yüklü değil — Parametreler sekmesinden indirin.')}</div>}

          <div className="osd-grid" ref={gridRef} style={{ aspectRatio: cols + ' / ' + rows, backgroundSize: 100 / cols + '% ' + 100 / rows + '%' }}>
            {/* Gözlük kendi OSD bölgeleri (çakışmayı önlemek için) */}
            {(GOGGLE_ZONES[goggle] ?? []).map((z, i) => (
              <div key={'z' + i} className="osd-zone" style={{ left: z.x * 100 + '%', top: z.y * 100 + '%', width: z.w * 100 + '%', height: z.h * 100 + '%' }}>
                <span>{z.label}</span>
              </div>
            ))}
            {/* X/Y koordinat cetvelleri */}
            {Array.from({ length: Math.ceil(cols / 5) }, (_, i) => i * 5).map((c) => (
              <span key={'tx' + c} className="osd-tick osd-tick-x" style={{ left: (c / cols) * 100 + '%' }}>{c}</span>
            ))}
            {Array.from({ length: Math.ceil(rows / 4) }, (_, i) => i * 4).map((r) => (
              <span key={'ty' + r} className="osd-tick osd-tick-y" style={{ top: (r / rows) * 100 + '%' }}>{r}</span>
            ))}
            {enabledEls.map((el) => {
              const x = drag?.token === el.token ? drag.x : val(fx(el.token, 'X'), 0);
              const y = drag?.token === el.token ? drag.y : val(fx(el.token, 'Y'), 0);
              const vis = visual(el.token);
              return (
                <div key={el.token} className={'osd-item' + (vis.gfx ? ' gfx' : '') + (drag?.token === el.token ? ' dragging' : '')} title={el.token + ' · ' + el.label}
                  style={{ left: (x / cols) * 100 + '%', top: (y / rows) * 100 + '%', ...(vis.w ? { width: vis.w, height: vis.h } : {}) }}
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ token: el.token, x, y }); }}
                  onPointerMove={move} onPointerUp={up}>
                  {vis.node}
                  {drag?.token === el.token && <span className="osd-coord">X{drag.x} Y{drag.y}</span>}
                </div>
              );
            })}
            {enabledCount === 0 && <div className="osd-empty">{t('Sağdaki listeden öğe açın')}</div>}
          </div>
          <div className="osd-hint">
            {drag ? <b>{drag.token}: X{drag.x} · Y{drag.y}</b> : t('Öğeleri sürükleyerek konumlandırın')} · OSD{screen} · {enabledCount} {t('aktif')} · {t('grid')} {cols}×{rows}. {connected ? t('Değişiklikler araca yazılır.') : t('Çevrimdışı tasarım — bağlanınca yazılır.')}
          </div>
        </div>
      </div>

      <div className="card osd-list-card">
        <div className="card-hd">
          <h2>{t('Öğeler')}</h2>
          <input className="param-search" placeholder={t('Ara…')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="hd-note">{enabledCount}/{OSD_ELEMENTS.length}</span>
        </div>
        <div className="card-body grid-scroll">
          <table className="cmd-grid osd-el-grid">
            <thead><tr><th>{t('Etkin')}</th><th>{t('Öğe')}</th><th>X</th><th>Y</th></tr></thead>
            <tbody>
              {list.map((el) => {
                const en = val(fx(el.token, 'EN'), 0) > 0;
                const onVeh = has(fx(el.token, 'EN'));
                return (
                  <tr key={el.token} className={en ? 'osd-on' : ''}>
                    <td className="osd-c-en"><input type="checkbox" checked={en} onChange={(e) => setP(fx(el.token, 'EN'), e.target.checked ? 1 : 0)} /></td>
                    <td className="p-name">
                      {el.token}
                      <span className="osd-el-label">{el.label}</span>
                      {el.cond && <span className="osd-badge cond" title={t('Firmware’de olmayabilir')}>koşullu</span>}
                      {connected && !onVeh && <span className="osd-badge missing" title={t('Bu parametre araçta yok')}>araçta yok</span>}
                    </td>
                    <td><input className="osd-xy" value={val(fx(el.token, 'X'), 0)} onChange={(e) => setP(fx(el.token, 'X'), clampI(Number(e.target.value), cols - 1))} /></td>
                    <td><input className="osd-xy" value={val(fx(el.token, 'Y'), 0)} onChange={(e) => setP(fx(el.token, 'Y'), clampI(Number(e.target.value), rows - 1))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
