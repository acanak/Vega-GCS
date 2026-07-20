import { useEffect, useRef, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

// Kokpit tarzı MASTER CAUTION paneli. EKF_STATUS_REPORT + telemetriden ikaz
// (annunciator) ışıkları türetir; ışık yanarken butona basmak gerçek uçaktaki
// gibi ikazı "acknowledge" eder (ışık söner, yeni ikazda tekrar yanar) ve
// ilgili arıza dökümünü Asistan'a yazar.

interface Ekf { flags: number; vel: number; posH: number; posV: number; mag: number; terr: number }
interface Caution { key: string; detail: string }

const F_ATT = 0x1, F_VEL_H = 0x2, F_VEL_V = 0x4, F_POS_H_REL = 0x8, F_POS_H_ABS = 0x10, F_POS_V_ABS = 0x20;
const F_CONST_POS = 0x80, F_GPS_GLITCH = 0x8000;
const CORE = F_ATT | F_VEL_H | F_VEL_V | F_POS_V_ABS;
const SENSOR_RC_RECEIVER = 0x10000; // MAV_SYS_STATUS_SENSOR_RC_RECEIVER

// Sabit ikaz yerleşimi (gerçek annunciator paneli gibi ışıklar hep yerinde durur)
const LIGHTS = ['EKF', 'VEL VAR', 'POS VAR', 'MAG VAR', 'GPS GLITCH', 'CONST POS', 'GPS FIX', 'BATT LOW', 'STALL', 'OVERSPD', 'RC LOSS', 'VIBE'] as const;
const VIBE_LIMIT = 30; // m/s² — ArduPilot önerisi: 30 altı iyi, 30-60 sorunlu, 60+ kötü

// Kokpit "caution chime": Web Audio ile sentezlenmiş çift ton (B5 → G5), dosya gerekmez.
// Tarayıcı autoplay kuralı gereği AudioContext ilk kullanıcı etkileşiminden sonra ses verir.
let audioCtx: AudioContext | null = null;
function playChime(): void {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const t0 = audioCtx.currentTime;
    const tone = (freq: number, start: number, dur: number): void => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + start);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.05);
    };
    tone(988, 0, 0.22);   // B5
    tone(784, 0.18, 0.5); // G5
  } catch { /* ses yoksa sessiz devam */ }
}

export function MasterCautionPanel({ gcs, telemetry, params, onReport }: {
  gcs: UseGcs; telemetry: VehicleTelemetry | null; params: ParamEntry[]; onReport?: (text: string) => void;
}) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const [ekf, setEkf] = useState<Ekf | null>(null);
  // SYS_STATUS sağlık bitlerinden RC alıcı durumu: -1 bilinmiyor/takılı değil, 0 kayıp, 1 sağlıklı
  const [rcHealth, setRcHealth] = useState(-1);
  const [vibe, setVibe] = useState<{ x: number; y: number; z: number; clip: number } | null>(null);
  const [acked, setAcked] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (gcs.status !== 'connected') { setVibe(null); return; }
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.VIBRATION, (f) => {
      setVibe({
        x: Number(f.vibration_x), y: Number(f.vibration_y), z: Number(f.vibration_z),
        clip: Number(f.clipping_0) + Number(f.clipping_1) + Number(f.clipping_2),
      });
    });
  }, [gcs.status, gcs.connRef]);

  useEffect(() => {
    if (gcs.status !== 'connected') { setRcHealth(-1); return; }
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.SYS_STATUS, (f) => {
      const present = Number(f.onboard_control_sensors_present) & SENSOR_RC_RECEIVER;
      const healthy = Number(f.onboard_control_sensors_health) & SENSOR_RC_RECEIVER;
      setRcHealth(present ? (healthy ? 1 : 0) : -1);
    });
  }, [gcs.status, gcs.connRef]);

  useEffect(() => {
    if (gcs.status !== 'connected') { setEkf(null); return; }
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.EKF_STATUS_REPORT, (f) => {
      setEkf({
        flags: Number(f.flags),
        vel: Number(f.velocity_variance),
        posH: Number(f.pos_horiz_variance),
        posV: Number(f.pos_vert_variance),
        mag: Number(f.compass_variance),
        terr: Number(f.terrain_alt_variance),
      });
    });
  }, [gcs.status, gcs.connRef]);

  // Aktif ikazlar (variance eşiği 0.8 = Mission Planner "kötü" sınırı)
  const cautions: Caution[] = [];
  if (connected && ekf) {
    const posHealthy = (ekf.flags & (F_POS_H_ABS | F_POS_H_REL)) !== 0;
    if ((ekf.flags & CORE) !== CORE || !posHealthy) cautions.push({ key: 'EKF', detail: 'tahmin sağlıksız (flags 0x' + ekf.flags.toString(16) + ')' });
    if (ekf.vel >= 0.8) cautions.push({ key: 'VEL VAR', detail: ekf.vel.toFixed(2) });
    if (Math.max(ekf.posH, ekf.posV) >= 0.8) cautions.push({ key: 'POS VAR', detail: 'H ' + ekf.posH.toFixed(2) + ' · V ' + ekf.posV.toFixed(2) });
    if (ekf.mag >= 0.8) cautions.push({ key: 'MAG VAR', detail: ekf.mag.toFixed(2) });
    if ((ekf.flags & F_GPS_GLITCH) !== 0) cautions.push({ key: 'GPS GLITCH', detail: 'GPS konum sıçraması' });
    if ((ekf.flags & F_CONST_POS) !== 0) cautions.push({ key: 'CONST POS', detail: 'EKF sabit konum modunda (konum kaynağı yok)' });
  }
  if (connected && telemetry) {
    if (telemetry.gps.fixType < 3) cautions.push({ key: 'GPS FIX', detail: '3D fix yok (fix ' + telemetry.gps.fixType + ', ' + telemetry.gps.satellites + ' uydu)' });
    if (telemetry.battery.remaining >= 0 && telemetry.battery.remaining < 20)
      cautions.push({ key: 'BATT LOW', detail: '%' + telemetry.battery.remaining + ' · ' + telemetry.battery.voltage.toFixed(1) + 'V' });
    // Stall / overspeed — hız zarfı paramlarına göre, yalnız ARM'lıyken (yerde sürekli ötmesin)
    const pval = (...names: string[]): number | undefined => {
      for (const n of names) { const e = params.find((p) => p.name === n); if (e) return e.value; }
      return undefined;
    };
    const ias = telemetry.vfr.airspeed;
    const vMin = pval('AIRSPEED_MIN', 'ARSPD_FBW_MIN');
    const vMax = pval('AIRSPEED_MAX', 'ARSPD_FBW_MAX');
    if (telemetry.armed && Number.isFinite(ias) && ias > 0.5) {
      if (vMin !== undefined && vMin > 0 && ias < vMin) cautions.push({ key: 'STALL', detail: 'IAS ' + ias.toFixed(1) + ' < min ' + vMin + ' m/s' });
      if (vMax !== undefined && vMax > 0 && ias > vMax) cautions.push({ key: 'OVERSPD', detail: 'IAS ' + ias.toFixed(1) + ' > max ' + vMax + ' m/s' });
    }
  }
  if (connected && rcHealth === 0) cautions.push({ key: 'RC LOSS', detail: 'RC alıcı sinyali yok (SYS_STATUS: unhealthy)' });
  if (connected && vibe && Math.max(vibe.x, vibe.y, vibe.z) >= VIBE_LIMIT) {
    cautions.push({
      key: 'VIBE',
      detail: 'X ' + vibe.x.toFixed(0) + ' · Y ' + vibe.y.toFixed(0) + ' · Z ' + vibe.z.toFixed(0) + ' m/s²'
        + (vibe.clip > 0 ? ' · clip ' + vibe.clip : ''),
    });
  }
  const activeKeys = cautions.map((c) => c.key);

  // İkaz temizlenince ack kaydını da düşür → aynı ikaz tekrar oluşursa ışık yeniden yanar
  const activeSig = activeKeys.join('|');
  useEffect(() => {
    setAcked((prev) => {
      const next = [...prev].filter((k) => activeKeys.includes(k));
      return next.length === prev.size ? prev : new Set(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSig]);

  const lit = cautions.some((c) => !acked.has(c.key));

  // Sesli ikaz: ışık sönükten yanığa geçince bir kez chime çal (susturulabilir)
  const [mute, setMute] = useState(() => localStorage.getItem('wmp-mc-mute') === '1');
  const prevLitRef = useRef(false);
  useEffect(() => {
    if (lit && !prevLitRef.current && !mute) playChime();
    prevLitRef.current = lit;
  }, [lit, mute]);
  const toggleMute = (): void => {
    setMute((m) => { localStorage.setItem('wmp-mc-mute', m ? '0' : '1'); return !m; });
  };

  const press = (): void => {
    if (cautions.length > 0) {
      const lines = cautions.map((c) => c.key + ' — ' + c.detail);
      const warns = gcs.statusTexts.filter((e) => e.severity <= 4).slice(-3).map((e) => e.text);
      onReport?.('⚠ MASTER CAUTION (' + cautions.length + '): ' + lines.join(' · ')
        + (warns.length ? ' | ' + t('Son uyarılar') + ': ' + warns.join(' · ') : ''));
      setAcked(new Set(activeKeys));
    } else {
      onReport?.('✈ Master Caution: ' + t('aktif ikaz yok — tüm sistemler normal.'));
    }
  };

  return (
    <div className="card mc-card">
      <div className="card-hd">
        <h2>Master Caution</h2>
        {!connected && <span className="hd-note">{t('bağlı değil')}</span>}
        {connected && !ekf && <span className="hd-note">{t('EKF verisi bekleniyor…')}</span>}
        <span className="params-spacer" />
        <button className="hd-btn" onClick={toggleMute} title={t('Sesli ikaz aç/kapat')} aria-label={t('Sesli ikaz aç/kapat')}>
          {mute ? '🔇' : '🔊'}
        </button>
      </div>
      <div className="card-body mc-body">
        <button className={'mc-btn' + (lit ? ' lit' : '')} onClick={press} disabled={!connected}
          title={t('Basınca ikazlar onaylanır ve döküm Asistan’a yazılır')}>
          MASTER<br />CAUTION
        </button>
        <div className="mc-grid">
          {LIGHTS.map((name) => {
            const c = cautions.find((x) => x.key === name);
            return (
              <span key={name} className={'mc-cell' + (c ? ' on' : '')} title={c ? c.detail : undefined}>{name}</span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
