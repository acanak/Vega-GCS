// Uretilmis diyalekti disa acan cephe. Kaynak: tools/mavgen (bkz. dialect.generated.ts).
import { CRC_EXTRA, MESSAGE_NAMES, MESSAGE_IDS, MESSAGES } from './dialect.generated';
import type { DialectField, DialectMessage } from './dialect.generated';

export { CRC_EXTRA, MESSAGE_NAMES, MESSAGE_IDS, MESSAGES };
export type { DialectField, DialectMessage };

/** MavlinkParser'a verilecek crc_extra arama fonksiyonu. */
export const crcExtraFor = (msgid: number): number | undefined => CRC_EXTRA[msgid];
export const messageNameFor = (msgid: number): string | undefined => MESSAGE_NAMES[msgid];
