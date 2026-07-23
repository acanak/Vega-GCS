import { useEffect, useRef, useState } from 'react';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import { vehicleModeIds, modeName, quickModes } from '@wmp/protocol';
import type { GcsConnection } from '../gcs/protocol-shared';
import type { StatusTextEntry } from '../gcs/useGcs';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';
import { useSettings } from '../gcs/settings';
import { llmActive, llmLabel, chatDirect } from '../gcs/llm-client';

const CMD_NAV_TAKEOFF = 22;
const CMD_DO_CHANGE_SPEED = 178;

interface FeedItem { id: number; role: 'user' | 'bot' | 'sys'; text: string; n?: number }

interface Ctx {
  conn: GcsConnection | null;
  tele: VehicleTelemetry | null;
  params: ParamEntry[];
  setParams: (p: ParamEntry[]) => void;
  vtype: number;
}

// Yardım metni araç tipine göre örnek modlar içerir (kopter: LAND, uçak: FBWA vb.).
const helpText = (vtype: number): string =>
  'Komutlar — Eylem: arm · disarm · mod <ad> (ör. mod RTL) · kalkış <m> · hız <m/s> · ' + quickModes(vtype).join('/') + '. ' +
  'Ayar: set <PARAM> <değer> · get <PARAM>. ' +
  'Bilgi: batarya · irtifa · hız · mod · gps · konum · durum.';

// Deterministik komut yorumlayici (guvenli; LLM degil). Bir metni cozer, cevap dizesi dondurur.
function interpret(raw: string, ctx: Ctx): string {
  const s = raw.trim().toLowerCase();
  if (!s) return '';
  const T = ctx.tele;
  const has = (...w: string[]): boolean => w.some((x) => s.includes(x));
  const q = s.includes('?') || /\b(mı|mi|mu|mü|nedir|kaç|ne kadar|what|how)\b/.test(s);
  const f1 = (v: number): string => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) : '—');

  if (has('yardım', 'yardim', 'help', 'komut')) return helpText(ctx.vtype);

  // ---- Bilgi sorgulari (soru ise ya da net anahtar) ----
  const info = (): string | null => {
    if (!T) return 'Telemetri yok (bağlı değil).';
    if (has('batarya', 'pil', 'voltaj', 'battery', 'volt'))
      return `Batarya: ${f1(T.battery.voltage)} V${T.battery.remaining >= 0 ? ' · %' + T.battery.remaining : ''}${T.battery.current >= 0 ? ' · ' + f1(T.battery.current) + ' A' : ''}`;
    if (has('irtifa', 'yükseklik', 'yukseklik', 'altitude', 'height'))
      return `İrtifa: ${f1(T.position.relativeAlt)} m (rel)`;
    if (has('hava hız', 'airspeed')) return `Hava hızı: ${f1(T.vfr.airspeed)} m/s`;
    if (has('hız', 'hiz', 'speed', 'sürat')) return `Yer hızı ${f1(T.vfr.groundspeed)} · hava hızı ${f1(T.vfr.airspeed)} m/s`;
    if (has('gps', 'uydu', 'sat')) return `GPS fix ${T.gps.fixType} · ${T.gps.satellites} uydu`;
    if (has('konum', 'nerede', 'position', 'where', 'koordinat'))
      return Number.isFinite(T.position.lat) ? `Konum: ${T.position.lat.toFixed(6)}, ${T.position.lon.toFixed(6)}` : 'Konum bilgisi yok.';
    if (has('durum', 'özet', 'ozet', 'status', 'summary'))
      return `${modeName(ctx.vtype, T.customMode)} · ${T.armed ? 'ARMED' : 'DISARMED'} · ${f1(T.battery.voltage)}V · GS ${f1(T.vfr.groundspeed)} · Alt ${f1(T.position.relativeAlt)}m · ${T.gps.satellites} sat`;
    if (has('mod', 'mode')) return `Mod: ${modeName(ctx.vtype, T.customMode)} · ${T.armed ? 'ARMED' : 'DISARMED'}`;
    if (has('arm')) return T.armed ? 'ARMED' : 'DISARMED';
    return null;
  };
  if (q) { const r = info(); if (r) return r; }

  // ---- get PARAM ----
  const gm = raw.match(/(?:get|oku|göster|goster)\s+([A-Za-z][A-Za-z0-9_]{2,})/i) || raw.match(/^\s*([A-Z][A-Z0-9_]{2,})\s*\?\s*$/);
  if (gm) {
    const name = gm[1]!.toUpperCase();
    const e = ctx.params.find((p) => p.name === name);
    return e ? `${name} = ${e.value}` : `${name} bulunamadı (parametreleri indirdiniz mi?)`;
  }

  // ---- set PARAM VALUE ----
  const sm = raw.match(/(?:set|ayarla)\s+([A-Za-z][A-Za-z0-9_]{2,})\s*[=:\s]\s*(-?\d+(?:\.\d+)?)/i);
  if (sm) {
    const name = sm[1]!.toUpperCase();
    const val = parseFloat(sm[2]!);
    if (!ctx.conn) return 'Bağlı değil — parametre yazılamadı.';
    const e = ctx.params.find((p) => p.name === name);
    const type = e?.type ?? 9;
    ctx.conn.setParam(name, val, type).catch(() => {});
    if (e) ctx.setParams(ctx.params.map((p) => (p.name === name ? { ...p, value: val } : p)));
    return `${name} = ${val} yazıldı.`;
  }

  // ---- Eylemler (soru degilse) ----
  if (!q) {
    if (/\bdisarm\b|güvenli|guvenli|disar/.test(s)) {
      if (!ctx.conn) return 'Bağlı değil.';
      void ctx.conn.disarm(s.includes('force') || s.includes('zorla'));
      return 'DISARM komutu gönderildi.';
    }
    if (/(^|\s)(arm)(\s|$)|arm et|kurdur/.test(s)) {
      if (!ctx.conn) return 'Bağlı değil.';
      void ctx.conn.arm(s.includes('force') || s.includes('zorla'));
      return 'ARM komutu gönderildi.';
    }
    const tk = s.match(/(kalk\w*|takeoff|kalkis)\D*(\d+)/);
    if (tk) {
      if (!ctx.conn) return 'Bağlı değil.';
      const alt = parseInt(tk[2]!, 10);
      const ids = vehicleModeIds(ctx.vtype);
      const g = ids.GUIDED ?? ids.AUTO ?? 4;
      void ctx.conn.setMode(g); void ctx.conn.arm();
      const c = ctx.conn;
      window.setTimeout(() => c.commandLong(CMD_NAV_TAKEOFF, [0, 0, 0, 0, 0, 0, alt]), 1200);
      return `Kalkış: GUIDED + ARM + ${alt} m.`;
    }
    const sp = s.match(/(hız|hiz|speed)\D*(\d+)/);
    if (sp) {
      if (!ctx.conn) return 'Bağlı değil.';
      const v = parseInt(sp[2]!, 10);
      ctx.conn.commandLong(CMD_DO_CHANGE_SPEED, [1, v, -1, 0, 0, 0, 0]);
      return `Hız → ${v} m/s.`;
    }
    const ids = vehicleModeIds(ctx.vtype);
    const md = s.match(/\b(?:mod|mode)\s+([a-z0-9_]+)/);
    if (md) {
      const name = md[1]!.toUpperCase();
      if (ids[name] !== undefined) { void ctx.conn?.setMode(ids[name]!); return `Mod → ${name}.`; }
      return `Bilinmeyen mod: ${name}.`;
    }
    // dogrudan mod adi (RTL, LOITER, AUTO, FBWA...)
    for (const nm of Object.keys(ids)) {
      if (new RegExp('(^|\\s)' + nm.toLowerCase() + '(\\s|$)').test(s)) {
        void ctx.conn?.setMode(ids[nm]!);
        return `Mod → ${nm}.`;
      }
    }
  }

  // soru degilse ama bilgi anahtari varsa yine cevapla
  const r = info();
  if (r) return r;
  return `Anlamadım: “${raw.trim()}”. 'yardım' yazın.`;
}

// Asistan proxy (kopru). ANTHROPIC_API_KEY köprüde varsa LLM aktif, yoksa yerel moda düşer.
const PROXY = (typeof localStorage !== 'undefined' && localStorage.getItem('wmp-chat-url')) ||
  ('http://' + (typeof location !== 'undefined' ? location.hostname : 'localhost') + ':8080/chat');

// LLM'in döndürdüğü yapılandırılmış komutu tarayıcıda (deterministik) çalıştırır.
function executeCommand(cmd: { type?: string; [k: string]: unknown }, ctx: Ctx): string {
  const c = ctx.conn;
  const type = String(cmd.type ?? '');
  if (type === 'arm') { if (!c) return 'Bağlı değil.'; void c.arm(!!cmd.force); return 'ARM komutu gönderildi.'; }
  if (type === 'disarm') { if (!c) return 'Bağlı değil.'; void c.disarm(!!cmd.force); return 'DISARM komutu gönderildi.'; }
  if (type === 'mode') { const ids = vehicleModeIds(ctx.vtype); const n = String(cmd.name ?? '').toUpperCase(); if (ids[n] !== undefined) { void c?.setMode(ids[n]!); return `Mod → ${n}.`; } return `Bilinmeyen mod: ${n}.`; }
  if (type === 'takeoff') { if (!c) return 'Bağlı değil.'; const alt = Number(cmd.alt) || 10; const ids = vehicleModeIds(ctx.vtype); void c.setMode(ids.GUIDED ?? ids.AUTO ?? 4); void c.arm(); window.setTimeout(() => c.commandLong(CMD_NAV_TAKEOFF, [0, 0, 0, 0, 0, 0, alt]), 1200); return `Kalkış: GUIDED + ARM + ${alt} m.`; }
  if (type === 'speed') { if (!c) return 'Bağlı değil.'; const v = Number(cmd.value) || 0; c.commandLong(CMD_DO_CHANGE_SPEED, [1, v, -1, 0, 0, 0, 0]); return `Hız → ${v} m/s.`; }
  if (type === 'setParam') { if (!c) return 'Bağlı değil.'; const name = String(cmd.name ?? '').toUpperCase(); const val = Number(cmd.value); if (!name || !Number.isFinite(val)) return 'Geçersiz parametre.'; const e = ctx.params.find((p) => p.name === name); c.setParam(name, val, e?.type ?? 9).catch(() => {}); if (e) ctx.setParams(ctx.params.map((p) => (p.name === name ? { ...p, value: val } : p))); return `${name} = ${val} yazıldı.`; }
  if (type === 'getParam') { const name = String(cmd.name ?? '').toUpperCase(); const e = ctx.params.find((p) => p.name === name); return e ? `${name} = ${e.value}` : `${name} bulunamadı.`; }
  return 'Bilinmeyen komut.';
}

function buildContext(ctx: Ctx): string {
  const T = ctx.tele;
  const caps = `Parametreler get/set edilebilir (param_sayisi=${ctx.params.length}).`;
  if (!T) return 'Araç bağlı değil, telemetri yok. ' + caps;
  return [
    `mod=${modeName(ctx.vtype, T.customMode)}`, `armed=${T.armed}`,
    `batarya=${T.battery.voltage.toFixed(2)}V`, `kalan=%${T.battery.remaining}`, `akim=${T.battery.current}A`,
    `yer_hizi=${T.vfr.groundspeed.toFixed(1)}m/s`, `hava_hizi=${T.vfr.airspeed.toFixed(1)}m/s`,
    `irtifa_rel=${T.position.relativeAlt.toFixed(1)}m`, `tirmanma=${T.vfr.climb.toFixed(1)}m/s`, `gaz=%${Math.round(T.vfr.throttle)}`,
    `gps_fix=${T.gps.fixType}`, `uydu=${T.gps.satellites}`,
    Number.isFinite(T.position.lat) ? `konum=${T.position.lat.toFixed(6)},${T.position.lon.toFixed(6)}` : 'konum=yok',
  ].join(' ') + ' ' + caps;
}

export function ChatPanel({ gcs, telemetry, params, setParams, injectRef }: {
  gcs: UseGcs; telemetry: VehicleTelemetry | null; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void;
  /** Dış panellerin (ör. Master Caution) akışa bot mesajı yazabilmesi için kanca. */
  injectRef?: { current: ((text: string) => void) | null };
}) {
  const t = useT();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [input, setInput] = useState('');
  const [llm, setLlm] = useState(false);
  const [beName, setBeName] = useState('');
  const [busy, setBusy] = useState(false);
  // BYOK: kullanıcı ayarlarda kendi LLM anahtarını girdiyse köprüye hiç gitme,
  // tarayıcıdan doğrudan sağlayıcıya bağlan (anahtar cihazdan çıkmaz).
  const { llm: llmCfg } = useSettings();
  const byok = llmActive(llmCfg);
  const idRef = useRef(1);
  const seenRef = useRef(0);
  const histRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Kopru LLM proxy'sini yokla (ANTHROPIC_API_KEY varsa AI, yoksa yerel)
  useEffect(() => {
    let alive = true;
    fetch(PROXY).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) { setLlm(!!(j && j.llm)); setBeName(j && j.backend ? String(j.backend) : ''); } }).catch(() => { if (alive) setLlm(false); });
    return () => { alive = false; };
  }, []);

  const push = (role: FeedItem['role'], text: string): void =>
    setFeed((f) => [...f.slice(-120), { id: idRef.current++, role, text }]);

  useEffect(() => {
    if (!injectRef) return;
    injectRef.current = (text) => push('bot', text);
    return () => { injectRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectRef]);

  // Otopilot status text'lerini akisa ekle; art arda ayni metin tek satirda ×N sayaciyla birikir
  // (or. firmware'in "Sending unknown message" spam'i akisi bogmasin)
  const statusTexts: StatusTextEntry[] = gcs.statusTexts;
  useEffect(() => {
    const fresh = statusTexts.filter((e) => e.id > seenRef.current);
    if (fresh.length === 0) return;
    seenRef.current = statusTexts[statusTexts.length - 1]!.id;
    setFeed((f) => {
      const out = [...f];
      for (const e of fresh) {
        const last = out[out.length - 1];
        if (last && last.role === 'sys' && last.text === e.text) out[out.length - 1] = { ...last, n: (last.n ?? 1) + 1 };
        else out.push({ id: idRef.current++, role: 'sys', text: e.text });
      }
      return out.slice(-120);
    });
  }, [statusTexts]);

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [feed]);

  const handleReply = (reply: string, ctx: Ctx): void => {
    const m = reply.match(/@CMD\s*(\{[\s\S]*\})\s*$/);
    if (m) {
      const pre = reply.slice(0, m.index).trim();
      if (pre) push('bot', pre);
      let cmd: { type?: string } | null = null;
      try { cmd = JSON.parse(m[1]!); } catch { /* gecersiz json */ }
      if (cmd && typeof cmd.type === 'string') push('bot', executeCommand(cmd, ctx));
      else if (!pre) push('bot', reply);
    } else {
      push('bot', reply);
    }
  };

  const submit = async (): Promise<void> => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    push('user', text);
    const ctx: Ctx = { conn: gcs.connRef.current, tele: telemetry, params, setParams, vtype: telemetry?.vehicleType ?? 0 };
    if (byok) {
      setBusy(true);
      try {
        const hist = histRef.current.concat({ role: 'user', content: text });
        const reply = (await chatDirect(llmCfg, hist, buildContext(ctx))).trim() || '—';
        histRef.current = hist.concat({ role: 'assistant', content: reply }).slice(-16);
        handleReply(reply, ctx);
        return;
      } catch (e) {
        // Anahtar/kota/ağ hatası: nedeni göster, bu mesajı yerel yorumlayıcıyla karşıla.
        push('sys', t('LLM hatası — yerel moda düşüldü: ') + (e instanceof Error ? e.message : String(e)));
      } finally { setBusy(false); }
    } else if (llm) {
      setBusy(true);
      try {
        const hist = histRef.current.concat({ role: 'user', content: text });
        const r = await fetch(PROXY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: hist, context: buildContext(ctx) }) });
        if (r.ok) {
          const j = await r.json();
          const reply = String(j.text ?? '').trim() || '—';
          histRef.current = hist.concat({ role: 'assistant', content: reply }).slice(-16);
          handleReply(reply, ctx);
          return;
        }
        if (r.status === 503) setLlm(false); // anahtar yok -> yerel
      } catch { setLlm(false); } finally { setBusy(false); }
    }
    // Yerel deterministik yorumlayici (LLM yoksa/başarısızsa)
    const reply = interpret(text, ctx);
    if (reply) push('bot', reply);
  };

  return (
    <div className="card chat-card">
      <div className="card-hd"><h2>{t('Asistan')}</h2><span className="hd-note">{busy ? '…' : byok ? 'AI·' + llmLabel(llmCfg) : llm ? 'AI' + (beName ? '·' + beName : '') : t('yerel')}</span></div>
      <div className="card-body chat-body" ref={bodyRef}>
        {feed.length === 0 && <div className="chat-hint">{t('Komut yazın: arm · mod RTL · kalkış 50 · set WPNAV_SPEED 500 · batarya · durum · yardım')}</div>}
        {feed.map((m) => (
          <div key={m.id} className={'chat-msg chat-' + m.role}>
            {m.role === 'sys' ? <span className="chat-sys-tag">✈</span> : null}
            <span>{m.text}{m.n && m.n > 1 ? <b className="chat-rep"> ×{m.n}</b> : null}</span>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('GCS’e yaz… (yardım)')} aria-label={t('Asistan')} disabled={busy} />
        <button type="submit" className="btn-primary" disabled={!input.trim() || busy}>{busy ? '…' : '↵'}</button>
      </form>
    </div>
  );
}
