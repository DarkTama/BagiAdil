/**
 * Session state of the split being worked on: which history entry it saves
 * into, who has paid, the pending receipt image and the last successful
 * Calculate. The editor data itself (participants, items, params) stays with
 * its own modules and is read on demand.
 * One module-private object, one Set of listeners; no DOM access.
 */

const fresh = () => ({
  historyId: null, // string|null: history entry this split saves into
  paid: {}, // { [name]: true }
  receiptBlob: null, // Blob|null: attached on the next successful history save
  calc: null, // null | { snapshot, result, itemsMap }: last successful Calculate
});

let state = fresh();
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn(state));
}

/** @returns {object} the session state; treat as read-only */
export function getSession() {
  return state;
}

/**
 * Call fn(state) on every change.
 * @returns {function} unsubscribe
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Shallow-merge { historyId | paid | receiptBlob } into the session and notify. */
export function update(patch) {
  state = { ...state, ...patch };
  notify();
}

/** Record a successful Calculate. */
export function setCalculated(snapshot, { result, itemsMap }) {
  state = { ...state, calc: { snapshot, result, itemsMap } };
  notify();
}

/** Start a new split: clear everything, then apply an optional patch. */
export function resetSession(patch = {}) {
  state = { ...fresh(), ...patch };
  notify();
}
