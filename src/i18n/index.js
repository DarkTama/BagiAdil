/**
 * i18n controller module.
 * Manages translations and locale switching.
 */

import id from './id.js';
import en from './en.js';

const translations = { id, en };
let currentLocale = localStorage.getItem('bagiadil-lang') || 'id';

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
    localStorage.setItem('bagiadil-lang', locale);
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
