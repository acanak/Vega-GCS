import { useEffect, useState } from 'react';
import type { VehicleTelemetry } from '@wmp/protocol';
import type { GcsConnection } from './protocol-shared';

function snapshot(t: VehicleTelemetry): VehicleTelemetry {
  return {
    ...t,
    attitude: { ...t.attitude },
    position: { ...t.position },
    vfr: { ...t.vfr },
    battery: { ...t.battery },
    gps: { ...t.gps },
    seenMessages: { ...t.seenMessages },
  };
}

/** conn.telemetry'yi ~hz kez/sn React state'e flush eder (render firtinasi olmadan). */
export function useTelemetry(connRef: { current: GcsConnection | null }, hz = 10): VehicleTelemetry | null {
  const [snap, setSnap] = useState<VehicleTelemetry | null>(null);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const period = 1000 / hz;
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      if (now - last < period) return;
      last = now;
      const conn = connRef.current;
      if (conn) setSnap(snapshot(conn.telemetry));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [connRef, hz]);
  return snap;
}
