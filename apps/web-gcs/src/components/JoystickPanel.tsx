import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { MSG, vehicleModeIds } from '@wmp/protocol';
import type { GcsConnection } from '../gcs/protocol-shared';
import { useT } from '../gcs/i18n';

// SVG/CSS ozel degiskeni icin tip-guvenli style yardimcisi
const cvar = (val: string): CSSProperties => ({ '--c': val } as Record<string, string> as CSSProperties);

const clampPwm = (v: number): number => Math.max(1000, Math.min(2000, Math.round(v)));
const axisPwm = (a: number, inv = false): number => clampPwm(1500 + (inv ? -a : a) * 500);

// Tus -> fonksiyon eslemesi (W3C Standart Gamepad indeksleri).
// mode !== undefined ise setMode; act ile arm/disarm.
type BtnMap = { i: number; glyph: string; fn: string; act?: 'arm' | 'disarm'; mode?: string; color?: string };
const BUTTONS: BtnMap[] = [
  { i: 0, glyph: 'A', fn: 'ARM', act: 'arm', color: 'var(--go)' },
  { i: 1, glyph: 'B', fn: 'DISARM', act: 'disarm', color: 'var(--warn)' },
  { i: 2, glyph: 'X', fn: 'LOITER', mode: 'LOITER', color: 'var(--data)' },
  { i: 3, glyph: 'Y', fn: 'RTL', mode: 'RTL', color: 'var(--caution)' },
  { i: 4, glyph: 'LB', fn: 'GUIDED', mode: 'GUIDED' },
  { i: 5, glyph: 'RB', fn: 'AUTO', mode: 'AUTO' },
  { i: 8, glyph: '⊟', fn: 'STABILIZE', mode: 'STABILIZE' },
  { i: 9, glyph: '☰', fn: 'LAND', mode: 'LAND' },
];

// SVG gamepad geometrisi
const L = { cx: 72, cy: 104 };
const R = { cx: 270, cy: 104 };
const WELL_R = 32;
const KNOB_R = 13;
const TRAVEL = WELL_R - KNOB_R;
const F = { cx: 206, cy: 104, off: 20, r: 11 }; // yuz tuslari (elmas)
const FACE = [
  { i: 3, x: F.cx, y: F.cy - F.off, g: 'Y', c: 'var(--caution)' },
  { i: 1, x: F.cx + F.off, y: F.cy, g: 'B', c: 'var(--warn)' },
  { i: 0, x: F.cx, y: F.cy + F.off, g: 'A', c: 'var(--go)' },
  { i: 2, x: F.cx - F.off, y: F.cy, g: 'X', c: 'var(--data)' },
];

export function JoystickPanel({ connRef, connected }: { connRef: { current: GcsConnection | null }; connected: boolean }) {
  const t = useT();
  const [padName, setPadName] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [axes, setAxes] = useState<number[]>([0, 0, 0, 0]);
  const [btns, setBtns] = useState<boolean[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const enRef = useRef(false);
  const connRefLive = useRef(false);
  const prevBtns = useRef<boolean[]>([]);
  useEffect(() => { enRef.current = enabled && connected; }, [enabled, connected]);
  useEffect(() => { connRefLive.current = connected; }, [connected]);

  useEffect(() => {
    const scan = (): void => { const p = [...(navigator.getGamepads?.() ?? [])].find(Boolean); setPadName(p ? p.id : null); };
    scan();
    window.addEventListener('gamepadconnected', scan);
    window.addEventListener('gamepaddisconnected', scan);
    return () => { window.removeEventListener('gamepadconnected', scan); window.removeEventListener('gamepaddisconnected', scan); };
  }, []);

  const fire = (b: BtnMap): void => {
    const c = connRef.current;
    if (!c || !connRefLive.current) return;
    if (b.act === 'arm') void c.arm();
    else if (b.act === 'disarm') void c.disarm();
    else if (b.mode) { const id = vehicleModeIds(c.telemetry.vehicleType)[b.mode]; if (id !== undefined) void c.setMode(id); }
    setFlash(b.fn);
    window.setTimeout(() => setFlash((f) => (f === b.fn ? null : f)), 1600);
  };

  useEffect(() => {
    const iv = setInterval(() => {
      const p = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
      if (!p) return;
      const a = Array.from(p.axes);
      setAxes([a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0]);
      const pressed = p.buttons.map((x) => x.pressed || x.value > 0.5);
      setBtns(pressed);
      // Kenar tetikleme: sadece basma aninda fonksiyon gonder
      for (const b of BUTTONS) if (pressed[b.i] && !prevBtns.current[b.i]) fire(b);
      prevBtns.current = pressed;

      if (!enRef.current) return;
      connRef.current?.sendMessage(MSG.RC_CHANNELS_OVERRIDE, {
        target_system: 0, target_component: 0,
        chan1_raw: axisPwm(a[0] ?? 0),
        chan2_raw: axisPwm(a[1] ?? 0, true),
        chan3_raw: axisPwm(a[3] ?? 0, true),
        chan4_raw: axisPwm(a[2] ?? 0),
        chan5_raw: 0, chan6_raw: 0, chan7_raw: 0, chan8_raw: 0,
      });
    }, 40);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connRef]);

  const toggle = (): void => {
    const next = !enabled;
    setEnabled(next);
    if (!next) {
      connRef.current?.sendMessage(MSG.RC_CHANNELS_OVERRIDE, {
        target_system: 0, target_component: 0,
        chan1_raw: 0, chan2_raw: 0, chan3_raw: 0, chan4_raw: 0, chan5_raw: 0, chan6_raw: 0, chan7_raw: 0, chan8_raw: 0,
      });
    }
  };

  const has = padName != null;
  const on = (i: number): boolean => !!btns[i];
  const lk = { cx: L.cx + (axes[0] ?? 0) * TRAVEL, cy: L.cy + (axes[1] ?? 0) * TRAVEL };
  const rk = { cx: R.cx + (axes[2] ?? 0) * TRAVEL, cy: R.cy + (axes[3] ?? 0) * TRAVEL };
  const rollPwm = axisPwm(axes[0] ?? 0);
  const pitchPwm = axisPwm(axes[1] ?? 0, true);
  const yawPwm = axisPwm(axes[2] ?? 0);
  const thrPwm = axisPwm(axes[3] ?? 0, true);

  return (
    <div className="card">
      <div className="card-hd">
        <h2>Joystick</h2>
        <span className={'hd-note' + (flash ? ' act-msg' : '')}>{flash ?? (has ? t('bağlı') : t('yok'))}</span>
      </div>
      <div className="card-body">
        <svg className={'js-pad' + (has ? '' : ' idle') + (enabled ? ' live' : '')} viewBox="0 0 340 200" role="img"
          aria-label={t('Gamepad')}>
          {/* govde */}
          <rect x={12} y={30} width={316} height={152} rx={22} className="jp-deck" />
          {/* omuz tuslari */}
          <rect x={50} y={6} width={48} height={7} rx={3.5} className={'jp-btn' + (on(6) ? ' on' : '')} />
          <rect x={242} y={6} width={48} height={7} rx={3.5} className={'jp-btn' + (on(7) ? ' on' : '')} />
          <rect x={42} y={16} width={64} height={16} rx={8} className={'jp-btn' + (on(4) ? ' on' : '')} />
          <rect x={234} y={16} width={64} height={16} rx={8} className={'jp-btn' + (on(5) ? ' on' : '')} />
          <text x={74} y={28} className="jp-cap">LB</text>
          <text x={266} y={28} className="jp-cap">RB</text>
          {/* start / back */}
          <rect x={140} y={54} width={24} height={9} rx={4.5} className={'jp-btn' + (on(8) ? ' on' : '')} />
          <rect x={176} y={54} width={24} height={9} rx={4.5} className={'jp-btn' + (on(9) ? ' on' : '')} />
          {/* sol stick */}
          <circle cx={L.cx} cy={L.cy} r={WELL_R} className={'jp-well' + (on(10) ? ' press' : '')} />
          <line x1={L.cx} y1={L.cy} x2={lk.cx} y2={lk.cy} className="jp-stem" />
          <circle cx={lk.cx} cy={lk.cy} r={KNOB_R} className="jp-knob" />
          {/* sag stick */}
          <circle cx={R.cx} cy={R.cy} r={WELL_R} className={'jp-well' + (on(11) ? ' press' : '')} />
          <line x1={R.cx} y1={R.cy} x2={rk.cx} y2={rk.cy} className="jp-stem" />
          <circle cx={rk.cx} cy={rk.cy} r={KNOB_R} className="jp-knob" />
          {/* dpad */}
          <rect x={133} y={96} width={14} height={40} rx={3} className="jp-dpad" />
          <rect x={120} y={109} width={40} height={14} rx={3} className="jp-dpad" />
          {/* yuz tuslari */}
          {FACE.map((f) => (
            <g key={f.g}>
              <circle cx={f.x} cy={f.y} r={F.r} className={'jp-face' + (on(f.i) ? ' on' : '')} style={cvar(f.c)} />
              <text x={f.x} y={f.y + 3.5} className="jp-glyph">{f.g}</text>
            </g>
          ))}
          {/* eksen okumalari */}
          <text x={54} y={158} className="jp-lbl">ROLL</text><text x={90} y={158} className="jp-num">{rollPwm}</text>
          <text x={54} y={170} className="jp-lbl">PITCH</text><text x={90} y={170} className="jp-num">{pitchPwm}</text>
          <text x={244} y={158} className="jp-lbl">YAW</text><text x={288} y={158} className="jp-num">{yawPwm}</text>
          <text x={244} y={170} className="jp-lbl">THR</text><text x={288} y={170} className="jp-num">{thrPwm}</text>
        </svg>

        {!has && <div className="js-name">{t('Gamepad algılanmadı (bir tuşa basın)')}</div>}

        <div className="js-legend">
          {BUTTONS.map((b) => (
            <div key={b.i} className={'js-fn' + (on(b.i) ? ' on' : '')} style={cvar(b.color ?? 'var(--data)')} title={b.glyph}>
              <span className="g">{b.glyph}</span>{b.fn === 'STABILIZE' ? 'STAB' : b.fn}
            </div>
          ))}
        </div>

        <button className={enabled ? 'btn-disarm' : 'btn-primary'} disabled={!connected || !has} onClick={toggle}>
          {enabled ? t('Override DEVREDE — durdur') : t('Override etkinleştir')}
        </button>
        {enabled && <div className="js-warn">⚠ {t('Joystick aracı kumanda ediyor')}</div>}
      </div>
    </div>
  );
}
