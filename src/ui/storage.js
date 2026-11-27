/**
 * localStorage integration for persisting participant names.
 * Key prefix: "bagiadil_" to avoid collisions.
 */

const STORAGE_KEY = 'bagiadil_participants';
const HISTORY_KEY = 'bagiadil_history';
const HISTORY_LIMIT = 50;
const HISTORY_CORRUPT_KEY = 'bagiadil_history_corrupt';
const GROUPS_KEY = 'bagiadil_groups';
const PAYMENT_KEY = 'bagiadil_payment';

/**
 * Initialize storage module. No-op currently, but provides a hook for future setup.
 */
export function initStorage() {
  // Intentionally empty - future use
}

/**
 * Save participant names to localStorage.
 * Merges with previously saved names (de-duplicated, case-insensitive).
 * @param {string[]} names
 */
export function saveParticipants(names) {
  try {
    const existing = loadAllNames();
    const merged = [...existing];
    names.forEach((name) => {
      const lowerName = name.toLowerCase();
      if (!merged.some((n) => n.toLowerCase() === lowerName)) {
        merged.push(name);
      }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // localStorage may be unavailable - silently fail
  }
}

/**
 * Load saved participant names from localStorage.
 * @returns {string[]}
 */
export function loadParticipants() {
  return loadAllNames();
}

/**
 * Get name suggestions matching a partial string.
 * @param {string} partial
 * @returns {string[]}
 */
export function getSuggestions(partial) {
  if (!partial || !partial.trim()) return [];
  const lower = partial.toLowerCase();
  const all = loadAllNames();
  return all.filter((name) => name.toLowerCase().startsWith(lower));
}

/**
 * Clear all saved data from localStorage.
 */
export function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently fail
  }
}

function loadAllNames() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => typeof n === 'string' && n.trim());
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * Split history
 * ------------------------------------------------------------------------- */

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readHistory() {
  let data = null;
  try {
    data = localStorage.getItem(HISTORY_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // unparsable - fall through to the backup below
  }
  // Keep the first unreadable value so the next write cannot destroy it.
  try {
    if (data && localStorage.getItem(HISTORY_CORRUPT_KEY) === null) {
      localStorage.setItem(HISTORY_CORRUPT_KEY, data);
    }
  } catch {
    // backup is best-effort
  }
  return [];
}

/**
 * Persist history, newest-updated first, capped at HISTORY_LIMIT.
 * @returns {boolean} false when the write failed (storage full or unavailable)
 */
function writeHistory(entries) {
  try {
    const kept = [...entries]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, HISTORY_LIMIT);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(kept));
    return true;
  } catch {
    return false;
  }
}

/**
 * Save a split to history. Updates an existing entry when `entry.id` matches,
 * otherwise creates a new entry.
 * @param {object} entry - { id?, label, participants, params, items }
 * @returns {string|null} the entry id, or null when the write failed or a
 *   partial update (no `items`) targeted an unknown id
 */
export function saveHistoryEntry(entry) {
  const entries = readHistory();
  const now = Date.now();
  const existingIndex = entry.id ? entries.findIndex((e) => e.id === entry.id) : -1;

  if (existingIndex !== -1) {
    entries[existingIndex] = {
      ...entries[existingIndex],
      ...entry,
      updatedAt: now,
    };
    return writeHistory(entries) ? entries[existingIndex].id : null;
  }

  // A partial update (e.g. paid toggle) of an entry that no longer exists must not create a ghost.
  if (entry.id && !entry.items) return null;

  const id = entry.id || generateId();
  entries.unshift({ ...entry, id, createdAt: now, updatedAt: now });
  return writeHistory(entries) ? id : null;
}

/**
 * Load all history entries, newest-updated first.
 * @returns {object[]}
 */
export function loadHistory() {
  return readHistory().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Get a single history entry by id.
 * @param {string} id
 * @returns {object|null}
 */
export function getHistoryEntry(id) {
  return readHistory().find((e) => e.id === id) || null;
}

/**
 * Delete a history entry by id.
 * @param {string} id
 * @returns {boolean} true when the write succeeded
 */
export function deleteHistoryEntry(id) {
  return writeHistory(readHistory().filter((e) => e.id !== id));
}

/**
 * Rename a history entry.
 * @param {string} id
 * @param {string} label
 * @returns {boolean} true when the entry exists and the write succeeded
 */
export function renameHistoryEntry(id, label) {
  const entries = readHistory();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return false;
  entry.label = label;
  entry.updatedAt = Date.now();
  return writeHistory(entries);
}

/**
 * Remove all history entries.
 */
export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // silently fail
  }
}

/* ---------------------------------------------------------------------------
 * Participant groups
 * ------------------------------------------------------------------------- */

/**
 * Load all saved participant groups.
 * @returns {Array<{name: string, members: string[]}>}
 */
export function loadGroups() {
  try {
    const data = localStorage.getItem(GROUPS_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g) => g && typeof g.name === 'string' && Array.isArray(g.members),
    );
  } catch {
    return [];
  }
}

/**
 * Save (or overwrite) a named participant group.
 * @param {string} name - Group name.
 * @param {string[]} members - Participant names.
 */
export function saveGroup(name, members) {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  try {
    const groups = loadGroups().filter(
      (g) => g.name.toLowerCase() !== trimmed.toLowerCase(),
    );
    groups.push({
      name: trimmed,
      members: (members || []).filter((m) => typeof m === 'string' && m.trim()),
    });
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  } catch {
    // localStorage may be unavailable - silently fail
  }
}

/**
 * Delete a participant group by name.
 * @param {string} name
 */
export function deleteGroup(name) {
  try {
    const groups = loadGroups().filter(
      (g) => g.name.toLowerCase() !== String(name).toLowerCase(),
    );
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  } catch {
    // silently fail
  }
}

/* ---------------------------------------------------------------------------
 * Payment destination
 * ------------------------------------------------------------------------- */

/**
 * Save host payment info to localStorage.
 * @param {{bank?: string, accountNumber?: string, accountName?: string}|null} info
 */
export function savePaymentInfo(info) {
  try {
    if (!info) {
      localStorage.removeItem(PAYMENT_KEY);
      return;
    }
    const bank = (info.bank || '').trim();
    const accountNumber = (info.accountNumber || '').trim();
    const accountName = (info.accountName || '').trim();
    if (!bank && !accountNumber && !accountName) {
      localStorage.removeItem(PAYMENT_KEY);
      return;
    }
    localStorage.setItem(PAYMENT_KEY, JSON.stringify({ bank, accountNumber, accountName }));
  } catch {
    // silently fail
  }
}

/**
 * Load host payment info from localStorage.
 * @returns {{bank: string, accountNumber: string, accountName: string}|null}
 */
export function loadPaymentInfo() {
  try {
    const data = localStorage.getItem(PAYMENT_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object') return null;
    const bank = (parsed.bank || '').trim();
    const accountNumber = (parsed.accountNumber || '').trim();
    const accountName = (parsed.accountName || '').trim();
    if (!bank && !accountNumber && !accountName) return null;
    return { bank, accountNumber, accountName };
  } catch {
    return null;
  }
}

/**
 * Clear saved payment info.
 */
export function clearPaymentInfo() {
  try {
    localStorage.removeItem(PAYMENT_KEY);
  } catch {
    // silently fail
  }
}
