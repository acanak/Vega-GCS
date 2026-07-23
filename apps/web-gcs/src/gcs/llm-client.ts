// Tarayıcıdan DOĞRUDAN LLM sağlayıcısına istek (BYOK — kullanıcı kendi anahtarıyla).
// Sunucu/köprü gerektirmez; anahtar isteğin dışında hiçbir yere gitmez.
// Sistem prompt'u tools/dev-bridge/bridge.mjs ile aynı protokolü (@CMD) kullanır.
import type { LlmSettings } from './settings';

const CHAT_SYSTEM =
  'Sen bir ArduPilot web yer kontrol istasyonu (GCS) asistanisin. CONTEXT canli telemetriyi icerir. ' +
  'Kullanicinin dilinde KISA cevap ver. Dosya duzenleme/komut calistirma YAPMA; sadece yanit uret. ' +
  'Bir ARAC EYLEMI gerekiyorsa, yanitin SON satirinda TAM olarak "@CMD " ardindan tek satir JSON yaz (baska metin ekleme). Desteklenen komutlar:\n' +
  '{"type":"arm"} {"type":"disarm"} (kullanici israr ederse "force":true ekle)\n' +
  '{"type":"mode","name":"RTL"} {"type":"takeoff","alt":50} {"type":"speed","value":15}\n' +
  '{"type":"setParam","name":"WPNAV_SPEED","value":500} {"type":"getParam","name":"RC1_MAX"}\n' +
  'Sorulara CONTEXT ile cevap ver; parametre degeri UYDURMA. arm/kalkis gibi tehlikeli komutlari yalniz kullanici acikca isterse ver.';

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  custom: '',
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function llmActive(s: LlmSettings): boolean {
  if (s.provider === 'off' || !s.apiKey.trim()) return false;
  if (s.provider === 'custom' && !s.baseUrl.trim()) return false;
  return true;
}

export function llmLabel(s: LlmSettings): string {
  const m = s.model.trim() || DEFAULT_MODEL[s.provider] || '';
  return s.provider + (m ? '·' + m : '');
}

async function callAnthropic(s: LlmSettings, messages: ChatMessage[], system: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': s.apiKey.trim(),
      'anthropic-version': '2023-06-01',
      // Anthropic, tarayici kaynakli (CORS) istekleri yalniz bu baslikla kabul eder;
      // anahtar kullanicinin kendisine ait oldugu icin bilincli bir tercih.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: s.model.trim() || DEFAULT_MODEL.anthropic, max_tokens: 400, system, messages }),
  });
  if (!r.ok) throw new Error('anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = (await r.json()) as { content?: Array<{ type: string; text?: string }> };
  return (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
}

async function callOpenAICompat(s: LlmSettings, messages: ChatMessage[], system: string): Promise<string> {
  const base = s.provider === 'custom' ? s.baseUrl.trim().replace(/\/+$/, '') : 'https://api.openai.com/v1';
  const model = s.model.trim() || DEFAULT_MODEL[s.provider] || '';
  if (!model) throw new Error('model adı gerekli');
  const r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.apiKey.trim() },
    body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  if (!r.ok) throw new Error((s.provider === 'custom' ? 'llm ' : 'openai ') + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return String(j.choices?.[0]?.message?.content ?? '').trim();
}

/** Sohbet: mesaj geçmişi + canlı telemetri bağlamı → asistan yanıtı (@CMD protokollü). */
export function chatDirect(s: LlmSettings, messages: ChatMessage[], context: string): Promise<string> {
  const system = CHAT_SYSTEM + '\n\nCONTEXT:\n' + context;
  return s.provider === 'anthropic' ? callAnthropic(s, messages, system) : callOpenAICompat(s, messages, system);
}

/** Ayarlar ekranındaki "Dene" düğmesi: küçük bir istekle anahtarı doğrular. */
export async function testLlm(s: LlmSettings): Promise<string> {
  const reply = await chatDirect(s, [{ role: 'user', content: 'Sadece "ok" yaz.' }], 'test');
  return reply || 'ok';
}
