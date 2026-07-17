import { describe, it, expect } from 'vitest';
import { paramMeta, PARAM_META } from '../src/index';

describe('param metadata', () => {
  it('metadata haritasi dolu', () => {
    expect(Object.keys(PARAM_META).length).toBeGreaterThan(300);
  });
  it('bilinen param metadata iceriyor', () => {
    const m = paramMeta('RC1_MIN');
    expect(m).toBeTruthy();
    expect(m!.disp || m!.desc).toBeTruthy();
  });
  it('bilinmeyen param -> undefined', () => {
    expect(paramMeta('___YOK___')).toBeUndefined();
  });
});
