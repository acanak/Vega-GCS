// ArduPilot alt-sistem param değerleri (SITL kaynağından: AP_GPS, AP_Mount, AP_ADSB, AP_OpticalFlow).
// param-meta PX4 tabanlı olduğundan ArduPilot değerleri burada tutulur.
import type { CodeLabel } from './ardupilot-rc';

export interface CfgField { name: string; label: string; values?: readonly CodeLabel[]; bool?: boolean; unit?: string }

const GPS_TYPE: readonly CodeLabel[] = [
  { code: 0, label: 'None' }, { code: 1, label: 'AUTO' }, { code: 2, label: 'uBlox' }, { code: 5, label: 'NMEA' },
  { code: 6, label: 'SiRF' }, { code: 8, label: 'SwiftNav' }, { code: 9, label: 'DroneCAN' }, { code: 10, label: 'SBF' },
  { code: 11, label: 'GSOF' }, { code: 13, label: 'ERB' }, { code: 14, label: 'MAV' }, { code: 15, label: 'NOVA' },
  { code: 16, label: 'HemisphereNMEA' }, { code: 17, label: 'uBlox MB Base' }, { code: 18, label: 'uBlox MB Rover' },
  { code: 19, label: 'MSP' }, { code: 20, label: 'AllyStar' }, { code: 21, label: 'ExternalAHRS' },
  { code: 22, label: 'DroneCAN MB Base' }, { code: 23, label: 'DroneCAN MB Rover' }, { code: 24, label: 'UnicoreNMEA' },
  { code: 25, label: 'Unicore MB NMEA' },
];
const GPS_AUTO_SWITCH: readonly CodeLabel[] = [
  { code: 0, label: 'Use primary' }, { code: 1, label: 'Use best' }, { code: 2, label: 'Blend' }, { code: 4, label: 'Primary if 3D fix' },
];
const GPS_PRIMARY: readonly CodeLabel[] = [{ code: 0, label: 'First GPS' }, { code: 1, label: 'Second GPS' }];

const ADSB_TYPE: readonly CodeLabel[] = [
  { code: 0, label: 'Disabled' }, { code: 1, label: 'uAvionix-MAVLink' }, { code: 2, label: 'Sagetech' },
  { code: 3, label: 'uAvionix-UCP' }, { code: 4, label: 'Sagetech MX Series' },
];
const FLOW_TYPE: readonly CodeLabel[] = [
  { code: 0, label: 'None' }, { code: 1, label: 'PX4Flow' }, { code: 2, label: 'Pixart' }, { code: 3, label: 'Bebop' },
  { code: 4, label: 'CXOF' }, { code: 5, label: 'MAVLink' }, { code: 6, label: 'DroneCAN' }, { code: 7, label: 'MSP' }, { code: 8, label: 'UPFLOW' },
];

// Ekranlar yalnızca araçta VAR olan paramları gösterir → sürüm farkları için üst-küme listeler.
export const GPS_FIELDS: readonly CfgField[] = [
  { name: 'GPS_TYPE', label: 'GPS 1 type', values: GPS_TYPE },
  { name: 'GPS1_TYPE', label: 'GPS 1 type', values: GPS_TYPE },
  { name: 'GPS_TYPE2', label: 'GPS 2 type', values: GPS_TYPE },
  { name: 'GPS2_TYPE', label: 'GPS 2 type', values: GPS_TYPE },
  { name: 'GPS_AUTO_SWITCH', label: 'Auto switch / blend', values: GPS_AUTO_SWITCH },
  { name: 'GPS_PRIMARY', label: 'Primary GPS', values: GPS_PRIMARY },
  { name: 'GPS_RATE_MS', label: 'GPS 1 rate', unit: 'ms' },
  { name: 'GPS_RATE_MS2', label: 'GPS 2 rate', unit: 'ms' },
];
export const ADSB_FIELDS: readonly CfgField[] = [
  { name: 'ADSB_TYPE', label: 'ADS-B receiver', values: ADSB_TYPE },
  { name: 'ADSB_LIST_RADIUS', label: 'List radius', unit: 'm' },
  { name: 'ADSB_LIST_ALT', label: 'List altitude', unit: 'm' },
  { name: 'AVD_ENABLE', label: 'Avoidance enable', bool: true },
  { name: 'AVD_F_ACTION', label: 'Failsafe action' },
  { name: 'AVD_F_DIST_XY', label: 'Avoid distance XY', unit: 'm' },
  { name: 'AVD_F_DIST_Z', label: 'Avoid distance Z', unit: 'm' },
];
export const FLOW_FIELDS: readonly CfgField[] = [
  { name: 'FLOW_TYPE', label: 'Optical flow sensor', values: FLOW_TYPE },
  { name: 'FLOW_ORIENT_YAW', label: 'Sensor yaw orientation', unit: 'cdeg' },
  { name: 'FLOW_FXSCALER', label: 'X scale factor' }, { name: 'FLOW_FYSCALER', label: 'Y scale factor' },
  { name: 'FLOW_POS_X', label: 'Position X', unit: 'm' }, { name: 'FLOW_POS_Y', label: 'Position Y', unit: 'm' }, { name: 'FLOW_POS_Z', label: 'Position Z', unit: 'm' },
];

// Harmonic notch (INS_HNTCH_*) — gyro'ya ulaşan motor gürültüsünü hedefli süzer.
// ENABLE=1 yazılıp parametreler yeniden indirilene dek alt parametreler görünmez.
const HNTCH_MODE: readonly CodeLabel[] = [
  { code: 0, label: 'Fixed (sabit frekans)' }, { code: 1, label: 'Throttle' }, { code: 2, label: 'RPM sensor' },
  { code: 3, label: 'ESC telemetry' }, { code: 4, label: 'In-flight FFT' }, { code: 5, label: 'RPM sensor 2' },
];
export const NOTCH_FIELDS: readonly CfgField[] = [
  { name: 'INS_GYRO_FILTER', label: 'Gyro low-pass filter', unit: 'Hz' },
  { name: 'INS_HNTCH_ENABLE', label: 'Harmonic notch enable', bool: true },
  { name: 'INS_HNTCH_MODE', label: 'Frequency source', values: HNTCH_MODE },
  { name: 'INS_HNTCH_REF', label: 'Reference (hover throttle)' },
  { name: 'INS_HNTCH_FREQ', label: 'Base frequency', unit: 'Hz' },
  { name: 'INS_HNTCH_BW', label: 'Bandwidth', unit: 'Hz' },
  { name: 'INS_HNTCH_ATT', label: 'Attenuation', unit: 'dB' },
  { name: 'INS_HNTCH_HMNCS', label: 'Harmonics (bitmask)' },
  { name: 'INS_HNTCH_OPTS', label: 'Options (bitmask)' },
  { name: 'INS_HNTC2_ENABLE', label: '2nd notch enable', bool: true },
  { name: 'INS_HNTC2_MODE', label: '2nd frequency source', values: HNTCH_MODE },
  { name: 'INS_HNTC2_FREQ', label: '2nd base frequency', unit: 'Hz' },
  { name: 'INS_HNTC2_BW', label: '2nd bandwidth', unit: 'Hz' },
  { name: 'FFT_ENABLE', label: 'Gyro FFT enable', bool: true },
  { name: 'FFT_MINHZ', label: 'FFT min frequency', unit: 'Hz' },
  { name: 'FFT_MAXHZ', label: 'FFT max frequency', unit: 'Hz' },
];

// Landing gear (LGR_*) — iniş takımı servo kontrolü (SERVOn_FUNCTION = 29 Landing Gear).
const LGR_STARTUP: readonly CodeLabel[] = [
  { code: 0, label: 'Wait for pilot input' }, { code: 1, label: 'Retract' }, { code: 2, label: 'Deploy' },
];
export const LGR_FIELDS: readonly CfgField[] = [
  { name: 'LGR_ENABLE', label: 'Landing gear enable', bool: true },
  { name: 'LGR_STARTUP', label: 'Startup behaviour', values: LGR_STARTUP },
  { name: 'LGR_DEPLOY_ALT', label: 'Deploy below', unit: 'm' },
  { name: 'LGR_RETRACT_ALT', label: 'Retract above', unit: 'm' },
  { name: 'LGR_OPTIONS', label: 'Options (bitmask)' },
];
