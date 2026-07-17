// Ana thread <-> Web Worker mesaj protokolu ve ortak baglanti arayuzu.
import type { VehicleTelemetry, RawMissionItem, ParamEntry, FtpEntry } from '@wmp/protocol';

export type DecodedFields = Record<string, number | bigint | string | Array<number | bigint>>;

export interface GcsConnection {
  readonly telemetry: VehicleTelemetry;
  open(): Promise<void>;
  close(): Promise<void>;
  onConnected(cb: (sysid: number, compid: number) => void): () => void;
  onStatusText(cb: (severity: number, text: string) => void): () => void;
  arm(force?: boolean): Promise<void>;
  disarm(force?: boolean): Promise<void>;
  setMode(customMode: number): Promise<void>;
  commandLong(command: number, params: number[]): void;
  subscribeMessage(msgid: number, cb: (fields: DecodedFields) => void): () => void;
  sendMessage(msgid: number, fields: Record<string, number | bigint | string>): void;
  downloadMission(onProgress?: (received: number, total: number) => void, missionType?: number): Promise<RawMissionItem[]>;
  uploadMission(items: RawMissionItem[], onProgress?: (sent: number, total: number) => void, missionType?: number): Promise<number>;
  downloadParams(onProgress?: (received: number, total: number) => void): Promise<ParamEntry[]>;
  setParam(name: string, value: number, type: number): Promise<number>;
  listDirectory?(path: string): Promise<FtpEntry[]>;
  downloadFile?(path: string, onProgress?: (received: number, total: number) => void): Promise<Uint8Array>;
}

export type MainToWorker =
  | { type: 'config'; gcsSystemId?: number; gcsComponentId?: number; requestStreamHz?: number; heartbeatHz?: number }
  | { type: 'rx'; bytes: Uint8Array }
  | { type: 'arm'; force: boolean }
  | { type: 'disarm'; force: boolean }
  | { type: 'setMode'; customMode: number }
  | { type: 'command'; command: number; params: number[] }
  | { type: 'sendMessage'; msgid: number; fields: Record<string, number | bigint | string> }
  | { type: 'subscribe'; msgid: number }
  | { type: 'unsubscribe'; msgid: number }
  | { type: 'downloadMission'; reqId: number; missionType: number }
  | { type: 'uploadMission'; reqId: number; items: RawMissionItem[]; missionType: number }
  | { type: 'downloadParams'; reqId: number }
  | { type: 'setParam'; reqId: number; name: string; value: number; ptype: number }
  | { type: 'ftpList'; reqId: number; path: string }
  | { type: 'ftpRead'; reqId: number; path: string }
  | { type: 'close' };

export type WorkerToMain =
  | { type: 'tx'; bytes: Uint8Array }
  | { type: 'telemetry'; snapshot: VehicleTelemetry }
  | { type: 'connected'; sysid: number; compid: number }
  | { type: 'statustext'; severity: number; text: string }
  | { type: 'message'; msgid: number; fields: DecodedFields }
  | { type: 'missionProgress'; reqId: number; received: number; total: number }
  | { type: 'missionResult'; reqId: number; ok: boolean; items?: RawMissionItem[]; result?: number; error?: string }
  | { type: 'paramProgress'; reqId: number; received: number; total: number }
  | { type: 'paramResult'; reqId: number; ok: boolean; params?: ParamEntry[]; value?: number; error?: string }
  | { type: 'ftpProgress'; reqId: number; received: number; total: number }
  | { type: 'ftpListResult'; reqId: number; ok: boolean; entries?: FtpEntry[]; error?: string }
  | { type: 'ftpReadResult'; reqId: number; ok: boolean; bytes?: Uint8Array; error?: string };
