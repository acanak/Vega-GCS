import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ThemeProvider } from './gcs/theme';
import { I18nProvider } from './gcs/i18n';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root bulunamadi');
createRoot(rootEl).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
