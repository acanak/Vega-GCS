import { useEffect, useRef, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { UseGcs } from './useGcs';

export interface AdsbContact {
  icao: number;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  callsign: string;
  ts: number;
}

/** Araçtan gelen ADSB_VEHICLE mesajlarından yakın trafik listesi (60 sn sonra düşer). */
export function useAdsb(gcs: UseGcs): AdsbContact[] {
  const [contacts, setContacts] = useState<AdsbContact[]>([]);
  const store = useRef(new Map<number, AdsbContact>());
  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    const unsub = conn.subscribeMessage(MSG.ADSB_VEHICLE, (f) => {
      const lat = Number(f.lat) / 1e7;
      const lon = Number(f.lon) / 1e7;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
      store.current.set(Number(f.ICAO_address), {
        icao: Number(f.ICAO_address), lat, lon,
        alt: Number(f.altitude) / 1000,
        heading: Number(f.heading) / 100,
        callsign: String(f.callsign ?? '').trim(),
        ts: Date.now(),
      });
    });
    const iv = setInterval(() => {
      const now = Date.now();
      for (const [k, c] of store.current) if (now - c.ts > 60000) store.current.delete(k);
      setContacts([...store.current.values()]);
    }, 1000);
    return () => { unsub(); clearInterval(iv); store.current.clear(); setContacts([]); };
  }, [gcs.status, gcs.connRef]);
  return contacts;
}
