// Kaydedilmis logu (tlog/bin) canli baglanti gibi sunar: telemetry zaman icinde ilerler.
// GcsConnection arayuzunu uygular; komutlar no-op. PFD/harita bunu normal baglanti gibi okur.
import type { VehicleTelemetry, RawMissionItem, ParamEntry } from '@wmp/protocol';
import { emptyTelemetry } from '@wmp/protocol';
import type { LogData, TrajSample } from '@wmp/logparser';
import { getTrajectory } from '@wmp/logparser';
import type { GcsConnection, DecodedFields } from './protocol-shared';

export class PlaybackSource implements GcsConnection {
  readonly telemetry: VehicleTelemetry = emptyTelemetry();
  readonly samples: TrajSample[];
  readonly duration: number;
  private idx = 0;

  constructor(data: LogData) {
    this.samples = getTrajectory(data);
    this.duration = this.samples.length ? this.samples[this.samples.length - 1]!.t : 0;
    this.telemetry.connected = this.samples.length > 1;
    this.telemetry.gps.fixType = 3;
    this.telemetry.gps.satellites = 12;
    this.telemetry.customMode = -1;
    if (this.samples.length) this.seek(0);
  }

  seek(t: number): void {
    const s = this.samples;
    if (!s.length) return;
    if (t <= s[0]!.t) this.idx = 0;
    else if (t >= s[s.length - 1]!.t) this.idx = s.length - 1;
    else {
      while (this.idx < s.length - 1 && s[this.idx + 1]!.t <= t) this.idx++;
      while (this.idx > 0 && s[this.idx]!.t > t) this.idx--;
    }
    const c = s[this.idx]!;
    const tm = this.telemetry;
    tm.attitude.roll = c.roll;
    tm.attitude.pitch = c.pitch;
    tm.attitude.yaw = c.yaw;
    tm.position.lat = c.lat;
    tm.position.lon = c.lon;
    tm.position.alt = c.alt;
    tm.position.relativeAlt = c.alt;
    tm.position.hdg = ((c.yaw * 180) / Math.PI + 360) % 360;
    tm.vfr.alt = c.alt;
  }

  // ---- GcsConnection (no-op) ----
  async open(): Promise<void> {}
  async close(): Promise<void> {}
  onConnected(): () => void { return () => {}; }
  onStatusText(): () => void { return () => {}; }
  async arm(): Promise<void> {}
  async disarm(): Promise<void> {}
  async setMode(): Promise<void> {}
  commandLong(): void {}
  sendMessage(): void {}
  subscribeMessage(_msgid: number, _cb: (f: DecodedFields) => void): () => void { return () => {}; }
  async downloadMission(): Promise<RawMissionItem[]> { return []; }
  async uploadMission(): Promise<number> { return 0; }
  async downloadParams(): Promise<ParamEntry[]> { return []; }
  async setParam(): Promise<number> { return 0; }
}
