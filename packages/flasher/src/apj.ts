// ArduPilot .apj firmware dosyasi: JSON { board_id, image (base64 + zlib) }.
export interface Apj {
  boardId: number;
  image: Uint8Array;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const buf = await new Response(new Blob([data as BlobPart]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

export async function parseApj(text: string): Promise<Apj> {
  const j = JSON.parse(text) as { board_id?: number; image?: string };
  if (!j.image) throw new Error('.apj: image alanı yok');
  const image = await inflate(b64ToBytes(j.image));
  return { boardId: Number(j.board_id ?? 0), image };
}
