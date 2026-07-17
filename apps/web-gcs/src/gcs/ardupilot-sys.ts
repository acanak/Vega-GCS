// SYS_STATUS sensor bitleri — YETKILI kaynak: tools/mavgen/message_definitions/common.xml
// (MAV_SYS_STATUS_SENSOR enum, otomatik cikarildi).
export interface SysSensor { bit: number; name: string; tr: string; }
export const SYS_SENSORS: readonly SysSensor[] = [
  { bit: 0, name: '3D_GYRO', tr: 'Jiroskop' },
  { bit: 1, name: '3D_ACCEL', tr: 'İvmeölçer' },
  { bit: 2, name: '3D_MAG', tr: 'Pusula' },
  { bit: 3, name: 'ABSOLUTE_PRESSURE', tr: 'Barometre' },
  { bit: 4, name: 'DIFFERENTIAL_PRESSURE', tr: 'Pitot (hız)' },
  { bit: 5, name: 'GPS', tr: 'GPS' },
  { bit: 6, name: 'OPTICAL_FLOW', tr: 'Optik akış' },
  { bit: 7, name: 'VISION_POSITION', tr: 'Görsel konum' },
  { bit: 8, name: 'LASER_POSITION', tr: 'Lazer irtifa' },
  { bit: 9, name: 'EXTERNAL_GROUND_TRUTH', tr: 'EXTERNAL_GROUND_TRUTH' },
  { bit: 10, name: 'ANGULAR_RATE_CONTROL', tr: 'Açısal hız kontrol' },
  { bit: 11, name: 'ATTITUDE_STABILIZATION', tr: 'Attitude stab.' },
  { bit: 12, name: 'YAW_POSITION', tr: 'Yaw kontrol' },
  { bit: 13, name: 'Z_ALTITUDE_CONTROL', tr: 'İrtifa kontrol' },
  { bit: 14, name: 'XY_POSITION_CONTROL', tr: 'XY konum kontrol' },
  { bit: 15, name: 'MOTOR_OUTPUTS', tr: 'Motor çıkışı' },
  { bit: 16, name: 'RC_RECEIVER', tr: 'RC alıcı' },
  { bit: 17, name: '3D_GYRO2', tr: 'Jiroskop 2' },
  { bit: 18, name: '3D_ACCEL2', tr: 'İvmeölçer 2' },
  { bit: 19, name: '3D_MAG2', tr: 'Pusula 2' },
  { bit: 20, name: 'GEOFENCE', tr: 'Geofence' },
  { bit: 21, name: 'AHRS', tr: 'AHRS' },
  { bit: 22, name: 'TERRAIN', tr: 'Arazi' },
  { bit: 23, name: 'REVERSE_MOTOR', tr: 'Ters motor' },
  { bit: 24, name: 'LOGGING', tr: 'Kayıt' },
  { bit: 25, name: 'BATTERY', tr: 'Batarya' },
  { bit: 26, name: 'PROXIMITY', tr: 'Proximity' },
  { bit: 27, name: 'SATCOM', tr: 'SatCom' },
  { bit: 28, name: 'PREARM_CHECK', tr: 'Ön-arm kontrolü' },
  { bit: 29, name: 'OBSTACLE_AVOIDANCE', tr: 'Engelden kaçınma' },
  { bit: 30, name: 'PROPULSION', tr: 'İtki' },
];

// BATT_MONITOR — yaygin/emin olunan degerler (digerleri sayisal gosterilir).
export interface CodeLabel { code: number; label: string; }
export const BATT_MONITOR_OPTIONS: readonly CodeLabel[] = [
  { code: 0, label: 'Devre dışı' },
  { code: 3, label: 'Analog: yalnız voltaj' },
  { code: 4, label: 'Analog: voltaj + akım' },
  { code: 7, label: 'SMBus (genel)' },
  { code: 8, label: 'DroneCAN / UAVCAN' },
  { code: 9, label: 'ESC telemetri' },
  { code: 10, label: 'Seçili monitörlerin toplamı' },
  { code: 20, label: 'INA2xx (I2C)' },
];
