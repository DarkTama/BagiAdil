import { compressToEncodedURIComponent } from 'lz-string';

export const DEFAULT_MAX_HASH_LEN = 1_500_000;

const LOCALE_KEY = 'bagiadil-lang';
const MIGRATED_KEY = 'bagiadil_migrated';
const DRAFT_KEY = 'bagiadil_draft';
const HISTORY_KEY = 'bagiadil_history';

/**
 * Extract `share=<value>` from a URL hash fragment if present.
 * @param {string} incomingHash
 * @returns {string}
 */
function extractSharePart(incomingHash) {
  const raw = String(incomingHash || '').replace(/^#/, '');
  const match = raw.match(/(?:^|&)share=([^&]+)/);
  return match ? `share=${match[1]}` : '';
}

/**
 * Check whether the incoming hash requests a forced resend (`#resend` or `&resend`).
 * @param {string} incomingHash
 * @returns {boolean}
 */
function hasResendPart(incomingHash) {
  const raw = String(incomingHash || '').replace(/^#/, '');
  return raw
    .split('&')
    .some((part) => part === 'resend' || part.startsWith('resend='));
}

/**
 * Collect BagiAdil keys from localStorage entries.
 * Excludes `bagiadil_migrated` and reports if already migrated.
 * @param {Array<[string, string]>|Record<string, string>} storageEntries
 * @returns {{ alreadyMigrated: boolean, data: Record<string, string> }}
 */
function collectMigratableData(storageEntries) {
  const entries = Array.isArray(storageEntries)
    ? storageEntries
    : Object.entries(storageEntries || {});

  let alreadyMigrated = false;
  const data = {};

  for (const pair of entries) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [key, value] = pair;
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    if (key === MIGRATED_KEY) {
      if (value) alreadyMigrated = true;
      continue;
    }
    if (key.startsWith('bagiadil_') || key === LOCALE_KEY) {
      data[key] = value;
    }
  }

  return { alreadyMigrated, data };
}

function joinHashParts(parts) {
  return parts.filter(Boolean).join('&');
}

/**
 * Build the URL hash (without leading `#`) for redirecting from the GitHub Pages
 * bridge to the new origin, carrying compressed localStorage data and/or any
 * incoming `#share=...` fragment.
 *
 * @param {Array<[string, string]>|Record<string, string>} storageEntries
 * @param {string} [incomingHash='']
 * @param {number} [maxLen=DEFAULT_MAX_HASH_LEN]
 * @param {{ from?: string, at?: number }} [meta={}]
 * @returns {string}
 */
export function buildMigrationHash(
  storageEntries,
  incomingHash = '',
  maxLen = DEFAULT_MAX_HASH_LEN,
  meta = {},
) {
  const sharePart = extractSharePart(incomingHash);
  const resend = hasResendPart(incomingHash);
  const { alreadyMigrated, data } = collectMigratableData(storageEntries);
  if ((!resend && alreadyMigrated) || Object.keys(data).length === 0) {
    return sharePart;
  }

  const from = meta.from ?? (typeof location !== 'undefined' ? location.origin : '');
  const at = meta.at ?? Date.now();
  const encode = (d) => {
    const payload = { v: 1, from, at, data: d };
    const compressed = compressToEncodedURIComponent(JSON.stringify(payload));
    return joinHashParts([sharePart, `migrate=${compressed}`]);
  };

  let candidate = encode(data);
  if (candidate.length <= maxLen) return candidate;

  // Step 1: drop draft first when payload exceeds maxLen.
  const trimmed = { ...data };
  if (DRAFT_KEY in trimmed) {
    delete trimmed[DRAFT_KEY];
    if (Object.keys(trimmed).length === 0) return sharePart;
    candidate = encode(trimmed);
    if (candidate.length <= maxLen) return candidate;
  }

  // Step 2: trim history to the newest entries (by updatedAt) until it fits.
  if (typeof trimmed[HISTORY_KEY] === 'string') {
    try {
      const parsed = JSON.parse(trimmed[HISTORY_KEY]);
      if (Array.isArray(parsed)) {
        const sorted = [...parsed].sort((a, b) => (b?.updatedAt || 0) - (a?.updatedAt || 0));
        let lo = 0;
        let hi = sorted.length;
        let best = null;
        let smallest = candidate;

        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const nextData = { ...trimmed };
          if (mid === 0) {
            delete nextData[HISTORY_KEY];
          } else {
            nextData[HISTORY_KEY] = JSON.stringify(sorted.slice(0, mid));
          }
          const nextHash = Object.keys(nextData).length === 0 ? sharePart : encode(nextData);
          if (mid === 0) smallest = nextHash;
          if (nextHash.length <= maxLen) {
            best = nextHash;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }

        return best !== null ? best : smallest;
      }
    } catch {
      // Unparsable history string cannot be trimmed by entries.
    }
  }

  return candidate;
}
