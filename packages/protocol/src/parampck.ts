// ArduPilot MAVFtp "@PARAM/param.pck" cozucu.
// Format AP_Filesystem_Param.cpp (pack_param) + pymavlink mavftp.py ile dogrulandi;
// canli ArduPlane/Copter SITL param.pck baytlarina karsi test edildi (1339/1339 param).
//
// Yapi: header <HHH> (magic, num_params, total_params, hepsi LE) + ard arda giris.
// Her giristen once 0+ adet 0x00 PAD (deger MAVFtp okuma-blok sinirini asmasin diye hizalama).
// Giris: [b0=ptype|flags<<4][b1=common_len|(name_len-1)<<4][name son-eki][deger][default?]
// ptype (AP_Param): 1=INT8,2=INT16,3=INT32,4=FLOAT. Degerler gercek tipinde, LE.
// magic 0x671b=yalniz deger, 0x671c=deger+default (flags bit0 set ise default eklenir).

export interface PckParam { name: string; value: number; type: number; }

const AP_TO_MAV: Record<number, number> = { 1: 2, 2: 4, 3: 6, 4: 9 }; // AP_Param -> MAV_PARAM_TYPE
const TLEN: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 4 };
export const PARAM_PCK_MAGIC = 0x671b;
export const PARAM_PCK_MAGIC_DEFAULTS = 0x671c;

export function decodeParamPck(bytes: Uint8Array): PckParam[] {
  if (bytes.length < 6) throw new Error('param.pck cok kisa (' + bytes.length + ' bayt)');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== PARAM_PCK_MAGIC && magic !== PARAM_PCK_MAGIC_DEFAULTS) {
    throw new Error('param.pck kotu magic 0x' + magic.toString(16));
  }
  const withDefaults = magic === PARAM_PCK_MAGIC_DEFAULTS;
  const out: PckParam[] = [];
  let i = 6;
  let last = '';
  while (i < bytes.length) {
    while (i < bytes.length && bytes[i] === 0) i++; // PAD atla (giris konumunda tip>=1, 0 daima pad)
    if (i + 2 > bytes.length) break;
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1]!;
    i += 2;
    const ap = b0 & 0x0f;
    const flags = b0 >> 4;
    if (ap < 1 || ap > 4) break; // beklenmeyen tip -> guvenli dur
    const common = b1 & 0x0f;
    const nameLen = (b1 >> 4) + 1;
    let suffix = '';
    for (let k = 0; k < nameLen && i < bytes.length; k++) suffix += String.fromCharCode(bytes[i++]!);
    const name = last.slice(0, common) + suffix;
    last = name;
    const tl = TLEN[ap]!;
    if (i + tl > bytes.length) break;
    let value: number;
    if (ap === 1) value = dv.getInt8(i);
    else if (ap === 2) value = dv.getInt16(i, true);
    else if (ap === 3) value = dv.getInt32(i, true);
    else value = dv.getFloat32(i, true);
    i += tl;
    if (withDefaults && (flags & 1)) i += tl; // gomulu default degeri atla
    out.push({ name, value, type: AP_TO_MAV[ap]! });
  }
  return out;
}
