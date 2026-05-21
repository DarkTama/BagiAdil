/**
 * IndexedDB store for receipt images attached to history entries.
 * Receipt images are too large for localStorage (which holds the text-only
 * history), so they live in their own IndexedDB object store, keyed by the
 * history entry id. Every function fails silently when storage is unavailable.
 */

const DB_NAME = 'bagiadil';
const STORE = 'receipts';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null;
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function runTx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = fn(transaction.objectStore(STORE));
        transaction.oncomplete = () =>
          resolve(request ? request.result : undefined);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

/**
 * Store a receipt image for a history entry.
 * @param {string} id - History entry id.
 * @param {Blob} blob - Receipt image.
 * @returns {Promise<void>}
 */
export async function putReceipt(id, blob) {
  if (!id || !blob) return;
  try {
    await runTx('readwrite', (store) => store.put(blob, id));
  } catch {
    // storage unavailable - the receipt is simply not saved
  }
}

/**
 * Get a stored receipt image.
 * @param {string} id - History entry id.
 * @returns {Promise<Blob|null>}
 */
export async function getReceipt(id) {
  if (!id) return null;
  try {
    const result = await runTx('readonly', (store) => store.get(id));
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Delete a stored receipt image.
 * @param {string} id - History entry id.
 * @returns {Promise<void>}
 */
export async function deleteReceipt(id) {
  if (!id) return;
  try {
    await runTx('readwrite', (store) => store.delete(id));
  } catch {
    // ignore
  }
}

/**
 * Drop receipt images whose history entry no longer exists.
 * @param {string[]} validIds - Ids of history entries that still exist.
 * @returns {Promise<void>}
 */
export async function pruneReceipts(validIds) {
  const keep = new Set(validIds || []);
  try {
    const keys = await runTx('readonly', (store) => store.getAllKeys());
    await Promise.all(
      (keys || []).filter((key) => !keep.has(key)).map((key) => deleteReceipt(key)),
    );
  } catch {
    // ignore
  }
}
