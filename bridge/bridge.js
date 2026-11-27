import { buildMigrationHash, DEFAULT_MAX_HASH_LEN } from './migrate-core.js';

const TARGET = (import.meta.env.VITE_BRIDGE_TARGET || 'https://bagiadil.darktama.dev/').replace(
  /\/?$/,
  '/',
);
const MIGRATED_KEY = 'bagiadil_migrated';

function readStorageEntries() {
  try {
    const entries = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key !== null) {
        const value = localStorage.getItem(key);
        if (value !== null) entries.push([key, value]);
      }
    }
    return entries;
  } catch {
    return [];
  }
}

async function cleanupOrigin() {
  const tasks = [];
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
    tasks.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {}),
    );
  }
  if (typeof caches !== 'undefined' && caches.keys) {
    tasks.push(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {}),
    );
  }
  if (tasks.length === 0) return;
  await Promise.race([
    Promise.all(tasks),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
}

async function runBridge() {
  const fallbackLink = document.getElementById('target-link');
  if (fallbackLink) {
    fallbackLink.href = TARGET;
    fallbackLink.textContent = TARGET;
  }

  const entries = readStorageEntries();
  const hash = buildMigrationHash(entries, location.hash, DEFAULT_MAX_HASH_LEN);

  if (/(?:^|&)migrate=/.test(hash)) {
    try {
      localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
    } catch {
      // Storage may be unavailable or read-only; redirect regardless.
    }
  }

  await cleanupOrigin();
  location.replace(TARGET + (hash ? `#${hash}` : ''));
}

runBridge();
