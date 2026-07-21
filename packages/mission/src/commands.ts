// Desteklenen MAV_CMD alt kumesi + izgara icin parametre etiketleri.
// hasLocation: lat/lon/alt tasir. routable: harita rotasina dahil edilir.

export interface CmdDef {
  id: number;
  name: string;
  hasLocation: boolean;
  routable: boolean;
  params: [string, string, string, string]; // p1..p4 etiketleri ('' = kullanilmaz)
}

export const COMMANDS: readonly CmdDef[] = [
  { id: 16, name: 'WAYPOINT', hasLocation: true, routable: true, params: ['Bekleme (s)', 'Kabul yarıçapı', 'Geçiş yarıçapı', 'Yaw'] },
  { id: 22, name: 'TAKEOFF', hasLocation: true, routable: true, params: ['Pitch', '', '', 'Yaw'] },
  { id: 21, name: 'LAND', hasLocation: true, routable: true, params: ['Abort irtifa', 'Hassas iniş', '', 'Yaw'] },
  { id: 20, name: 'RETURN_TO_LAUNCH', hasLocation: false, routable: false, params: ['', '', '', ''] },
  { id: 17, name: 'LOITER_UNLIM', hasLocation: true, routable: true, params: ['', '', 'Yarıçap', 'Yaw'] },
  { id: 18, name: 'LOITER_TURNS', hasLocation: true, routable: true, params: ['Tur', '', 'Yarıçap', 'Yaw'] },
  { id: 19, name: 'LOITER_TIME', hasLocation: true, routable: true, params: ['Süre (s)', '', 'Yarıçap', 'Yaw'] },
  { id: 31, name: 'LOITER_TO_ALT', hasLocation: true, routable: true, params: ['Yön (0/1)', '', 'Yarıçap', ''] },
  { id: 189, name: 'DO_LAND_START', hasLocation: true, routable: false, params: ['', '', '', ''] },
  { id: 82, name: 'SPLINE_WAYPOINT', hasLocation: true, routable: true, params: ['Bekleme (s)', '', '', ''] },
  { id: 201, name: 'DO_SET_ROI', hasLocation: true, routable: false, params: ['', '', '', ''] },
  { id: 177, name: 'DO_JUMP', hasLocation: false, routable: false, params: ['WP no', 'Tekrar', '', ''] },
  { id: 178, name: 'DO_CHANGE_SPEED', hasLocation: false, routable: false, params: ['Tip', 'Hız (m/s)', 'Gaz %', ''] },
  { id: 183, name: 'DO_SET_SERVO', hasLocation: false, routable: false, params: ['Kanal', 'PWM', '', ''] },
  { id: 206, name: 'DO_SET_CAM_TRIGG_DIST', hasLocation: false, routable: false, params: ['Mesafe (m)', '', '', ''] },
  { id: 112, name: 'CONDITION_DELAY', hasLocation: false, routable: false, params: ['Süre (s)', '', '', ''] },
];

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));
export const cmdDef = (id: number): CmdDef | undefined => BY_ID.get(id);
export const cmdName = (id: number): string => BY_ID.get(id)?.name ?? 'CMD ' + id;
export const cmdHasLocation = (id: number): boolean => BY_ID.get(id)?.hasLocation ?? false;
export const cmdRoutable = (id: number): boolean => BY_ID.get(id)?.routable ?? false;

// Mission tipleri ve geofence/rally komutlari
export const MAV_MISSION_TYPE = { MISSION: 0, FENCE: 1, RALLY: 2 } as const;
export const CMD_FENCE_RETURN_POINT = 5000;
export const CMD_FENCE_POLYGON_INCLUSION = 5001;
export const CMD_FENCE_POLYGON_EXCLUSION = 5002;
export const CMD_FENCE_CIRCLE_INCLUSION = 5003;
export const CMD_FENCE_CIRCLE_EXCLUSION = 5004;
export const CMD_NAV_RALLY_POINT = 5100;
