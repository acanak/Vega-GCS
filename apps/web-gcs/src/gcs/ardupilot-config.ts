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
