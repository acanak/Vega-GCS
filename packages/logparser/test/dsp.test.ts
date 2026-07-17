import { describe, it, expect } from 'vitest';
import { computeSpectrum, fftMagnitude } from '../src/dsp';

describe('FFT / spektrum', () => {
  it('10 Hz sinüs -> tepe ~10 Hz', () => {
    const fs = 128;
    const f = 10;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < 128; i++) { x.push(i / fs); y.push(Math.sin(2 * Math.PI * f * (i / fs))); }
    const sp = computeSpectrum(x, y);
    expect(sp.fs).toBeCloseTo(128, 0);
    let maxI = 0;
    for (let i = 1; i < sp.mag.length; i++) if (sp.mag[i]! > sp.mag[maxI]!) maxI = i;
    expect(sp.freq[maxI]!).toBeCloseTo(10, 0);
  });

  it('fftMagnitude 2^n uzunluk', () => {
    const { n } = fftMagnitude(new Array(100).fill(0).map((_, i) => Math.sin(i)));
    expect(n).toBe(64);
  });
});
