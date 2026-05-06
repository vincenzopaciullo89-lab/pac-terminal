// =============================================================================
// MAIN — Entry point (FINAL)
// =============================================================================

import { initApp } from './ui.js';
import { validateConfig } from './config.js';

if (!validateConfig()) {
  console.warn('Config validation failed. Verifica weights in config.js');
}

window.addEventListener('error', (e) => {
  console.error('[Global error]', e.error || e.message);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled promise]', e.reason);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
