// =============================================================================
// MAIN — Entry point
// =============================================================================
// Inizializza l'app dopo DOM ready. Gestione errori globale.
// =============================================================================

import { initApp } from './ui.js';
import { validateConfig } from './config.js';

// Validazione config
if (!validateConfig()) {
  console.warn('Config validation failed. Verifica weights in config.js');
}

// Error handler globale
window.addEventListener('error', (e) => {
  console.error('[Global error]', e.error || e.message);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled promise]', e.reason);
});

// Init quando DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
