import { describe, it, expect } from 'vitest';
import { StreamDriverLink, UdpLink } from '../src/driver-links';
import type { StreamDriver, DatagramDriver } from '../src/driver';

// --- Sahte sürücüler ---------------------------------------------------------

function fakeStream(): StreamDriver & { sent: Uint8Array[]; pushData: (d: Uint8Array) => void; kill: (e?: Error) => void; opened: boolean; closedByLink: boolean } {
  let dataCb: ((c: Uint8Array) => void) | null = null;
  let closeCb: ((e?: Error) => void) | null = null;
  const f = {
    sent: [] as Uint8Array[],
    opened: false,
    closedByLink: false,
    pushData: (d: Uint8Array) => dataCb?.(d),
    kill: (e?: Error) => closeCb?.(e),
    open: async () => { f.opened = true; },
    send: async (d: Uint8Array) => { f.sent.push(d); },
    close: async () => { f.closedByLink = true; },
    onData: (cb: (c: Uint8Array) => void) => { dataCb = cb; return () => { dataCb = null; }; },
    onClose: (cb: (e?: Error) => void) => { closeCb = cb; return () => { closeCb = null; }; },
  };
  return f;
}

function fakeDatagram(): DatagramDriver & { sent: Array<{ data: Uint8Array; host: string; port: number }>; push: (d: Uint8Array, h: string, p: number) => void; kill: (e?: Error) => void; boundPort: number | null } {
  let dgramCb: ((d: Uint8Array, h: string, p: number) => void) | null = null;
  let closeCb: ((e?: Error) => void) | null = null;
  const f = {
    sent: [] as Array<{ data: Uint8Array; host: string; port: number }>,
    boundPort: null as number | null,
    push: (d: Uint8Array, h: string, p: number) => dgramCb?.(d, h, p),
    kill: (e?: Error) => closeCb?.(e),
    bind: async (port: number) => { f.boundPort = port; },
    send: async (data: Uint8Array, host: string, port: number) => { f.sent.push({ data, host, port }); },
    close: async () => {},
    onDatagram: (cb: (d: Uint8Array, h: string, p: number) => void) => { dgramCb = cb; return () => { dgramCb = null; }; },
    onClose: (cb: (e?: Error) => void) => { closeCb = cb; return () => { closeCb = null; }; },
  };
  return f;
}

const bytes = (...b: number[]): Uint8Array => new Uint8Array(b);

// --- StreamDriverLink --------------------------------------------------------

describe('StreamDriverLink', () => {
  it('açılır, veri alır-gönderir, kapanır', async () => {
    const drv = fakeStream();
    const link = new StreamDriverLink('tcp', drv);
    const rx: Uint8Array[] = [];
    link.onData((c) => rx.push(c));

    await link.open();
    expect(drv.opened).toBe(true);
    expect(link.isOpen).toBe(true);

    drv.pushData(bytes(1, 2, 3));
    expect(rx).toHaveLength(1);

    await link.write(bytes(9));
    expect(drv.sent).toHaveLength(1);

    let closeCount = 0;
    link.onClose(() => closeCount++);
    await link.close();
    expect(link.isOpen).toBe(false);
    expect(drv.closedByLink).toBe(true);
    expect(closeCount).toBe(1);
  });

  it('açılmadan gelen veri iletilmez; kapandıktan sonra yazım sessizce düşer', async () => {
    const drv = fakeStream();
    const link = new StreamDriverLink('usbserial', drv);
    const rx: Uint8Array[] = [];
    link.onData((c) => rx.push(c));
    drv.pushData(bytes(1)); // açılmadan
    expect(rx).toHaveLength(0);
    await link.open();
    await link.close();
    await link.write(bytes(2)); // kapandıktan sonra — hata fırlatmamalı
    expect(drv.sent).toHaveLength(0);
  });

  it('sürücü ölünce onClose bir kez yayılır; gönderim hatası da kapanışa çevrilir', async () => {
    const drv = fakeStream();
    drv.send = async () => { throw new Error('boru koptu'); };
    const link = new StreamDriverLink('ble', drv);
    const errs: Array<Error | undefined> = [];
    link.onClose((e) => errs.push(e));
    await link.open();
    await link.write(bytes(1)); // hata → kapanış
    drv.kill(new Error('ikinci')); // ikinci kapanış yayılmamalı
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toBe('boru koptu');
    expect(link.isOpen).toBe(false);
  });

  it('çifte open ve kapanmış linki yeniden açma reddedilir', async () => {
    const drv = fakeStream();
    const link = new StreamDriverLink('tcp', drv);
    await link.open();
    await expect(link.open()).rejects.toThrow();
    await link.close();
    await expect(link.open()).rejects.toThrow();
  });
});

// --- UdpLink ------------------------------------------------------------------

describe('UdpLink', () => {
  it('yerel porta bağlanır; eş öğrenilmeden yazım düşer, ilk datagramla eş öğrenilir', async () => {
    const drv = fakeDatagram();
    const link = new UdpLink({ driver: drv, localPort: 14550 });
    const rx: Uint8Array[] = [];
    link.onData((c) => rx.push(c));

    await link.open();
    expect(drv.boundPort).toBe(14550);

    await link.write(bytes(1)); // eş yok → düşmeli
    expect(drv.sent).toHaveLength(0);
    expect(link.peerAddress).toBeNull();

    drv.push(bytes(0xfd, 9), '192.168.4.1', 14555); // telemetri geldi → eş öğrenildi
    expect(rx).toHaveLength(1);
    expect(link.peerAddress).toEqual({ host: '192.168.4.1', port: 14555 });

    await link.write(bytes(2));
    expect(drv.sent).toHaveLength(1);
    expect(drv.sent[0]).toMatchObject({ host: '192.168.4.1', port: 14555 });
  });

  it('eş NAT ardında port değiştirirse günceller (öğrenme modu)', async () => {
    const drv = fakeDatagram();
    const link = new UdpLink({ driver: drv });
    await link.open();
    drv.push(bytes(1), '10.0.0.5', 14555);
    drv.push(bytes(2), '10.0.0.5', 14600);
    await link.write(bytes(3));
    expect(drv.sent[0]).toMatchObject({ host: '10.0.0.5', port: 14600 });
  });

  it('sabit eş modunda öğrenme yapılmaz', async () => {
    const drv = fakeDatagram();
    const link = new UdpLink({ driver: drv, remoteHost: '10.1.1.1', remotePort: 14550 });
    await link.open();
    await link.write(bytes(1)); // eş sabit → hemen gönderilir
    expect(drv.sent[0]).toMatchObject({ host: '10.1.1.1', port: 14550 });
    drv.push(bytes(2), '99.9.9.9', 1); // farklı kaynak — eş değişmemeli
    await link.write(bytes(3));
    expect(drv.sent[1]).toMatchObject({ host: '10.1.1.1', port: 14550 });
  });

  it('sürücü kapanınca onClose bir kez yayılır', async () => {
    const drv = fakeDatagram();
    const link = new UdpLink({ driver: drv });
    let n = 0;
    link.onClose(() => n++);
    await link.open();
    drv.kill(new Error('soket kapandı'));
    drv.kill();
    expect(n).toBe(1);
    expect(link.isOpen).toBe(false);
  });
});
