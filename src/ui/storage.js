/**
 * localStorage integration for persisting participant names.
 * Key prefix: "bagiadil_" to avoid collisions.
 */

const STORAGE_KEY = 'bagiadil_participants';
const HISTORY_KEY = 'bagiadil_history';
const HISTORY_LIMIT = 50;
const HISTORY_CORRUPT_KEY = 'bagiadil_history_corrupt';
const DRAFT_KEY = 'bagiadil_draft';
const GROUPS_KEY = 'bagiadil_groups';
const PAYMENT_KEY = 'bagiadil_payment';
const HIDDEN_PARTICIPANTS_KEY = 'bagiadil_hidden_participants';

function loadHiddenSet() {
  try {
    const data = localStorage.getItem(HIDDEN_PARTICIPANTS_KEY);
    if (!data) return new Set();
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim().toLowerCase()),
    );
  } catch {
    return new Set();
  }
}

function saveHiddenSet(set) {
  try {
    localStorage.setItem(HIDDEN_PARTICIPANTS_KEY, JSON.stringify([...set]));
  } catch {
    // silently fail
  }
}

/**
 * Save participant names to localStorage.
 * Merges with previously saved names (de-duplicated, case-insensitive) and
 * un-hides any explicitly saved names from the quick-pick blocklist.
 * @param {string[]} names
 */
export function saveParticipants(names) {
  try {
    const existing = loadAllNames();
    const merged = [...existing];
    const hidden = loadHiddenSet();
    let hiddenChanged = false;
    names.forEach((name) => {
      const lowerName = name.toLowerCase();
      if (!merged.some((n) => n.toLowerCase() === lowerName)) {
        merged.push(name);
      }
      if (hidden.delete(lowerName)) {
        hiddenChanged = true;
      }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    if (hiddenChanged) saveHiddenSet(hidden);
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
    localStorage.removeItem(HIDDEN_PARTICIPANTS_KEY);
  } catch {
    // silently fail
  }
}

/**
 * Load quick-pick participant suggestions sorted by frequency in split
 * history, then recency, then alphabetically, seeded with saved participants
 * and legacy group members. Hidden names are excluded.
 * @returns {string[]}
 */
export function loadQuickPickParticipants() {
  const hidden = loadHiddenSet();
  const stats = new Map();

  for (const entry of loadHistory()) {
    if (!entry || !Array.isArray(entry.participants)) continue;
    const timestamp = entry.updatedAt || entry.createdAt || 0;
    const seenInEntry = new Set();
    for (const rawName of entry.participants) {
      if (typeof rawName !== 'string') continue;
      const trimmed = rawName.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (hidden.has(key) || seenInEntry.has(key)) continue;
      seenInEntry.add(key);

      const current = stats.get(key);
      if (current) {
        current.count += 1;
        if (timestamp > current.lastUsedAt) {
          current.lastUsedAt = timestamp;
        }
      } else {
        stats.set(key, { name: trimmed, count: 1, lastUsedAt: timestamp });
      }
    }
  }

  const seedNames = [
    ...loadAllNames(),
    ...loadGroups().flatMap((g) => g.members || []),
  ];
  for (const rawName of seedNames) {
    if (typeof rawName !== 'string') continue;
    const trimmed = rawName.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (hidden.has(key) || stats.has(key)) continue;
    stats.set(key, { name: trimmed, count: 0, lastUsedAt: 0 });
  }

  return [...stats.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt - a.lastUsedAt;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    })
    .map((item) => item.name);
}

/**
 * Hide a participant name from quick-pick suggestions without mutating history.
 * @param {string} name
 */
export function hideQuickPickParticipant(name) {
  if (typeof name !== 'string') return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  try {
    const filtered = loadAllNames().filter((n) => n.toLowerCase() !== key);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    const hidden = loadHiddenSet();
    hidden.add(key);
    saveHiddenSet(hidden);
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

/**
 * Merge imported history entries with existing ones by `id` (larger `updatedAt`
 * wins on conflict; existing wins on tie) and persist through `writeHistory` so
 * the 50-entry cap is enforced in one place.
 * @param {object[]} incoming
 * @returns {boolean}
 */
export function mergeHistoryEntries(incoming) {
  if (!Array.isArray(incoming)) return false;
  const existing = readHistory();
  const byId = new Map();
  for (const entry of existing) {
    if (entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id) {
      byId.set(entry.id, entry);
    }
  }
  for (const entry of incoming) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id) {
      continue;
    }
    const current = byId.get(entry.id);
    if (!current || (entry.updatedAt || 0) > (current.updatedAt || 0)) {
      byId.set(entry.id, entry);
    }
  }
  return writeHistory([...byId.values()]);
}

/* ---------------------------------------------------------------------------
 * Draft of the split in progress
 * ------------------------------------------------------------------------- */

/**
 * Save the in-progress split so a reload (or an app switch that evicts the tab)
 * does not lose it.
 * @param {object} draft - { v, snapshot, historyId, paid, calculated }
 * @returns {boolean} false when the write failed
 */
export function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {object|null} the saved draft, or null when absent or unparsable
 */
export function loadDraft() {
  try {
    const data = localStorage.getItem(DRAFT_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
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

/**
 * Merge imported participant groups by name (case-insensitive).
 * Existing groups on this origin win on conflict.
 * @param {Array<{name: string, members: string[]}>} incoming
 */
export function mergeGroups(incoming) {
  if (!Array.isArray(incoming)) return;
  try {
    const existing = loadGroups();
    const seen = new Set(existing.map((g) => g.name.toLowerCase()));
    const merged = [...existing];
    for (const group of incoming) {
      if (!group || typeof group.name !== 'string' || !Array.isArray(group.members)) continue;
      const trimmed = group.name.trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
      seen.add(trimmed.toLowerCase());
      merged.push({
        name: trimmed,
        members: group.members.filter((m) => typeof m === 'string' && m.trim()),
      });
    }
    localStorage.setItem(GROUPS_KEY, JSON.stringify(merged));
  } catch {
    // localStorage may be unavailable - silently fail
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
