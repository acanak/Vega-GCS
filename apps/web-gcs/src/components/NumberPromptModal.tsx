import { useT } from '../gcs/i18n';

interface Props {
  title: string;
  message?: string;
  label: string;
  unit?: string;
  value: number;
  onValue: (n: number) => void;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Ortak onay/sayı-giriş modalı: bir değer sorar ve final konfirmasyon ister. */
export function NumberPromptModal({ title, message, label, unit = 'm', value, onValue, confirmLabel, danger, onConfirm, onClose }: Props) {
  const t = useT();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">{title}</div>
        {message && <div className="modal-msg">{message}</div>}
        <label className="modal-field">
          <span>{label}</span>
          <span className="modal-input">
            <input
              type="number"
              autoFocus
              value={value}
              onChange={(e) => onValue(Number(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); else if (e.key === 'Escape') onClose(); }}
            />
            <span className="p-units">{unit}</span>
          </span>
        </label>
        <div className="modal-ft">
          <button className="btn-ghost" onClick={onClose}>{t('İptal')}</button>
          <button className={danger ? 'btn-arm' : 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
