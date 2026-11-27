/**
 * i18n controller module.
 * Manages translations and locale switching.
 */

import id from './id.js';
import en from './en.js';

const translations = { id, en };
let currentLocale = 'id';
try {
  currentLocale = localStorage.getItem('bagiadil-lang') || 'id';
} catch {
  // storage unavailable (private mode, non-DOM test env): stay on the default
}
if (!translations[currentLocale]) currentLocale = 'id';

function syncDocumentLang() {
  if (typeof document !== 'undefined') document.documentElement.lang = currentLocale;
}
syncDocumentLang();

/**
 * Get translation for a key in the current locale.
 * Falls back to Indonesian if key is missing in current locale.
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  return translations[currentLocale]?.[key] || translations.id[key] || key;
}

/**
 * Set the active locale.
 * @param {string} locale - 'id' or 'en'
 */
export function setLocale(locale) {
  if (translations[locale]) {
    currentLocale = locale;
    syncDocumentLang();
    try {
      localStorage.setItem('bagiadil-lang', locale);
    } catch {
      // ignore: the choice just won't persist
    }
    document.dispatchEvent(new CustomEvent('locale-changed', { detail: { locale } }));
  }
}

/**
 * Get the current locale.
 * @returns {string}
 */
export function getLocale() {
  return currentLocale;
}
