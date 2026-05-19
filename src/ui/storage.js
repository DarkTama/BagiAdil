/**
 * localStorage integration for persisting participant names.
 * Key prefix: "bagiadil_" to avoid collisions.
 */

const STORAGE_KEY = 'bagiadil_participants';

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
