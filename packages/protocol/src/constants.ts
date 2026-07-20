// MAVLink sabitleri ve mesaj kimlikleri (Faz 1 alt kumesi).

// crc_extra artik tools/mavgen ile uretilen TAM diyalektten geliyor (297 mesaj).
export { crcExtraFor } from '@wmp/mavlink-codec';

export const MSG = {
  HEARTBEAT: 0,
  SYS_STATUS: 1,
  GPS_RAW_INT: 24,
  ATTITUDE: 30,
  GLOBAL_POSITION_INT: 33,
  NAV_CONTROLLER_OUTPUT: 62,
  REQUEST_DATA_STREAM: 66,
  VFR_HUD: 74,
  RADIO_STATUS: 109,
  SET_POSITION_TARGET_GLOBAL_INT: 86,
  FILE_TRANSFER_PROTOCOL: 110,
  COMMAND_LONG: 76,
  COMMAND_ACK: 77,
  STATUSTEXT: 253,
  MISSION_REQUEST_LIST: 43,
  MISSION_COUNT: 44,
  MISSION_REQUEST: 40,
  MISSION_REQUEST_INT: 51,
  MISSION_ITEM_INT: 73,
  MISSION_ACK: 47,
  PARAM_REQUEST_READ: 20,
  PARAM_REQUEST_LIST: 21,
  PARAM_VALUE: 22,
  PARAM_SET: 23,
  MAG_CAL_PROGRESS: 191,
  MAG_CAL_REPORT: 192,
  RAW_IMU: 27,
  SCALED_IMU2: 116,
  SCALED_IMU3: 129,
  RC_CHANNELS: 65,
  RC_CHANNELS_OVERRIDE: 70,
  ADSB_VEHICLE: 246,
  SERVO_OUTPUT_RAW: 36,
  EKF_STATUS_REPORT: 193,
  VIBRATION: 241,
  DISTANCE_SENSOR: 132,
} as const;

// Kimlik ve enum sabitleri
export const GCS_SYSTEM_ID = 255;
export const MAV_COMP_ID_MISSIONPLANNER = 190;

export const MAV_TYPE_GCS = 6;
export const MAV_AUTOPILOT_INVALID = 8;
export const MAV_STATE_ACTIVE = 4;

export const MAV_MODE_FLAG_SAFETY_ARMED = 0x80;
export const MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 0x01;

export const MAV_CMD_COMPONENT_ARM_DISARM = 400;
export const MAV_CMD_DO_SET_MODE = 176;
export const MAV_CMD_PREFLIGHT_CALIBRATION = 241;
export const MAV_CMD_DO_START_MAG_CAL = 42424;
export const MAV_CMD_DO_ACCEPT_MAG_CAL = 42425;
export const MAV_CMD_DO_CANCEL_MAG_CAL = 42426;
export const MAV_CMD_ACCELCAL_VEHICLE_POS = 42429;
export const MAV_CMD_SET_MESSAGE_INTERVAL = 511;

// ACCELCAL_VEHICLE_POS konumlari
export const ACCELCAL_POS: Readonly<Record<number, string>> = {
  1: 'LEVEL', 2: 'SOL', 3: 'SAĞ', 4: 'BURUN AŞAĞI', 5: 'BURUN YUKARI', 6: 'SIRT ÜSTÜ',
  16777215: 'BAŞARILI', 16777216: 'BAŞARISIZ',
};

// MAG_CAL_STATUS
export const MAG_CAL_STATUS: Readonly<Record<number, string>> = {
  0: 'Başlamadı', 1: 'Bekliyor', 2: 'Adım 1', 3: 'Adım 2', 4: 'Başarılı', 5: 'Başarısız', 6: 'Kötü yön', 7: 'Kötü yarıçap',
};
export const ARM_FORCE_MAGIC = 21196;

export const MAV_DATA_STREAM_ALL = 0;

// ArduCopter ucus modu numaralari (custom_mode) - UI icin kucuk harita.
export const COPTER_MODES: Readonly<Record<number, string>> = {
  0: 'STABILIZE',
  1: 'ACRO',
  2: 'ALT_HOLD',
  3: 'AUTO',
  4: 'GUIDED',
  5: 'LOITER',
  6: 'RTL',
  7: 'CIRCLE',
  9: 'LAND',
  16: 'POSHOLD',
  17: 'BRAKE',
  20: 'GUIDED_NOGPS',
  21: 'SMART_RTL',
  23: 'AUTOTUNE',
};
export const COPTER_MODE_IDS: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(COPTER_MODES).map(([id, name]) => [name, Number(id)]),
);

// ArduPlane ucus modlari (kaynak: ArduPlane/mode.h). FBWA/FBWB gorunen adlar.
export const PLANE_MODES: Readonly<Record<number, string>> = {
  0: 'MANUAL', 1: 'CIRCLE', 2: 'STABILIZE', 3: 'TRAINING', 4: 'ACRO',
  5: 'FBWA', 6: 'FBWB', 7: 'CRUISE', 8: 'AUTOTUNE', 10: 'AUTO', 11: 'RTL',
  12: 'LOITER', 13: 'TAKEOFF', 14: 'AVOID_ADSB', 15: 'GUIDED', 16: 'INITIALISING',
  17: 'QSTABILIZE', 18: 'QHOVER', 19: 'QLOITER', 20: 'QLAND', 21: 'QRTL',
  22: 'QAUTOTUNE', 23: 'QACRO', 24: 'THERMAL', 25: 'LOITER_ALT_QLAND',
};
export const PLANE_MODE_IDS: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(PLANE_MODES).map(([id, name]) => [name, Number(id)]),
);

// ArduPilot Rover ucus modlari (kaynak: Rover mode.h)
export const ROVER_MODES: Readonly<Record<number, string>> = {
  0: 'MANUAL', 1: 'ACRO', 3: 'STEERING', 4: 'HOLD', 5: 'LOITER', 6: 'FOLLOW',
  7: 'SIMPLE', 10: 'AUTO', 11: 'RTL', 12: 'SMART_RTL', 15: 'GUIDED', 16: 'INITIALISING',
};
export const ROVER_MODE_IDS: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(ROVER_MODES).map(([id, name]) => [name, Number(id)]),
);

// MAV_TYPE -> arac sinifi. Plane: FIXED_WING(1) + VTOL(19..25). Rover: 10,11. Digerleri kopter.
const PLANE_TYPES = new Set([1, 19, 20, 21, 22, 23, 24, 25]);
const ROVER_TYPES = new Set([10, 11]);
export type FrameClass = 'copter' | 'plane' | 'rover';
export function frameClass(mavType: number): FrameClass {
  if (PLANE_TYPES.has(mavType)) return 'plane';
  if (ROVER_TYPES.has(mavType)) return 'rover';
  return 'copter';
}
/** Arac tipine gore mod haritasi (id -> ad). */
export function vehicleModes(mavType: number): Readonly<Record<number, string>> {
  const c = frameClass(mavType);
  return c === 'plane' ? PLANE_MODES : c === 'rover' ? ROVER_MODES : COPTER_MODES;
}
/** Arac tipine gore mod adi -> id. */
export function vehicleModeIds(mavType: number): Readonly<Record<string, number>> {
  const c = frameClass(mavType);
  return c === 'plane' ? PLANE_MODE_IDS : c === 'rover' ? ROVER_MODE_IDS : COPTER_MODE_IDS;
}
/** Arac tipine gore mod adi (gosterim). */
export function modeName(mavType: number, customMode: number): string {
  return vehicleModes(mavType)[customMode] ?? ('MODE ' + customMode);
}
/** Hizli mod dugmeleri (arac tipine gore uygun kisayollar). */
export function quickModes(mavType: number): string[] {
  const c = frameClass(mavType);
  if (c === 'plane') return ['RTL', 'LOITER', 'AUTO', 'FBWA', 'QLAND'];
  if (c === 'rover') return ['RTL', 'HOLD', 'AUTO'];
  return ['RTL', 'LAND', 'LOITER'];
}
