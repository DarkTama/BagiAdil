/**
 * localStorage integration for persisting participant names.
 * Key prefix: "bagiadil_" to avoid collisions.
 */

const STORAGE_KEY = 'bagiadil_participants';
const HISTORY_KEY = 'bagiadil_history';
const HISTORY_LIMIT = 50;
const GROUPS_KEY = 'bagiadil_groups';

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
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch {
    // localStorage may be unavailable or full - silently fail
  }
}

/**
 * Save a split to history. Updates an existing entry when `entry.id` matches,
 * otherwise creates a new entry. Returns the entry id.
 * @param {object} entry - { id?, label, participants, params, items }
 * @returns {string} the entry id
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
    writeHistory(entries);
    return entries[existingIndex].id;
  }

  const id = entry.id || generateId();
  entries.unshift({ ...entry, id, createdAt: now, updatedAt: now });
  writeHistory(entries);
  return id;
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
 */
export function deleteHistoryEntry(id) {
  writeHistory(readHistory().filter((e) => e.id !== id));
}

/**
 * Rename a history entry.
 * @param {string} id
 * @param {string} label
 */
export function renameHistoryEntry(id, label) {
  const entries = readHistory();
  const entry = entries.find((e) => e.id === id);
  if (entry) {
    entry.label = label;
    entry.updatedAt = Date.now();
    writeHistory(entries);
  }
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
