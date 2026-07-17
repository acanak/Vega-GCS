// Basit DSP: radix-2 FFT ve genlik spektrumu (vibrasyon analizi icin).

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!; re[i] = re[j]!; re[j] = tr;
      const ti = im[i]!; im[i] = im[j]!; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = cwr * re[b]! - cwi * im[b]!;
        const ti = cwr * im[b]! + cwi * re[b]!;
        re[b] = re[a]! - tr; im[b] = im[a]! - ti;
        re[a] = re[a]! + tr; im[a] = im[a]! + ti;
        const ncwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = ncwr;
      }
    }
  }
}

const pow2Floor = (n: number): number => { let p = 1; while (p * 2 <= n) p *= 2; return p; };

/** Ornek dizisinin Hann-pencereli genlik spektrumu; { mag (N/2), n }. */
export function fftMagnitude(samples: number[]): { mag: number[]; n: number } {
  const n = pow2Floor(samples.length);
  if (n < 2) return { mag: [], n: 0 };
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); // Hann
    re[i] = samples[i]! * w;
  }
  fftInPlace(re, im);
  const half = n >> 1;
  const mag: number[] = new Array(half);
  for (let i = 0; i < half; i++) mag[i] = (Math.hypot(re[i]!, im[i]!) * 2) / n;
  return { mag, n };
}

const median = (a: number[]): number => {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1]!;
};

/** Zaman(saniye)+deger serisinden frekans(Hz)+genlik spektrumu (DC atlanir). */
export function computeSpectrum(x: number[], y: number[]): { freq: number[]; mag: number[]; fs: number } {
  if (y.length < 8) return { freq: [], mag: [], fs: 0 };
  const diffs: number[] = [];
  for (let i = 1; i < x.length; i++) { const d = x[i]! - x[i - 1]!; if (d > 0) diffs.push(d); }
  const dt = median(diffs);
  if (!(dt > 0)) return { freq: [], mag: [], fs: 0 };
  const fs = 1 / dt;
  const { mag, n } = fftMagnitude(y);
  const freq: number[] = [];
  const out: number[] = [];
  for (let i = 1; i < mag.length; i++) { freq.push((i * fs) / n); out.push(mag[i]!); }
  return { freq, mag: out, fs };
}
