// Ana thread baglantisi: bir Link'e sahiptir, RX baytlarini ProtocolEngine'e besler,
// engine'in urettigi giden cerceveleri link'e yazar ve 1 Hz GCS heartbeat zamanlayicisini
// calistirir. Protokol mantigi ProtocolEngine'de (engine.ts).

import type { Link } from '@wmp/link';
import type { ParsedFrame, FieldValue } from '@wmp/mavlink-codec';
import { ProtocolEngine } from './engine';
import type { VehicleTelemetry, RawMissionItem, ParamEntry } from './engine';

export interface MavConnectionOptions {
  link: Link;
  gcsSystemId?: number;
  gcsComponentId?: number;
  /** GCS heartbeat frekansi (Hz); 0 = kapali (testler icin). Varsayilan 1. */
  heartbeatHz?: number;
  /** Baglaninca istenen veri akis hizi (Hz). Varsayilan 4. */
  requestStreamHz?: number;
}

export class MavConnection {
  /** Mutable telemetri anlik goruntusu (HOT tier). UI bunu rAF ile okur. */
  readonly telemetry: VehicleTelemetry;

  private link: Link;
  private engine: ProtocolEngine;
  private heartbeatHz: number;
  private hbTimer: ReturnType<typeof setInterval> | undefined;
  private unsubData: (() => void) | undefined;

  constructor(opts: MavConnectionOptions) {
    this.link = opts.link;
    this.heartbeatHz = opts.heartbeatHz ?? 1;
    this.engine = new ProtocolEngine({
      gcsSystemId: opts.gcsSystemId,
      gcsComponentId: opts.gcsComponentId,
      requestStreamHz: opts.requestStreamHz,
      emit: (frame) => {
        void this.link.write(frame);
      },
    });
    this.telemetry = this.engine.telemetry;
  }

  async open(): Promise<void> {
    await this.link.open();
    this.unsubData = this.link.onData((chunk) => this.engine.ingest(chunk));
    if (this.heartbeatHz > 0) {
      const period = Math.round(1000 / this.heartbeatHz);
      this.hbTimer = setInterval(() => this.engine.sendHeartbeat(), period);
    }
  }

  async close(): Promise<void> {
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = undefined;
    this.unsubData?.();
    this.unsubData = undefined;
    await this.link.close();
    this.telemetry.connected = false;
  }

  subscribe(msgid: number, cb: (f: ParsedFrame) => void): () => void {
    return this.engine.subscribe(msgid, cb);
  }

  subscribeDecoded(msgid: number, cb: (fields: Record<string, FieldValue>) => void): () => void {
    return this.engine.subscribeDecoded(msgid, cb);
  }

  decodeFrame(f: ParsedFrame): Record<string, FieldValue> | undefined {
    return this.engine.decodeFrame(f);
  }

  subscribeMessage(msgid: number, cb: (fields: Record<string, FieldValue>) => void): () => void {
    return this.engine.subscribeDecoded(msgid, cb);
  }

  sendMessage(msgid: number, values: Record<string, number | bigint | string>): void {
    this.engine.sendMessage(msgid, values);
  }

  onStatusText(cb: (severity: number, text: string) => void): () => void {
    return this.engine.onStatusText(cb);
  }

  onConnected(cb: (sysid: number, compid: number) => void): () => void {
    return this.engine.onConnected(cb);
  }

  async arm(force = false): Promise<void> {
    this.engine.arm(force);
  }

  async disarm(force = false): Promise<void> {
    this.engine.disarm(force);
  }

  async setMode(customMode: number): Promise<void> {
    this.engine.setMode(customMode);
  }

  async downloadMission(onProgress?: (received: number, total: number) => void, missionType = 0): Promise<RawMissionItem[]> {
    return this.engine.downloadMission(onProgress, missionType);
  }

  async uploadMission(items: RawMissionItem[], onProgress?: (sent: number, total: number) => void, missionType = 0): Promise<number> {
    return this.engine.uploadMission(items, onProgress, missionType);
  }

  async downloadParams(onProgress?: (received: number, total: number) => void): Promise<ParamEntry[]> {
    return this.engine.downloadParams(onProgress);
  }

  async setParam(name: string, value: number, type: number): Promise<number> {
    return this.engine.setParam(name, value, type);
  }

  async commandLong(
    command: number,
    params: [number, number, number, number, number, number, number],
  ): Promise<void> {
    this.engine.commandLong(command, params);
  }

  async requestDataStream(rateHz: number): Promise<void> {
    this.engine.requestDataStream(rateHz);
  }
}
