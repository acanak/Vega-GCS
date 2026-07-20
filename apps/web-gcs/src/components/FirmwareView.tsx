import { useMemo, useRef, useState } from 'react';
import { parseApj, flashApj, flashImage, Px4Bootloader, parseIntelHex, requestDfuDevice, flashDfu } from '@wmp/flasher';
import type { SerialIO } from '@wmp/flasher';
import { openSerialIO } from '../gcs/serial-io';
import { useT } from '../gcs/i18n';

interface FwEntry { vehicle: string; board: string; board_id: number | null; rel: string; ver: string; url: string; sha: string; latest: number }

const BRIDGE = 'http://' + (typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost') + ':8080';
// Sürüm tipi sıralaması: kararlı önce
// rel örn. "STABLE-4.6.3" / "BETA" / "latest" / "DEV" — önek bazlı sırala (kararlı önce)
function relRank(rel: string): number {
  const r = rel.toUpperCase();
  if (r.startsWith('OFFICIAL')) return 0;
  if (r.startsWith('STABLE')) return 1;
  if (r.startsWith('BETA')) return 2;
  if (r.startsWith('LATEST')) return 3;
  if (r.startsWith('DEV')) return 4;
  return 9;
}
function relLabel(b: FwEntry): string {
  const base = b.rel.includes(b.ver) || !b.ver ? b.rel : b.rel + ' ' + b.ver;
  return base + (b.sha ? ' · ' + b.sha : '');
}

// 502 gövdesindeki {detail} varsa mesaja ekle
function errDetail(body: string): string {
  if (!body) return '';
  try { const d = (JSON.parse(body) as { detail?: string }).detail; return d ? ' — ' + d : ''; }
  catch { return ' — ' + body.slice(0, 200); }
}

// Ham ArduPilot manifest kaydını UI modeline indirge (köprüdeki reduceManifest ile eş)
interface RawFw { vehicletype?: string; platform?: string; board_id?: number; format?: string; url?: string; latest?: number;
  'mav-firmware-version-type'?: string; 'mav-firmware-version'?: string; 'mav-firmware-version-str'?: string; 'git-sha'?: string }
function reduceManifestClient(json: { firmware?: RawFw[] }): FwEntry[] {
  const arr = Array.isArray(json?.firmware) ? json.firmware : [];
  const out: FwEntry[] = [];
  for (const e of arr) {
    if (e.format !== 'apj') continue;
    out.push({
      vehicle: e.vehicletype || '', board: e.platform || '', board_id: e.board_id ?? null,
      rel: e['mav-firmware-version-type'] || '', ver: e['mav-firmware-version'] || e['mav-firmware-version-str'] || '',
      url: e.url || '', sha: (e['git-sha'] || '').slice(0, 8), latest: e.latest ? 1 : 0,
    });
  }
  return out;
}

// Tarayıcıdan doğrudan (sistem proxy'si üzerinden) manifest çek + gzip çöz
async function fetchManifestDirect(): Promise<FwEntry[]> {
  const r = await fetch('https://firmware.ardupilot.org/manifest.json.gz');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = new Uint8Array(await r.arrayBuffer());
  let text: string;
  if (buf[0] === 0x1f && buf[1] === 0x8b) { // gzip sihirli baytları — tarayıcıda çöz
    const DS = (globalThis as unknown as { DecompressionStream?: new (f: string) => ReadableWritablePair }).DecompressionStream;
    if (!DS) throw new Error('DecompressionStream desteklenmiyor');
    text = await new Response(new Blob([buf]).stream().pipeThrough(new DS('gzip'))).text();
  } else {
    text = new TextDecoder().decode(buf); // tarayıcı zaten açmış (Content-Encoding)
  }
  return reduceManifestClient(JSON.parse(text) as { firmware?: RawFw[] });
}

export function FirmwareView() {
  const t = useT();
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dfuFileRef = useRef<HTMLInputElement | null>(null);
  const [dfuFile, setDfuFile] = useState<File | null>(null);
  const ioRef = useRef<{ io: SerialIO; close: () => Promise<void> } | null>(null);
  const addLog = (m: string): void => setLog((l) => [...l, m].slice(-140));

  // ---- ArduPilot indirme ----
  const [mf, setMf] = useState<FwEntry[] | null>(null);
  const [mfBusy, setMfBusy] = useState(false);
  const [mfErr, setMfErr] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState('');
  const [board, setBoard] = useState('');
  const [fwUrl, setFwUrl] = useState('');

  const vehicles = useMemo(() => {
    if (!mf) return [];
    return [...new Set(mf.map((e) => e.vehicle).filter(Boolean))].sort();
  }, [mf]);
  const boards = useMemo(() => {
    if (!mf || !vehicle) return [];
    return [...new Set(mf.filter((e) => e.vehicle === vehicle).map((e) => e.board).filter(Boolean))].sort();
  }, [mf, vehicle]);
  const builds = useMemo(() => {
    if (!mf || !vehicle || !board) return [];
    return mf.filter((e) => e.vehicle === vehicle && e.board === board)
      .sort((a, b) => relRank(a.rel) - relRank(b.rel) || b.ver.localeCompare(a.ver, undefined, { numeric: true }));
  }, [mf, vehicle, board]);

  const loadManifest = async (): Promise<void> => {
    setMfBusy(true); setMfErr(null);
    try {
      let list: FwEntry[];
      try {
        // 1) Köprü proxy'si (SITL/geliştirme; köprünün internete çıkışı gerekir)
        const r = await fetch(BRIDGE + '/fw/manifest');
        if (!r.ok) throw new Error('HTTP ' + r.status + errDetail(await r.text().catch(() => '')));
        list = (await r.json() as { list: FwEntry[] }).list;
        addLog(t('Manifest yüklendi:') + ' ' + list.length + ' ' + t('yapı') + ' (' + t('köprü') + ')');
      } catch (eBridge) {
        // 2) Tarayıcıdan doğrudan (kurumsal proxy'de köprü çıkamayabilir; tarayıcı sistem proxy'sini kullanır)
        addLog(t('Köprü üzerinden alınamadı, tarayıcıdan deneniyor…') + ' (' + (eBridge instanceof Error ? eBridge.message : String(eBridge)) + ')');
        list = await fetchManifestDirect();
        addLog(t('Manifest yüklendi:') + ' ' + list.length + ' ' + t('yapı') + ' (' + t('tarayıcı') + ')');
      }
      setMf(list);
    } catch (e) {
      setMfErr(t('Manifest alınamadı:') + ' ' + (e instanceof Error ? e.message : String(e)));
    } finally { setMfBusy(false); }
  };

  const connect = async (): Promise<void> => {
    setLog([]); setInfo(null);
    try {
      const s = await openSerialIO(115200);
      ioRef.current = s;
      addLog(t('Port açıldı, senkronize ediliyor…'));
      const bl = new Px4Bootloader(s.io);
      await bl.sync();
      const bi = await bl.getInfo();
      setInfo(t('Kart') + ' ' + bi.boardId + ' · BL rev ' + bi.blRev + ' · ' + Math.floor(bi.flashSize / 1024) + ' KB');
      setConnected(true);
      addLog(t('Bağlandı: kart') + ' ' + bi.boardId);
    } catch (e) {
      addLog(t('Hata:') + ' ' + (e instanceof Error ? e.message : String(e)));
      await disconnect();
    }
  };
  const disconnect = async (): Promise<void> => {
    await ioRef.current?.close();
    ioRef.current = null;
    setConnected(false);
  };

  const flashSerial = async (bytes: Uint8Array, isApj: boolean, apjText?: string): Promise<void> => {
    const s = ioRef.current;
    if (!s) { addLog(t('Önce bootloader\'a bağlanın')); return; }
    setBusy(true); setProgress({ done: 0, total: 1 });
    try {
      if (isApj && apjText != null) {
        const apj = await parseApj(apjText);
        await flashApj(s.io, apj, (done, total) => setProgress({ done, total }), addLog);
      } else {
        addLog(t('⚠ Ham .bin — kart uyumu kontrol edilmez, doğru firmware olduğundan emin olun'));
        await flashImage(s.io, bytes, (done, total) => setProgress({ done, total }), addLog);
      }
      addLog(t('Tamamlandı') + ' ✓');
    } catch (e) {
      addLog(t('Flash hatası:') + ' ' + (e instanceof Error ? e.message : String(e)));
    } finally { setBusy(false); setProgress(null); }
  };

  const flashFile = async (file: File): Promise<void> => {
    addLog(file.name + ' ' + t('çözülüyor…'));
    if (/\.apj$/i.test(file.name)) await flashSerial(new Uint8Array(), true, await file.text());
    else await flashSerial(new Uint8Array(await file.arrayBuffer()), false);
  };

  const downloadAndFlash = async (): Promise<void> => {
    if (!fwUrl) { addLog(t('Önce bir yapı seçin')); return; }
    if (!ioRef.current) { addLog(t('Önce bootloader\'a bağlanın')); return; }
    setBusy(true); setProgress({ done: 0, total: 1 });
    try {
      addLog(t('İndiriliyor:') + ' ' + fwUrl.split('/').pop());
      let text: string;
      try {
        const r = await fetch(BRIDGE + '/fw/download?url=' + encodeURIComponent(fwUrl));
        if (!r.ok) throw new Error('HTTP ' + r.status + errDetail(await r.text().catch(() => '')));
        text = await r.text();
      } catch (eBridge) {
        addLog(t('Köprü üzerinden alınamadı, tarayıcıdan deneniyor…') + ' (' + (eBridge instanceof Error ? eBridge.message : String(eBridge)) + ')');
        const rd = await fetch(fwUrl);
        if (!rd.ok) throw new Error('HTTP ' + rd.status);
        text = await rd.text();
      }
      setBusy(false);
      await flashSerial(new Uint8Array(), true, text);
    } catch (e) {
      addLog(t('İndirme hatası:') + ' ' + (e instanceof Error ? e.message : String(e)));
      setBusy(false); setProgress(null);
    }
  };

  // ---- DFU (WebUSB) ----
  // WebUSB requestDevice() yalnızca aktif kullanıcı hareketi (tık) içinde, herhangi bir
  // await'ten ÖNCE çağrılabilir. Bu yüzden akış iki adım: (1) dosya seç, (2) tıkla cihaz seç+yaz.
  const dfuWrite = async (): Promise<void> => {
    const file = dfuFile;
    if (!file) { addLog(t('Önce bir DFU dosyası seçin')); return; }
    // İlk iş: cihaz seçtir (bundan önce await YOK — kullanıcı hareketi bozulmasın).
    let dev;
    try {
      dev = await requestDfuDevice();
    } catch (e) {
      addLog(t('DFU hatası:') + ' ' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    addLog(t('DFU cihazı seçildi') + (dev.productName ? ' · ' + dev.productName : ''));
    setBusy(true); setProgress({ done: 0, total: 1 });
    try {
      let image: Uint8Array;
      let base = 0x08000000;
      if (/\.hex$/i.test(file.name)) {
        const h = parseIntelHex(await file.text());
        image = h.data; base = h.base;
        addLog('HEX ' + file.name + ' → 0x' + base.toString(16) + ' (' + Math.round(image.length / 1024) + ' KB)');
      } else {
        image = new Uint8Array(await file.arrayBuffer());
        addLog('DFU .bin ' + file.name + ' → 0x08000000 (' + Math.round(image.length / 1024) + ' KB)');
      }
      let lastDecile = 0;
      await flashDfu(dev, image, {
        address: base,
        t,
        onProgress: (done, total) => {
          setProgress({ done, total });
          const d = Math.floor((done / Math.max(1, total)) * 10);
          if (d > lastDecile) { lastDecile = d; addLog(t('Yazılıyor…') + ' ' + d * 10 + '% (' + Math.round(done / 1024) + '/' + Math.round(total / 1024) + ' KB)'); }
        },
        onLog: addLog,
      });
      addLog(t('DFU tamamlandı') + ' ✓');
    } catch (e) {
      addLog(t('DFU hatası:') + ' ' + (e instanceof Error ? e.message : String(e)));
    } finally { setBusy(false); setProgress(null); }
  };

  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  return (
    <div className="setup-panel">
      {/* 1) Seri bootloader (WebSerial) */}
      <div className="card">
        <div className="card-hd"><h2>{t('Firmware kurulum · Seri (WebSerial)')}</h2></div>
        <div className="card-body setup-body">
          <p className="setup-desc">{t('Otopilotu')} <b>{t('bootloader modunda')}</b> {t('USB ile bağlayın (yalnızca Chromium/Edge). Bağlanın, ardından bir')} <b>.apj/.bin</b> {t('firmware dosyası seçin ya da aşağıdan ArduPilot\'tan indirin. Bu ekran MAVLink bağlantısından ayrıdır.')}</p>
          <div className="setup-actions">
            {connected
              ? <button className="btn-disarm" disabled={busy} onClick={() => void disconnect()}>{t('Bağlantıyı kes')}</button>
              : <button className="btn-primary" onClick={() => void connect()}>{t("Bootloader'a bağlan (WebSerial)")}</button>}
            <button className="btn-ghost" disabled={!connected || busy} onClick={() => fileRef.current?.click()}>{t('Dosyadan flaşla (.apj / .bin)')}</button>
            <input ref={fileRef} type="file" accept=".apj,.bin" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void flashFile(f); e.target.value = ''; }} />
          </div>
          {info && <div className="setup-result ok">{info}</div>}

          {/* ArduPilot'tan indir */}
          <div className="fw-sub">
            <div className="fw-sub-hd">{t('ArduPilot\'tan indir')}</div>
            {!mf
              ? <button className="btn-ghost" disabled={mfBusy} onClick={() => void loadManifest()}>{mfBusy ? t('Yükleniyor…') : t('Firmware listesini yükle')}</button>
              : <div className="fw-dl">
                  <label>{t('Araç')}
                    <select value={vehicle} onChange={(e) => { setVehicle(e.target.value); setBoard(''); setFwUrl(''); }}>
                      <option value="">—</option>
                      {vehicles.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>
                  <label>{t('Kart')}
                    <select value={board} disabled={!vehicle} onChange={(e) => { setBoard(e.target.value); setFwUrl(''); }}>
                      <option value="">—</option>
                      {boards.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                  <label>{t('Sürüm')}
                    <select value={fwUrl} disabled={!board} onChange={(e) => setFwUrl(e.target.value)}>
                      <option value="">—</option>
                      {builds.map((b) => <option key={b.url} value={b.url}>{relLabel(b)}</option>)}
                    </select>
                  </label>
                  <button className="btn-primary" disabled={!fwUrl || !connected || busy} onClick={() => void downloadAndFlash()}>{t('İndir ve flaşla')}</button>
                </div>}
            {mfErr && <div className="setup-result err">{mfErr}</div>}
            {mf && !connected && <div className="setup-desc">{t('İndirip flaşlamak için önce bootloader\'a bağlanın.')}</div>}
          </div>

          {progress && <div className="fw-bar"><div className="fw-fill" style={{ width: pct + '%' }} /><span>{pct}%</span></div>}
        </div>
      </div>

      {/* 2) DFU (WebUSB) */}
      <div className="card">
        <div className="card-hd"><h2>{t('Firmware kurulum · DFU (WebUSB)')}</h2></div>
        <div className="card-body setup-body">
          <p className="setup-desc">
            {t('Bootloader bozuksa ya da BOOT0 ile karta DFU modunda erişiliyorsa STM32 DFU üzerinden yazın. Ham')} <b>.bin</b> {t('veya')} <b>.hex</b> {t('imajı seçin — imaj 0x08000000\'a yazılır (dosya adı önemli değil, cihaz DFU modunda olmalı).')}
            {' '}<b>{t('Windows:')}</b> {t('DFU aygıtı için WinUSB sürücüsü (Zadig) gerekebilir. macOS/Linux genelde hazırdır. Deneyseldir.')}
          </p>
          <div className="setup-actions">
            <button className="btn-ghost" disabled={busy} onClick={() => dfuFileRef.current?.click()}>{t('DFU dosyası seç (.bin / .hex)')}</button>
            <button className="btn-primary" disabled={!dfuFile || busy} onClick={() => void dfuWrite()}>{t('DFU cihazı seç ve yaz')}</button>
            <input ref={dfuFileRef} type="file" accept=".bin,.hex" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setDfuFile(f); addLog(t('DFU dosyası seçildi:') + ' ' + f.name); } e.target.value = ''; }} />
          </div>
          {dfuFile && <div className="setup-result ok">{t('Seçili dosya:')} {dfuFile.name}</div>}
          {progress && <div className="fw-bar"><div className="fw-fill" style={{ width: pct + '%' }} /><span>{pct}%</span></div>}
        </div>
      </div>

      {/* Günlük */}
      <div className="card">
        <div className="card-body">
          <div className="setup-log">
            <div className="setup-log-hd">{t('Günlük')}</div>
            {log.length === 0 && <div className="empty">—</div>}
            {log.map((m, i) => <div key={i} className="setup-log-line">{m}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
