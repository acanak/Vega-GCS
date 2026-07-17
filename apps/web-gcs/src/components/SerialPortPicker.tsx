import { useEffect, useState } from 'react';
import { useT } from '../gcs/i18n';

interface DesktopPort { portId: string; portName?: string; displayName?: string; vendorId?: number; productId?: number; serialNumber?: string }
interface DesktopSerial {
  onPorts: (cb: (ports: DesktopPort[]) => void) => () => void;
  choose: (portId: string) => void;
  cancel: () => void;
}
declare global {
  interface Window { vegaDesktop?: { isDesktop?: boolean; platform?: string; serial?: DesktopSerial } }
}

const hex = (n?: number): string => (n ?? 0).toString(16).padStart(4, '0');

/**
 * Masaüstü (Electron) için WebSerial port seçici. Tarayıcıda kendi seçicisi olduğundan
 * bu bileşen yalnızca window.vegaDesktop varsa etkinleşir; aksi halde hiçbir şey yapmaz.
 */
export function SerialPortPicker() {
  const t = useT();
  const [ports, setPorts] = useState<DesktopPort[] | null>(null);

  useEffect(() => {
    const s = window.vegaDesktop?.serial;
    if (!s) return;
    return s.onPorts((list) => setPorts(list));
  }, []);

  if (!ports) return null;

  const pick = (portId: string): void => { window.vegaDesktop?.serial?.choose(portId); setPorts(null); };
  const cancel = (): void => { window.vegaDesktop?.serial?.cancel(); setPorts(null); };

  return (
    <div className="serial-picker-overlay" onClick={cancel}>
      <div className="serial-picker" onClick={(e) => e.stopPropagation()}>
        <div className="serial-picker-hd">{t('Seri port seç')}</div>
        {ports.length === 0
          ? <div className="serial-picker-empty">{t('Bağlı seri aygıt yok. Otopilotu/bootloader\'ı USB ile bağlayın; liste otomatik güncellenir.')}</div>
          : <ul className="serial-picker-list">
              {ports.map((p) => (
                <li key={p.portId}>
                  <button onClick={() => pick(p.portId)}>
                    <span className="sp-name">{p.displayName || p.portName || p.portId}</span>
                    {p.vendorId != null && <span className="sp-id">{hex(p.vendorId)}:{hex(p.productId)}</span>}
                  </button>
                </li>
              ))}
            </ul>}
        <div className="serial-picker-ft"><button className="btn-ghost" onClick={cancel}>{t('İptal')}</button></div>
      </div>
    </div>
  );
}
