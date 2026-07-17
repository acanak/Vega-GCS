#!/usr/bin/env node
// MAVLink XML diyalektinden TS dialect uretir: crc_extra, mesaj adlari, tel-duzeni offsetleri.
// Giris: message_definitions/ardupilotmega.xml (include'lari ozyinelemeli cozulur).
// Cikis: packages/mavlink-codec/src/dialect.generated.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const here = dirname(fileURLToPath(import.meta.url));
const DEFS = join(here, 'message_definitions');
const ENTRY = 'ardupilotmega.xml';
const OUT = join(here, '..', '..', 'packages', 'mavlink-codec', 'src', 'dialect.generated.ts');

// Tel-duzeni siralamasi ve offset icin taban-tip boyutlari.
const TYPE_SIZE = {
  float: 4, double: 8, char: 1,
  int8_t: 1, uint8_t: 1, uint8_t_mavlink_version: 1,
  int16_t: 2, uint16_t: 2,
  int32_t: 4, uint32_t: 4,
  int64_t: 8, uint64_t: 8,
};

// X.25 / CRC-16-MCRF4XX
function acc(b, crc) {
  let t = (b ^ (crc & 0xff)) & 0xff;
  t = (t ^ (t << 4)) & 0xff;
  return ((crc >> 8) ^ (t << 8) ^ (t << 3) ^ (t >> 4)) & 0xffff;
}
function accStr(s, crc) {
  for (let i = 0; i < s.length; i++) crc = acc(s.charCodeAt(i), crc);
  return crc;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  trimValues: true,
});

function getTag(arr, tag) {
  for (const n of arr) if (Object.prototype.hasOwnProperty.call(n, tag)) return n;
  return null;
}

const seenFiles = new Set();
const byId = new Map(); // id -> { id, name, baseFields, extFields }

function loadFile(fname) {
  if (seenFiles.has(fname)) return;
  seenFiles.add(fname);
  const xml = readFileSync(join(DEFS, fname), 'utf8');
  const doc = parser.parse(xml);
  const mav = getTag(doc, 'mavlink');
  if (!mav) return;
  const children = mav.mavlink;

  // Once include'lar (ozyinelemeli), sonra bu dosyanin mesajlari (ust dosya kazanir).
  for (const node of children) {
    if (node.include) {
      const inc = node.include[0] && node.include[0]['#text'];
      if (inc) loadFile(String(inc).trim());
    }
  }
  for (const node of children) {
    if (!node.messages) continue;
    for (const mw of node.messages) {
      if (!mw.message) continue;
      const attrs = mw[':@'] || {};
      const id = Number(attrs.id);
      const name = String(attrs.name);
      const baseFields = [];
      const extFields = [];
      let ext = false;
      for (const fn of mw.message) {
        if (Object.prototype.hasOwnProperty.call(fn, 'extensions')) {
          ext = true;
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(fn, 'field')) continue;
        const fa = fn[':@'] || {};
        const rawType = String(fa.type);
        const m = /^([A-Za-z0-9_]+)(?:\[(\d+)\])?$/.exec(rawType);
        if (!m) throw new Error('cozulemeyen tip: ' + rawType + ' (' + name + ')');
        const baseType = m[1] === "uint8_t_mavlink_version" ? "uint8_t" : m[1];
        const field = { type: baseType, name: String(fa.name), arrayLen: m[2] ? Number(m[2]) : 0 };
        (ext ? extFields : baseFields).push(field);
      }
      byId.set(id, { id, name, baseFields, extFields });
    }
  }
}

function wireOrder(fields) {
  return fields
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (TYPE_SIZE[b.f.type] ?? 1) - (TYPE_SIZE[a.f.type] ?? 1) || a.i - b.i)
    .map((x) => x.f);
}

function crcExtra(msg) {
  let crc = 0xffff;
  crc = accStr(msg.name + ' ', crc);
  for (const f of wireOrder(msg.baseFields)) {
    crc = accStr(f.type + ' ', crc);
    crc = accStr(f.name + ' ', crc);
    if (f.arrayLen) crc = acc(f.arrayLen, crc);
  }
  return (crc & 0xff) ^ ((crc >> 8) & 0xff);
}

function layout(msg) {
  // Tel-duzeni: siralanmis taban alanlar + (bildirim sirasinda) extension alanlari.
  const ordered = [...wireOrder(msg.baseFields), ...msg.extFields];
  let offset = 0;
  const fields = ordered.map((f) => {
    const size = (TYPE_SIZE[f.type] ?? 1) * (f.arrayLen || 1);
    const rec = { name: f.name, type: f.type, arrayLen: f.arrayLen, offset };
    offset += size;
    return rec;
  });
  return { fields, wireLength: offset };
}

loadFile(ENTRY);

const msgs = [...byId.values()].sort((a, b) => a.id - b.id);
const dialect = msgs.map((m) => {
  const { fields, wireLength } = layout(m);
  return { id: m.id, name: m.name, crcExtra: crcExtra(m), wireLength, fields };
});

// --- Bilinen crc_extra degerlerine karsi dogrulama (ground truth) ---
const KNOWN = {
  0: 50, 1: 124, 24: 24, 30: 39, 33: 104, 66: 148, 74: 20, 76: 152, 77: 143, 253: 83,
};
const map = new Map(dialect.map((d) => [d.id, d]));
let fails = 0;
for (const [id, expected] of Object.entries(KNOWN)) {
  const got = map.get(Number(id))?.crcExtra;
  const ok = got === expected;
  if (!ok) fails++;
  console.log((ok ? 'OK  ' : 'HATA') + ' msgid=' + id + ' beklenen=' + expected + ' uretilen=' + got);
}
if (fails > 0) {
  console.error('\ncrc_extra dogrulamasi BASARISIZ (' + fails + ' hata) - jenerator yazilmadi.');
  process.exit(1);
}

// --- TS ciktisi ---
const lines = [];
lines.push('// OTOMATIK URETILDI - elle duzenlemeyin.');
lines.push('// Kaynak: tools/mavgen/generate.mjs (message_definitions/' + ENTRY + ')');
lines.push('/* eslint-disable */');
lines.push('');
lines.push('export interface DialectField { name: string; type: string; arrayLen: number; offset: number; }');
lines.push('export interface DialectMessage { id: number; name: string; crcExtra: number; wireLength: number; fields: DialectField[]; }');
lines.push('');
lines.push('export const CRC_EXTRA: Readonly<Record<number, number>> = {');
for (const d of dialect) lines.push('  ' + d.id + ': ' + d.crcExtra + ',');
lines.push('};');
lines.push('');
lines.push('export const MESSAGE_NAMES: Readonly<Record<number, string>> = {');
for (const d of dialect) lines.push('  ' + d.id + ": '" + d.name + "',");
lines.push('};');
lines.push('');
lines.push('export const MESSAGE_IDS: Readonly<Record<string, number>> = {');
for (const d of dialect) lines.push('  ' + d.name + ': ' + d.id + ',');
lines.push('};');
lines.push('');
lines.push('export const MESSAGES: Readonly<Record<number, DialectMessage>> = {');
for (const d of dialect) {
  const fstr = d.fields
    .map((f) => '{ name: "' + f.name + '", type: "' + f.type + '", arrayLen: ' + f.arrayLen + ', offset: ' + f.offset + ' }')
    .join(', ');
  lines.push('  ' + d.id + ': { id: ' + d.id + ', name: "' + d.name + '", crcExtra: ' + d.crcExtra + ', wireLength: ' + d.wireLength + ', fields: [' + fstr + '] },');
}
lines.push('};');
lines.push('');

writeFileSync(OUT, lines.join('\n'));
console.log('\nYazildi: ' + OUT);
console.log('Toplam mesaj: ' + dialect.length);
