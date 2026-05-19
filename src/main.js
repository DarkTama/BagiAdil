import './styles/main.css';
import { initApp } from './ui/app.js';

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// App initialization
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});
