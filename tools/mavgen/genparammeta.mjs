#!/usr/bin/env node
// ParameterFactMetaData.xml -> packages/param-meta/src/meta.generated.ts (offline param metadata).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'ParameterFactMetaData.xml');
const OUT = join(here, '..', '..', 'packages', 'param-meta', 'src', 'meta.generated.ts');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', isArray: (n) => n === 'group' || n === 'parameter' || n === 'value' });
const doc = parser.parse(readFileSync(SRC, 'utf8'));

const meta = {};
const groups = doc.parameters?.group ?? [];
for (const g of groups) {
  for (const p of g.parameter ?? []) {
    const name = String(p.name ?? '').trim();
    if (!name) continue;
    const entry = {};
    if (p.short_desc) entry.disp = String(p.short_desc).replace(/\s+/g, ' ').trim();
    if (p.long_desc) entry.desc = String(p.long_desc).replace(/\s+/g, ' ').trim();
    if (p.unit) entry.units = String(p.unit).trim();
    if (p.min !== undefined) entry.min = Number(p.min);
    if (p.max !== undefined) entry.max = Number(p.max);
    if (p.values?.value) {
      const vals = {};
      for (const v of p.values.value) vals[String(v.code)] = String(v['#text'] ?? '').trim();
      if (Object.keys(vals).length) entry.values = vals;
    }
    meta[name] = entry; // son tanim kazanir
  }
}

const names = Object.keys(meta).sort();
const lines = [];
lines.push('// OTOMATIK URETILDI - tools/mavgen/genparammeta.mjs (ParameterFactMetaData.xml)');
lines.push('/* eslint-disable */');
lines.push('export interface ParamMeta { disp?: string; desc?: string; units?: string; min?: number; max?: number; values?: Record<string, string>; }');
lines.push('export const PARAM_META: Readonly<Record<string, ParamMeta>> = {');
for (const n of names) lines.push('  ' + JSON.stringify(n) + ': ' + JSON.stringify(meta[n]) + ',');
lines.push('};');
lines.push('');
writeFileSync(OUT, lines.join('\n'));
console.log('Yazildi:', OUT, '-', names.length, 'param');
