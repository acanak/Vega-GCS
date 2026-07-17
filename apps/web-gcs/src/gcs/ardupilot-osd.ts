// ArduPilot AP_OSD referansi (Copter/Plane 4.5). 3 bagimsiz ajan + kaynak dogrulamasi.
// Param deseni: OSD<ekran>_<TOKEN>_EN / _X / _Y  (ekran 1..4)
// Yazim tuzaklari: BAT_VOLT (BATVOLT degil), HEADING, FLTIME (tek T), CRSSHAIR (cift S),
// BAT2_VLT, BATUSED/BAT2USED (alt cizgisiz), VTX_PWR, TER_HGT.

export interface OsdElement { token: string; label: string; cond?: boolean; }

/** Konumlanabilir OSD ogeleri (59 cekirdek + 6 kosullu RC link-stat). */
export const OSD_ELEMENTS: readonly OsdElement[] = [
  { token: 'ALTITUDE', label: "İrtifa (home'a göre)" },
  { token: 'BAT_VOLT', label: 'Batarya 1 voltaj' },
  { token: 'AVGCELLV', label: 'Ortalama hücre voltajı' },
  { token: 'RESTVOLT', label: 'Dinlenme voltajı (sag-telafili)' },
  { token: 'CELLVOLT', label: 'Hücre voltajı' },
  { token: 'ACRVOLT', label: 'Ort. hücre dinlenme voltajı' },
  { token: 'CURRENT', label: 'Batarya 1 akım' },
  { token: 'BATUSED', label: 'Tüketilen kapasite (mAh)' },
  { token: 'BATTBAR', label: 'Batarya bar göstergesi' },
  { token: 'POWER', label: 'Güç (W)' },
  { token: 'RSSI', label: 'RC RSSI' },
  { token: 'SATS', label: 'GPS uydu sayısı' },
  { token: 'HDOP', label: 'GPS HDOP' },
  { token: 'GPSLAT', label: 'GPS enlem' },
  { token: 'GPSLONG', label: 'GPS boylam' },
  { token: 'FLTMODE', label: 'Uçuş modu' },
  { token: 'MESSAGE', label: 'Durum mesajı' },
  { token: 'GSPEED', label: 'Yer hızı' },
  { token: 'ASPEED', label: 'Hava hızı (birincil)' },
  { token: 'ASPD1', label: 'Hava hızı sensör 1' },
  { token: 'ASPD2', label: 'Hava hızı sensör 2' },
  { token: 'VSPEED', label: 'Dikey hız' },
  { token: 'HORIZON', label: 'Yapay ufuk' },
  { token: 'SIDEBARS', label: 'Kenar cetvelleri (hız/irtifa)' },
  { token: 'CRSSHAIR', label: 'Artı nişan' },
  { token: 'HEADING', label: 'Yön (derece)' },
  { token: 'COMPASS', label: 'Pusula şeridi' },
  { token: 'HOME', label: 'Home ok + mesafe' },
  { token: 'HOMEDIST', label: 'Home mesafe' },
  { token: 'HOMEDIR', label: 'Home yön oku' },
  { token: 'WAYPOINT', label: 'Sonraki WP ok + mesafe' },
  { token: 'XTRACK', label: 'Rota sapması (xtrack)' },
  { token: 'DIST', label: 'Toplam katedilen mesafe' },
  { token: 'THROTTLE', label: 'Gaz %' },
  { token: 'ROLL', label: 'Yalpa açısı' },
  { token: 'PITCH', label: 'Yunuslama açısı' },
  { token: 'WIND', label: 'Rüzgar hız/yön' },
  { token: 'TEMP', label: 'Baro sıcaklık' },
  { token: 'BTEMP', label: '2. baro sıcaklık' },
  { token: 'ATEMP', label: 'Hava hızı sensör sıcaklık' },
  { token: 'ESCTEMP', label: 'ESC sıcaklık' },
  { token: 'ESCRPM', label: 'ESC RPM' },
  { token: 'ESCAMPS', label: 'ESC akım' },
  { token: 'RPM', label: 'RPM sensörü', cond: true },
  { token: 'FLTIME', label: 'Uçuş süresi' },
  { token: 'CLK', label: 'Saat' },
  { token: 'STATS', label: 'Uçuş sonrası istatistik' },
  { token: 'CLIMBEFF', label: 'Tırmanma verimi' },
  { token: 'EFF', label: 'Verim (mAh/km)' },
  { token: 'ARMING', label: 'Arm durumu' },
  { token: 'FENCE', label: 'Fence durumu' },
  { token: 'RNGF', label: 'Mesafe sensörü' },
  { token: 'TER_HGT', label: 'Araziye göre yükseklik', cond: true },
  { token: 'BAT2_VLT', label: 'Batarya 2 voltaj' },
  { token: 'BAT2USED', label: 'Batarya 2 mAh' },
  { token: 'CURRENT2', label: 'Batarya 2 akım' },
  { token: 'VTX_PWR', label: 'VTX gücü' },
  { token: 'PLUSCODE', label: 'Plus Code (OLC)', cond: true },
  { token: 'CALLSIGN', label: 'Çağrı işareti' },
  // Kosullu RC link-stat blogu (AP_OSD_EXTENDED_LNK_STATS + CRSF; firmware'de olmayabilir)
  { token: 'LINK_Q', label: 'RC link kalitesi', cond: true },
  { token: 'RSSIDBM', label: 'RC RSSI (dBm)', cond: true },
  { token: 'RC_SNR', label: 'CRSF SNR', cond: true },
  { token: 'RC_ANT', label: 'CRSF aktif anten', cond: true },
  { token: 'RC_LQ', label: 'CRSF link kalitesi', cond: true },
  { token: 'RC_PWR', label: 'RC/CRSF TX gücü', cond: true },
];

export interface Code { code: number; label: string; }

/** OSD_TYPE. Editör yalnız 1 (analog) ve 5 (HD DisplayPort) için öge konumlar. */
export const OSD_TYPES: readonly Code[] = [
  { code: 0, label: 'Yok' },
  { code: 1, label: 'MAX7456 (Analog SD)' },
  { code: 5, label: 'MSP DisplayPort (HD)' },
  { code: 3, label: 'MSP (telemetri)' },
  { code: 2, label: 'SITL' },
  { code: 4, label: 'Yalnızca TX' },
];

export const OSD_UNITS: readonly Code[] = [
  { code: 0, label: 'Metrik' },
  { code: 1, label: 'İmperyal' },
  { code: 2, label: 'SI' },
  { code: 3, label: 'Havacılık' },
];

/** MSP DisplayPort (HD gözlük) için serial port protokolü. */
export const SERIAL_PROTO_MSP_DISPLAYPORT = 42;
export const SERIAL_PROTO_MSP = 32;
export const SERIAL_BAUD_115200 = 115; // SERIALx_BAUD alanı kod saklar: 115 = 115200

/** Yaygın OSD uyarı eşikleri (OSD_W_*). */
export const OSD_WARN: readonly Code[] = [
  { code: 0, label: 'OSD_W_BATVOLT' },
  { code: 0, label: 'OSD_W_AVGCELLV' },
  { code: 0, label: 'OSD_W_RSSI' },
  { code: 0, label: 'OSD_W_NSAT' },
];

/** Ekran çözünürlüğü OSD<n>_TXT_RES; grid boyutunu belirler. */
export interface OsdRes { code: number; label: string; cols: number; rows: number; }
export const OSD_RES: readonly OsdRes[] = [
  { code: 0, label: 'SD 30×16', cols: 30, rows: 16 },
  { code: 1, label: 'HD 50×18', cols: 50, rows: 18 },
  { code: 2, label: 'HD 60×22 (4.6+)', cols: 60, rows: 22 },
];
