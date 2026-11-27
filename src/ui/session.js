/**
 * Session state of the split being worked on: which history entry it saves
 * into, who has paid, the pending receipt image and the last successful
 * Calculate. The editor data itself (participants, items, params) stays with
 * its own modules and is read on demand.
 * One module-private object, one Set of listeners; no DOM access.
 */

import { loadPaymentInfo } from './storage.js';

const EMPTY_PAYMENT = { bank: '', accountNumber: '', accountName: '' };

/** Raw (untrimmed) payment strings from a stored/shared payment or the saved default. */
function rawPayment(info) {
  return { ...EMPTY_PAYMENT, ...(info || {}) };
}

const fresh = () => ({
  historyId: null, // string|null: history entry this split saves into
  payment: rawPayment(loadPaymentInfo()), // RAW input strings, so typing never fights a sync
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

/**
 * Payment destination, trimmed, or null when every field is empty.
 * @returns {{bank: string, accountNumber: string, accountName: string}|null}
 */
export function getPayment() {
  const { bank, accountNumber, accountName } = state.payment;
  const p = { bank: bank.trim(), accountNumber: accountNumber.trim(), accountName: accountName.trim() };
  return p.bank || p.accountNumber || p.accountName ? p : null;
}

/** Shallow-merge { historyId | payment | paid | receiptBlob } into the session and notify. */
export function update(patch) {
  state = { ...state, ...patch };
  notify();
}

/** Record a successful Calculate. */
export function setCalculated(snapshot, { result, itemsMap }) {
  state = { ...state, calc: { snapshot, result, itemsMap } };
  notify();
}

/**
 * Start a new split: clear everything (payment returns to the saved default),
 * then apply an optional patch. A patch `payment` may be a partial/stored
 * payment object; it is normalised to raw strings.
 */
export function resetSession(patch = {}) {
  const base = fresh();
  state = { ...base, ...patch, payment: patch.payment ? rawPayment(patch.payment) : base.payment };
  notify();
}

/**
 * The editor changed. Stale tracking is not wired yet: for now this only
 * notifies subscribers.
 */
export function editorChanged() {
  notify();
}
