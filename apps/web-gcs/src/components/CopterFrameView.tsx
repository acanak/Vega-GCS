import { useState } from 'react';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';
import { ParamRefreshNote } from './ParamRefresh';

// ---------------------------------------------------------------------------
// Kopter çerçeve kurulumu: FRAME_CLASS/FRAME_TYPE seçimi, motor testi ve ESC
// kalibrasyonu. Mission Planner karşılığı: Initial Setup → Frame Type + Motor Test.
// ---------------------------------------------------------------------------

const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// MAV_CMD_DO_MOTOR_TEST — p1: motor no (1 tabanlı, test sırası), p2: gaz tipi
// (0=%), p3: gaz değeri, p4: süre sn, p5: motor sayısı (0=tek), p6: sıra (1=ardışık)
const MAV_CMD_DO_MOTOR_TEST = 209;

// FRAME_CLASS seçenekleri (yaygın çok-rotorlular; heli ayrı ekran ister, v2)
const FRAME_CLASSES: ReadonlyArray<{ code: number; name: string; desc: string; motors: number }> = [
  { code: 1, name: 'Quad', desc: '4 motor', motors: 4 },
  { code: 2, name: 'Hexa', desc: '6 motor', motors: 6 },
  { code: 3, name: 'Octa', desc: '8 motor', motors: 8 },
  { code: 4, name: 'OctaQuad', desc: '8 motor · 4 kol koaksiyel', motors: 8 },
  { code: 5, name: 'Y6', desc: '6 motor · 3 kol koaksiyel', motors: 6 },
  { code: 7, name: 'Tri', desc: '3 motor + yaw servosu', motors: 3 },
  { code: 12, name: 'DodecaHexa', desc: '12 motor · 6 kol koaksiyel', motors: 12 },
  { code: 14, name: 'Deca', desc: '10 motor', motors: 10 },
];

// FRAME_TYPE seçenekleri ve sınıf başına geçerli olanlar (ArduPilot AP_Motors matrisi)
const FRAME_TYPES: ReadonlyArray<{ code: number; name: string }> = [
  { code: 0, name: 'Plus (+)' }, { code: 1, name: 'X' }, { code: 2, name: 'V' }, { code: 3, name: 'H' },
  { code: 4, name: 'V-Tail' }, { code: 5, name: 'A-Tail' }, { code: 10, name: 'Y6B' }, { code: 11, name: 'Y6F' },
  { code: 12, name: 'BetaFlight X' }, { code: 13, name: 'DJI X' }, { code: 14, name: 'Saat yönü X' },
];
const VALID_TYPES: Readonly<Record<number, readonly number[]>> = {
  1: [0, 1, 2, 3, 4, 5, 12, 13, 14], // Quad
  2: [0, 1, 3],                      // Hexa
  3: [0, 1, 2, 3],                   // Octa
  4: [0, 1, 2, 3],                   // OctaQuad
  5: [10, 11],                       // Y6 (Y6B önerilir)
  7: [0],                            // Tri (tip yok sayılır)
  12: [0, 1],                        // DodecaHexa
  14: [0, 1, 14],                    // Deca
};

export function CopterFrameView({ gcs, params, setParams, telemetry }: {
  gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void; telemetry: VehicleTelemetry | null;
}) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const armed = !!telemetry?.armed;
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  const pval = (n: string, d = 0): number => pget(n)?.value ?? d;

  const write = (name: string, value: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, value, e?.type ?? 6);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };

  const hasFrame = !!pget('FRAME_CLASS');
  const fclass = Math.round(pval('FRAME_CLASS', 1));
  const ftype = Math.round(pval('FRAME_TYPE', 1));
  const classInfo = FRAME_CLASSES.find((c) => c.code === fclass);
  const validTypes = VALID_TYPES[fclass] ?? [0, 1];
  const motorCount = classInfo?.motors ?? 4;

  // --- Motor testi durumu ---
  const [propsOff, setPropsOff] = useState(false); // güvenlik onayı: pervaneler söküldü
  const [throttle, setThrottle] = useState(8);     // % gaz
  const [duration, setDuration] = useState(2);     // sn
  const canTest = connected && propsOff && !armed;

  const testMotor = (idx1: number): void => {
    // Test sırası (A=1, B=2…): ArduPilot motor test sıralaması saat yönünde ön-sağdan başlar
    gcs.connRef.current?.commandLong(MAV_CMD_DO_MOTOR_TEST, [idx1, 0, throttle, duration, 0, 0, 0]);
  };
  const testAllSequence = (): void => {
    // p5=motor sayısı: 1. motordan başlayarak sırayla tümünü test et
    gcs.connRef.current?.commandLong(MAV_CMD_DO_MOTOR_TEST, [1, 0, throttle, duration, motorCount, 0, 0]);
  };
  const stopAll = (): void => {
    // gaz %0 + süre 0 → testi keser
    gcs.connRef.current?.commandLong(MAV_CMD_DO_MOTOR_TEST, [1, 0, 0, 0, motorCount, 0, 0]);
  };

  const motorLetters = Array.from({ length: motorCount }, (_, i) => String.fromCharCode(65 + i)); // A, B, C…

  return (
    <div className="setup-panel setup-wide">
      <div className="card">
        <div className="card-hd"><h2>{t('Çerçeve — kopter tipi ve motor düzeni')}</h2><span className="params-spacer" />{!connected && <span className="hd-note">{t('bağlı değil')}</span>}</div>
        <div className="card-body rc-input">
          {!hasFrame ? (
            <div className="empty">{t('FRAME_CLASS parametresi yok — Parametreler sekmesinden indirin')}<ParamRefreshNote gcs={gcs} setParams={setParams} text={t('Parametreleri yenile')} /></div>
          ) : (
            <>
              <section className="rc-sec">
                <div className="rc-sec-hd">{t('Çerçeve sınıfı (FRAME_CLASS)')}</div>
                <div className="plane-types">
                  {FRAME_CLASSES.map((c) => (
                    <button key={c.code} className={'plane-type' + (fclass === c.code ? ' active' : '')} disabled={!connected}
                      onClick={() => {
                        write('FRAME_CLASS', c.code);
                        // yeni sınıfta mevcut tip geçersizse ilk geçerli tipe geç
                        const valid = VALID_TYPES[c.code] ?? [0, 1];
                        if (!valid.includes(ftype)) write('FRAME_TYPE', valid[0]!);
                      }}>
                      <span className="pt-name">{c.name}</span>
                      <span className="pt-desc">{t(c.desc)}</span>
                    </button>
                  ))}
                </div>
                <p className="setup-desc">{t('FRAME_CLASS değişikliği yeniden başlatma gerektirir. Geleneksel helikopter için ayrı firmware (Heli) kullanılır.')}</p>
              </section>

              {validTypes.length > 1 && (
                <section className="rc-sec">
                  <div className="rc-sec-hd">{t('Çerçeve tipi (FRAME_TYPE)')}</div>
                  <div className="plane-types">
                    {FRAME_TYPES.filter((ty) => validTypes.includes(ty.code)).map((ty) => (
                      <button key={ty.code} className={'plane-type' + (ftype === ty.code ? ' active' : '')} disabled={!connected}
                        onClick={() => write('FRAME_TYPE', ty.code)}>
                        <span className="pt-name">{ty.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="rc-sec">
                <div className="rc-sec-hd">{t('Motor testi')}</div>
                <p className="setup-desc">{t('Motorları tek tek düşük gazda döndürüp sıra ve yön kontrolü yapın. Test sırası (A, B, C…) ön-sağ motordan saat yönünde ilerler — kol numarasıyla aynı olmak zorunda değildir.')}</p>
                <label className="chk">
                  <input type="checkbox" checked={propsOff} onChange={(e) => setPropsOff(e.target.checked)} />
                  <span>{t('Pervaneleri söktüm / araç sabitlenmiş durumda')}</span>
                </label>
                {armed && <p className="setup-desc" style={{ color: 'var(--warn)' }}>{t('Araç ARM durumda — motor testi için önce disarm edin.')}</p>}
                <div className="chk-grid" style={{ marginTop: 8 }}>
                  <label className="chk plane-fp">
                    <span>{t('Gaz (%)')}</span>
                    <input disabled={!canTest} value={throttle} onChange={(e) => setThrottle(Math.max(0, Math.min(100, num(e.target.value))))} />
                  </label>
                  <label className="chk plane-fp">
                    <span>{t('Süre (sn)')}</span>
                    <input disabled={!canTest} value={duration} onChange={(e) => setDuration(Math.max(0, Math.min(60, num(e.target.value))))} />
                  </label>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {motorLetters.map((L, i) => (
                    <button key={L} disabled={!canTest} onClick={() => testMotor(i + 1)}>{t('Motor')} {L}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button disabled={!canTest} onClick={testAllSequence}>{t('Sırayla tümü')}</button>
                  <button disabled={!connected} onClick={stopAll}>{t('Durdur')}</button>
                </div>
              </section>

              {(pget('MOT_SPIN_ARM') || pget('MOT_SPIN_MIN')) && (
                <section className="rc-sec">
                  <div className="rc-sec-hd">{t('Motor dönüş eşikleri')}</div>
                  <div className="chk-grid">
                    {pget('MOT_SPIN_ARM') && (
                      <label className="chk plane-fp">
                        <span>MOT_SPIN_ARM</span>
                        <input disabled={!connected} value={pval('MOT_SPIN_ARM')} onChange={(e) => write('MOT_SPIN_ARM', num(e.target.value))} />
                      </label>
                    )}
                    {pget('MOT_SPIN_MIN') && (
                      <label className="chk plane-fp">
                        <span>MOT_SPIN_MIN</span>
                        <input disabled={!connected} value={pval('MOT_SPIN_MIN')} onChange={(e) => write('MOT_SPIN_MIN', num(e.target.value))} />
                      </label>
                    )}
                  </div>
                  <p className="setup-desc">{t('SPIN_ARM: arm edilince motorların döndüğü gaz; SPIN_MIN: uçuşta izin verilen en düşük gaz. Motor testinde motorun güvenle döndüğü en düşük değeri bulup SPIN_ARM’a yazın (tipik 0.05–0.12).')}</p>
                </section>
              )}

              {pget('ESC_CALIBRATION') && (
                <section className="rc-sec">
                  <div className="rc-sec-hd">{t('ESC kalibrasyonu')}</div>
                  <p className="setup-desc">{t('Tüm ESC’lere aynı PWM aralığını öğretir (yalnızca PWM/OneShot ESC’ler; DShot gerektirmez). Adımlar: pervaneleri sökün → aşağıdaki düğmeyle işaretleyin → bataryayı söküp takın → ESC’ler kalibrasyon melodisini çalınca gaz uçlarını bekleyin → tamamlanınca parametre otomatik sıfırlanır.')}</p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button disabled={!connected || armed || !propsOff} onClick={() => write('ESC_CALIBRATION', 3)}>{t('Sonraki açılışta ESC kalibrasyonu yap')}</button>
                    <span className="p-units">ESC_CALIBRATION = {Math.round(pval('ESC_CALIBRATION'))}</span>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
