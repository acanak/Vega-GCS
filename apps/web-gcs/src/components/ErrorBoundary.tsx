import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { translate as t } from '../gcs/i18n';

// Görünüm düzeyi hata sınırı: bir ekranda fırlayan render hatası tüm uygulamayı
// (ve aktif telemetri bağlantısını!) düşürmesin. Hata yalnız o görünümü kapatır;
// diğer sekmeler ve MAVLink bağlantısı çalışmaya devam eder.

interface Props { name: string; children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Debug için konsola tam iz; telemetri kaydı gibi kritik yollar etkilenmez.
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="view-error">
          <div className="card">
            <div className="card-hd"><h2>⚠ {t('Ekran hatası')} · {this.props.name}</h2></div>
            <div className="card-body setup-body">
              <p className="setup-desc">{t('Bu ekran bir hatayla karşılaştı; uygulamanın kalanı ve bağlantı çalışmaya devam ediyor.')}</p>
              <pre className="err-text" style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{this.state.error.message}</pre>
              <div>
                <button className="btn-primary" onClick={() => this.setState({ error: null })}>{t('Yeniden dene')}</button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
