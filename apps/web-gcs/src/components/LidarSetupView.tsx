import { useEffect, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import type { CodeLabel } from '../gcs/ardupilot-rc';
import { SERIAL_PROTOCOLS, SERIAL_BAUDS } from '../gcs/ardupilot-rc';
import { useT } from '../gcs/i18n';
import { ParamRefreshNote } from './ParamRefresh';

// Lidar / mesafe sensörü (RNGFND) kurulumu + DISTANCE_SENSOR canlı okuma.
// Ekran SABİTTİR: tüm bölümler her zaman görünür; araçta henüz olmayan
// parametrelerin alanları soluk/pasif çizilir (RNGFND1_* paramları tip
// etkinleştirilip yeniden başlatılınca oluşur).

const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4))));

// ArduPilot RNGFNDx_TYPE — yaygın sürücüler (tam liste firmware'e göre değişir;
// listede olmayan mevcut değer "Bilinmeyen (n)" olarak korunur)
const RNGFND_TYPE: readonly CodeLabel[] = [
  { code: 0, label: 'None' }, { code: 1, label: 'Analog' }, { code: 5, label: 'PWM' },
  { code: 7, label: 'LightWare I2C' }, { code: 8, label: 'LightWare Serial' },
  { code: 10, label: 'MAVLink' }, { code: 14, label: 'TeraRanger I2C' },
  { code: 15, label: 'LidarLite v3 I2C' }, { code: 16, label: 'VL53L0X I2C' },
  { code: 19, label: 'Benewake TF02' }, { code: 20, label: 'Benewake TFmini / Plus' },
  { code: 23, label: 'BlueRobotics Ping' }, { code: 24, label: 'DroneCAN' },
  { code: 27, label: 'Benewake TF03' }, { code: 28, label: 'VL53L1X I2C' },
  { code: 30, label: 'HC-SR04' }, { code: 32, label: 'MSP' }, { code: 100, label: 'SITL' },
];
// Yönelim: ArduPilot Rotation enum'unun sensörler için anlamlı alt kümesi
const RNGFND_ORIENT: readonly CodeLabel[] = [
  { code: 25, label: 'Aşağı (Pitch 270)' }, { code: 24, label: 'Yukarı (Pitch 90)' },
  { code: 0, label: 'İleri' }, { code: 4, label: 'Geri (Yaw 180)' },
  { code: 2, label: 'Sağ (Yaw 90)' }, { code: 6, label: 'Sol (Yaw 270)' },
];

interface Live { dist: number; min: number; max: number; quality: number }

export function LidarSetupView({ gcs, params, setParams }: {
  gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void;
}) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const [live, setLive] = useState<Live | null>(null);
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  const write = (name: string, value: number): void => {
    const e = pget(name);
    void gcs.connRef.current?.setParam(name, value, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };

  useEffect(() => {
    if (gcs.status !== 'connected') { setLive(null); return; }
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.DISTANCE_SENSOR, (f) => {
      setLive({
        dist: Number(f.current_distance) / 100,
        min: Number(f.min_distance) / 100,
        max: Number(f.max_distance) / 100,
        quality: Number(f.signal_quality ?? -1),
      });
    });
  }, [gcs.status, gcs.connRef]);

  const typeParam = pget('RNGFND1_TYPE');
  const typeVal = Math.round(typeParam?.value ?? 0);
  const typeKnown = RNGFND_TYPE.some((o) => o.code === typeVal);
  const orientParam = pget('RNGFND1_ORIENT');
  const orientVal = Math.round(orientParam?.value ?? 25);
  const orientKnown = RNGFND_ORIENT.some((o) => o.code === orientVal);

  // Seri port entegrasyonu: lidar portu = protokolü 9 (Rangefinder) olan ilk SERIALn.
  // SERIAL0 (USB konsol) listelenmez — oraya rangefinder atamak USB bağlantısını koparır.
  const serialPorts: number[] = [];
  for (let n = 1; n <= 8; n++) if (pget('SERIAL' + n + '_PROTOCOL')) serialPorts.push(n);
  const lidarPort = serialPorts.find((n) => Math.round(pget('SERIAL' + n + '_PROTOCOL')!.value) === 9) ?? -1;
  const protoLabel = (code: number): string => SERIAL_PROTOCOLS.find((o) => o.code === code)?.label ?? String(code);
  const setLidarPort = (next: number): void => {
    if (next === lidarPort) return;
    if (lidarPort >= 0) write('SERIAL' + lidarPort + '_PROTOCOL', -1); // eski portu serbest bırak
    if (next >= 0) write('SERIAL' + next + '_PROTOCOL', 9);
  };
  const baudParam = lidarPort >= 0 ? pget('SERIAL' + lidarPort + '_BAUD') : undefined;
  const baudVal = Math.round(baudParam?.value ?? 115);
  const baudKnown = SERIAL_BAUDS.some((o) => o.code === baudVal);

  // Sabit alan listesi; _CM (eski) ve metre (yeni) adları aynı etiketi paylaşır —
  // araçta VAR olan tercih edilir, hiçbiri yoksa ilki soluk gösterilir.
  const numFields: Array<[string, string, string?]> = [
    ['RNGFND1_MIN_CM', 'Min mesafe', 'cm'], ['RNGFND1_MAX_CM', 'Max mesafe', 'cm'],
    ['RNGFND1_MIN', 'Min mesafe', 'm'], ['RNGFND1_MAX', 'Max mesafe', 'm'],
    ['RNGFND1_GNDCLEAR', 'Yerdeki mesafe (gnd clear)', 'cm'],
    ['RNGFND1_ADDR', 'I2C adresi'], ['RNGFND1_PIN', 'Analog/PWM pini'],
    ['RNGFND1_SCALING', 'Ölçek (V→m)'], ['RNGFND1_OFFSET', 'Ofset (V)'],
    ['RNGFND1_POS_X', 'Konum X', 'm'], ['RNGFND1_POS_Y', 'Konum Y', 'm'], ['RNGFND1_POS_Z', 'Konum Z', 'm'],
  ];
  const byLabel = new Map<string, [string, string, string?]>();
  for (const f of numFields) {
    const cur = byLabel.get(f[1]);
    if (!cur || (!pget(cur[0]) && pget(f[0]))) byLabel.set(f[1], f);
  }
  const settingRows = [...byLabel.values()];

  // Lidar'ın etkilediği diğer sistemler — sabit liste, olmayan soluk
  const landing = pget('RNGFND_LANDING');       // Plane: inişte lidar
  const wpnavRfnd = pget('WPNAV_RFND_USE');     // Copter: oto görevlerde arazi takibi
  const surftrak = pget('SURFTRAK_MODE');       // Copter 4.5+: yüzey takibi modu
  const ekfHgt = pget('EK3_RNG_USE_HGT');       // EKF: menzilin %'si altında yükseklik kaynağı lidar (-1 kapalı)
  const ekfSpd = pget('EK3_RNG_USE_SPD');       // EKF: lidar kullanımı için azami yatay hız

  const pct = live && live.max > live.min ? Math.max(0, Math.min(100, ((live.dist - live.min) / (live.max - live.min)) * 100)) : 0;
  const anyMissing = !typeParam || !orientParam || settingRows.some(([n]) => !pget(n));

  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd"><h2>{t('Lidar / Mesafe Sensörü')}</h2>{!connected && <span className="hd-note">{t('bağlı değil')}</span>}</div>
        <div className="card-body rc-input">
          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Canlı okuma')} (DISTANCE_SENSOR)</div>
            {live ? (
              <>
                <div className="batt-live">
                  <span className="bl-item"><b>{live.dist.toFixed(2)}</b> m</span>
                  <span className="bl-item">{t('aralık')} <b>{live.min.toFixed(1)}–{live.max.toFixed(1)}</b> m</span>
                  {live.quality >= 0 && <span className="bl-item">{t('sinyal')} <b>{live.quality}</b>%</span>}
                </div>
                <div className="lidar-track"><div className="lidar-fill" style={{ width: pct + '%' }} /></div>
              </>
            ) : (
              <p className="setup-desc">{connected ? t('Veri yok — sensör tipi seçili ve bağlı mı?') : t('Canlı mesafe bağlantı ile gelir.')}</p>
            )}
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Sensör tipi')} (RNGFND1_TYPE)</div>
            <select disabled={!connected || !typeParam} value={typeParam ? typeVal : ''} onChange={(e) => write('RNGFND1_TYPE', Number(e.target.value))}>
              {!typeParam && <option value="">—</option>}
              {typeParam && !typeKnown && <option value={typeVal}>{typeVal} · {t('Bilinmeyen')}</option>}
              {RNGFND_TYPE.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
            </select>
            <p className="setup-desc">{t('Tip değişikliği yeniden başlatma gerektirir.')}</p>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Seri port (seri lidar için)')}</div>
            <div className="act-row">
              <select disabled={!connected || serialPorts.length === 0} value={lidarPort} onChange={(e) => setLidarPort(Number(e.target.value))}>
                <option value={-1}>{t('— port atanmadı —')}</option>
                {serialPorts.map((n) => {
                  const cur = Math.round(pget('SERIAL' + n + '_PROTOCOL')!.value);
                  return <option key={n} value={n}>SERIAL{n}{cur !== 9 ? ' (' + t('şu an') + ': ' + protoLabel(cur) + ')' : ' · Rangefinder ✓'}</option>;
                })}
              </select>
              <select disabled={!connected || !baudParam} value={baudParam ? baudVal : ''} onChange={(e) => write('SERIAL' + lidarPort + '_BAUD', Number(e.target.value))} aria-label="Baud">
                {!baudParam && <option value="">—</option>}
                {baudParam && !baudKnown && <option value={baudVal}>{baudVal}</option>}
                {SERIAL_BAUDS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </div>
            <p className="setup-desc">{t('Seçilen portun protokolü Rangefinder (9) yapılır; önceki lidar portu serbest bırakılır. Telemetri/GPS kullandığınız portu seçmeyin. Değişiklik yeniden başlatma gerektirir.')}</p>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Yönelim')} (RNGFND1_ORIENT)</div>
            <select disabled={!connected || !orientParam} value={orientParam ? orientVal : ''} onChange={(e) => write('RNGFND1_ORIENT', Number(e.target.value))}>
              {!orientParam && <option value="">—</option>}
              {orientParam && !orientKnown && <option value={orientVal}>{orientVal} · {t('Bilinmeyen')}</option>}
              {RNGFND_ORIENT.map((o) => <option key={o.code} value={o.code}>{o.code} · {t(o.label)}</option>)}
            </select>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Ayarlar')}</div>
            <div className="chk-grid">
              {settingRows.map(([name, label, unit]) => {
                const e = pget(name);
                return (
                  <label key={label} className={'chk plane-fp' + (e ? '' : ' missing')} title={name}>
                    <span>{t(label)}{unit ? ' (' + unit + ')' : ''}</span>
                    <input disabled={!connected || !e} value={e ? fmt(e.value) : ''} placeholder="—" onChange={(ev) => write(name, num(ev.target.value))} />
                  </label>
                );
              })}
            </div>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Lidar’ın kullanıldığı sistemler')}</div>
            <label className={'chk' + (landing ? '' : ' missing')} title="RNGFND_LANDING">
              <input type="checkbox" disabled={!connected || !landing} checked={!!landing && landing.value > 0} onChange={(e) => write('RNGFND_LANDING', e.target.checked ? 1 : 0)} />
              <span>{t('İnişte lidar kullan (RNGFND_LANDING) — alçalma/flare irtifası lidardan okunur')}</span>
            </label>
            <label className={'chk' + (wpnavRfnd ? '' : ' missing')} title="WPNAV_RFND_USE">
              <input type="checkbox" disabled={!connected || !wpnavRfnd} checked={!!wpnavRfnd && wpnavRfnd.value > 0} onChange={(e) => write('WPNAV_RFND_USE', e.target.checked ? 1 : 0)} />
              <span>{t('Oto görevlerde arazi takibi (WPNAV_RFND_USE) — waypoint irtifaları yüzeyden ölçülür')}</span>
            </label>
            <label className={'chk plane-fp' + (surftrak ? '' : ' missing')} title="SURFTRAK_MODE">
              <span>{t('Yüzey takibi (SURFTRAK_MODE)')}</span>
              <select disabled={!connected || !surftrak} value={surftrak ? Math.round(surftrak.value) : ''} onChange={(e) => write('SURFTRAK_MODE', Number(e.target.value))}>
                {!surftrak && <option value="">—</option>}
                <option value={0}>0 · {t('Kapalı')}</option>
                <option value={1}>1 · {t('Alttaki yüzeyi izle')}</option>
                <option value={2}>2 · {t('Üstteki tavanı izle')}</option>
              </select>
            </label>
            <label className={'chk plane-fp' + (ekfHgt ? '' : ' missing')} title="EK3_RNG_USE_HGT">
              <span>{t('EKF yükseklik kaynağı eşiği (menzilin %’si, -1 = kapalı)')}</span>
              <input disabled={!connected || !ekfHgt} value={ekfHgt ? fmt(ekfHgt.value) : ''} placeholder="—" onChange={(e) => write('EK3_RNG_USE_HGT', num(e.target.value))} />
            </label>
            <label className={'chk plane-fp' + (ekfSpd ? '' : ' missing')} title="EK3_RNG_USE_SPD">
              <span>{t('EKF lidar kullanımı için azami hız (m/s)')}</span>
              <input disabled={!connected || !ekfSpd} value={ekfSpd ? fmt(ekfSpd.value) : ''} placeholder="—" onChange={(e) => write('EK3_RNG_USE_SPD', num(e.target.value))} />
            </label>
            <p className="setup-desc">{t('EKF eşiği: alçak irtifa uçuşunda (menzilin altındayken) irtifa kaynağı olarak baro yerine lidar kullanılır — engebeli arazide dikkatli olun.')}</p>
          </section>

          {connected && anyMissing && (
            <ParamRefreshNote gcs={gcs} setParams={setParams}
              text={t('Yönelim ve ayar parametreleri henüz görünmüyor — sensör tipi etkinleştirildikten sonra RNGFND1_* parametreleri kart yeniden başlatılınca oluşur. Sonrasında parametreleri yeniden indirin.')} />
          )}

          <p className="setup-desc">{t('İkinci bir sensör için RNGFND2_ parametrelerini Parametreler sekmesinden ayarlayın.')}</p>
        </div>
      </div>
    </div>
  );
}
