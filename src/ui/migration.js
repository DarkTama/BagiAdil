/**
 * One-time localStorage import from the old GitHub Pages bridge via `#migrate=...`.
 * Runs at startup before draft restoration or shared-view handling.
 * Only accepts payloads whose referrer origin and `payload.from` match the
 * configured bridge origin, and only imports the explicit known app keys.
 */

import { decompressFromEncodedURIComponent } from 'lz-string';
import { t, setLocale } from '../i18n/index.js';
import { saveParticipants, mergeHistoryEntries, mergeGroups } from './storage.js';
import { showToast } from './toast.js';

const LOCALE_KEY = 'bagiadil-lang';
const HISTORY_KEY = 'bagiadil_history';
const GROUPS_KEY = 'bagiadil_groups';
const PARTICIPANTS_KEY = 'bagiadil_participants';

const COPY_IF_ABSENT_KEYS = new Set([
  'bagiadil_payment',
  'bagiadil_draft',
  'bagiadil_guide_seen',
]);

function parseOrigin(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

const ALLOWED_BRIDGE_ORIGIN = parseOrigin(
  import.meta.env.VITE_MIGRATE_FROM || 'https://darktama.github.io',
);
const NEW_DOMAIN_LABEL = 'bagiadil.darktama.dev';

// Per-page-load state for the migration banner (not persisted across reloads).
let activeBannerKey = null;
let noticeDismissed = false;

function isAllowedKey(key) {
  return key.startsWith('bagiadil_') || key === LOCALE_KEY;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.v !== 1) return false;
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    return false;
  }
  return Object.entries(payload.data).every(
    ([key, value]) => isAllowedKey(key) && typeof value === 'string',
  );
}

function stripMigrateFromHash() {
  const rawHash = (location.hash || '').replace(/^#/, '');
  const remaining = rawHash
    .split('&')
    .filter((part) => part && !part.startsWith('migrate='));
  const nextHash = remaining.length > 0 ? `#${remaining.join('&')}` : '';
  window.history.replaceState(null, '', location.pathname + location.search + nextHash);
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage may be unavailable - silently fail
  }
}

function applyMigratedData(data) {
  // Apply locale first so the success toast uses the migrated language if newly copied.
  if (LOCALE_KEY in data && safeGetItem(LOCALE_KEY) === null) {
    const locale = data[LOCALE_KEY];
    if (locale === 'id' || locale === 'en') {
      setLocale(locale);
    } else {
      safeSetItem(LOCALE_KEY, locale);
    }
  }

  for (const [key, rawValue] of Object.entries(data)) {
    if (key === HISTORY_KEY) {
      const parsed = safeParseJson(rawValue);
      if (Array.isArray(parsed)) mergeHistoryEntries(parsed);
      continue;
    }

    if (key === GROUPS_KEY) {
      const parsed = safeParseJson(rawValue);
      if (Array.isArray(parsed)) mergeGroups(parsed);
      continue;
    }

    if (key === PARTICIPANTS_KEY) {
      const parsed = safeParseJson(rawValue);
      if (Array.isArray(parsed)) {
        const names = parsed.filter((n) => typeof n === 'string' && n.trim());
        if (names.length > 0) saveParticipants(names);
      }
      continue;
    }

    if (COPY_IF_ABSENT_KEYS.has(key) && safeGetItem(key) === null) {
      safeSetItem(key, rawValue);
    }
  }
}

/**
 * Inspect `location.hash` for a `migrate=` payload, verify it originated from
 * the configured bridge origin, merge allowed keys into localStorage, remove
 * `migrate=...` from the URL while preserving `#share=...`, and warn on invalid
 * payloads.
 *
 * @returns {{ fromBridge: boolean, outcome: 'imported'|'nothing'|'invalid'|'rejected'|'none' }}
 */
export function importMigrationFromHash() {
  const referrerOrigin = parseOrigin(typeof document !== 'undefined' ? document.referrer : '');
  const fromBridge = Boolean(ALLOWED_BRIDGE_ORIGIN && referrerOrigin === ALLOWED_BRIDGE_ORIGIN);

  const rawHash = (location.hash || '').replace(/^#/, '');
  const parts = rawHash ? rawHash.split('&').filter(Boolean) : [];
  const migratePart = parts.find((part) => part.startsWith('migrate='));
  if (!migratePart) {
    return { fromBridge, outcome: fromBridge ? 'nothing' : 'none' };
  }

  const encoded = migratePart.slice('migrate='.length);
  stripMigrateFromHash();

  if (!fromBridge) {
    return { fromBridge: false, outcome: 'rejected' };
  }

  let payload = null;
  if (encoded) {
    try {
      const json = decompressFromEncodedURIComponent(encoded);
      if (json) payload = JSON.parse(json);
    } catch {
      payload = null;
    }
  }

  if (!validatePayload(payload)) {
    showToast(t('migration.invalid'), 'warning');
    return { fromBridge: true, outcome: 'invalid' };
  }

  if (typeof payload.from !== 'string' || payload.from !== ALLOWED_BRIDGE_ORIGIN) {
    return { fromBridge: true, outcome: 'rejected' };
  }

  applyMigratedData(payload.data);
  return { fromBridge: true, outcome: 'imported' };
}

function getNoticeSlot() {
  if (typeof document === 'undefined') return null;
  let slot = document.querySelector('#migration-notice');
  if (!slot) {
    const main = document.querySelector('main');
    if (!main) return null;
    slot = document.createElement('div');
    slot.id = 'migration-notice';
    slot.className = 'migration-notice';
    slot.hidden = true;
    main.prepend(slot);
  }
  return slot;
}

function appendTextWithBoldDomain(el, message) {
  const idx = message.indexOf(NEW_DOMAIN_LABEL);
  if (idx === -1) {
    el.textContent = message;
    return;
  }
  if (idx > 0) {
    el.appendChild(document.createTextNode(message.slice(0, idx)));
  }
  const strong = document.createElement('strong');
  strong.textContent = NEW_DOMAIN_LABEL;
  el.appendChild(strong);
  const tail = message.slice(idx + NEW_DOMAIN_LABEL.length);
  if (tail) {
    el.appendChild(document.createTextNode(tail));
  }
}

function renderNotice() {
  const slot = getNoticeSlot();
  if (!slot) return;
  slot.innerHTML = '';

  if (noticeDismissed || !activeBannerKey) {
    slot.hidden = true;
    return;
  }

  const banner = document.createElement('div');
  banner.className = 'migration-banner';
  banner.setAttribute('role', 'status');

  const body = document.createElement('div');
  body.className = 'migration-notice-body';

  const text = document.createElement('p');
  text.className = 'migration-notice-text';
  appendTextWithBoldDomain(text, t(activeBannerKey));
  body.appendChild(text);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'migration-notice-close';
  closeBtn.setAttribute('aria-label', t('migration.dismiss'));
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    noticeDismissed = true;
    renderNotice();
  });

  banner.appendChild(body);
  banner.appendChild(closeBtn);
  slot.appendChild(banner);
  slot.hidden = false;
}

/**
 * Initialize the top-of-page migration notice from `importMigrationFromHash` result.
 * @param {{ fromBridge: boolean, outcome: string }} migrationResult
 */
export function initMigrationNotice(migrationResult) {
  noticeDismissed = false;
  activeBannerKey = null;

  if (
    migrationResult &&
    migrationResult.fromBridge &&
    (migrationResult.outcome === 'imported' || migrationResult.outcome === 'nothing')
  ) {
    activeBannerKey =
      migrationResult.outcome === 'imported'
        ? 'migration.bannerImported'
        : 'migration.bannerNothing';
  }

  renderNotice();
}

/**
 * Re-render the active migration notice in the current locale.
 */
export function updateMigrationNoticeTranslations() {
  if (!noticeDismissed && activeBannerKey) {
    renderNotice();
  }
}
