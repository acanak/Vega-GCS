import { useEffect, useRef } from 'react';
import { modeName } from '@wmp/protocol';
import type { GcsConnection } from '../gcs/protocol-shared';
import { useTheme } from '../gcs/theme';
import { renderPfd } from '../hud/renderPfd';
import type { PfdState } from '../hud/renderPfd';

const DEG = Math.PI / 180;
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const shortest = (d: number): number => (((d % 360) + 540) % 360) - 180;
const lerpAngle = (a: number, b: number, t: number): number => a + shortest(b - a) * t;

interface Disp {
  roll: number; pitch: number; heading: number; airspeed: number; altitude: number;
  vspeed: number; throttle: number; trendSpeed: number;
  prevAs: number; lastT: number; introStart: number; wasConnected: boolean;
  selAlt: number; selSpd: number; selHdg: number; captured: boolean;
}

export function Hud({ connRef }: { connRef: { current: GcsConnection | null } }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { effective } = useTheme();
  const themeRef = useRef(effective);
  themeRef.current = effective;
  const d = useRef<Disp>({
    roll: 0, pitch: 0, heading: 0, airspeed: 0, altitude: 0, vspeed: 0, throttle: 0, trendSpeed: 0,
    prevAs: 0, lastT: 0, introStart: -1, wasConnected: false,
    selAlt: NaN, selSpd: NaN, selHdg: NaN, captured: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;

    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw);
      const st = d.current;
      const t = connRef.current?.telemetry;
      const connected = !!t?.connected;
      const dt = st.lastT ? Math.min(0.1, (now - st.lastT) / 1000) : 0.016;
      st.lastT = now;
      const k = 1 - Math.pow(0.0015, dt); // ibre yumusatma (zaman sabiti ~150ms)

      if (connected && !st.wasConnected) {
        st.introStart = reduce ? -1 : now;
        st.captured = false;
      }
      st.wasConnected = connected;

      const yawDeg = t ? ((t.attitude.yaw * 180) / Math.PI + 360) % 360 : 0;
      const tgtHdg = t ? (Number.isFinite(t.position.hdg) ? t.position.hdg : yawDeg) : 0;
      const tgtAs = t ? t.vfr.airspeed : 0;
      const tgtAlt = t ? (Number.isFinite(t.position.relativeAlt) ? t.position.relativeAlt : t.vfr.alt) : 0;

      st.roll = lerp(st.roll, t ? t.attitude.roll : 0, k);
      st.pitch = lerp(st.pitch, t ? t.attitude.pitch : 0, k);
      st.heading = ((lerpAngle(st.heading, tgtHdg, k) % 360) + 360) % 360;
      const prevAs = st.airspeed;
      st.airspeed = lerp(st.airspeed, tgtAs, k);
      st.altitude = lerp(st.altitude, tgtAlt, k);
      st.vspeed = lerp(st.vspeed, t ? t.vfr.climb : 0, k * 0.6);
      st.throttle = lerp(st.throttle, t ? t.vfr.throttle : 0, k);

      if (connected && !st.captured && Number.isFinite(tgtAlt)) {
        st.selAlt = Math.round(tgtAlt / 10) * 10;
        st.selSpd = Math.max(0, Math.round(tgtAs));
        st.selHdg = Math.round(tgtHdg);
        st.captured = true;
      }

      const rawTrend = ((st.airspeed - prevAs) / Math.max(dt, 1e-3)) * 6;
      st.trendSpeed = lerp(st.trendSpeed, rawTrend, 0.08);

      let fdRoll = NaN;
      let fdPitch = NaN;
      if (connected && st.captured) {
        fdRoll = clamp(shortest(st.selHdg - st.heading) * 0.5, -25, 25) * DEG;
        fdPitch = clamp((st.selAlt - st.altitude) * 0.4, -12, 12) * DEG;
      }

      const intro = st.introStart < 0 ? 1 : Math.min(1, (now - st.introStart) / 900);

      const state: PfdState = {
        connected,
        roll: st.roll, pitch: st.pitch, heading: st.heading,
        airspeed: st.airspeed, groundspeed: t ? t.vfr.groundspeed : 0,
        altitude: st.altitude, vspeed: st.vspeed, throttle: st.throttle,
        batteryV: t ? t.battery.voltage : NaN, batteryPct: t ? t.battery.remaining : -1,
        gpsFix: t ? t.gps.fixType : 0, gpsSats: t ? t.gps.satellites : 0,
        mode: t ? modeName(t.vehicleType, t.customMode) : '',
        armed: !!t?.armed,
        selAltitude: st.selAlt, selSpeed: st.selSpd, selHeading: st.selHdg,
        trendSpeed: st.trendSpeed, trendAlt: st.vspeed * 6, slip: 0,
        fdRoll, fdPitch, intro,
      };

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const hh = canvas.clientHeight;
      if (w === 0 || hh === 0) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hh * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(hh * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderPfd(ctx, w, hh, state, themeRef.current);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [connRef]);

  return <canvas ref={canvasRef} className="pfd" />;
}
