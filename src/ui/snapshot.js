/**
 * Split "snapshot" helpers.
 * A snapshot is the full editable input state of one bill split. It is the
 * single payload shared by the history feature and the share-link feature.
 *
 * Shape:
 *   {
 *     participants: string[],
 *     params: { totalDiscount: number, totalShipping: number },
 *     items: [{ name, unitPrice, totalQty, assignments: [{ person, qty }] }]
 *   }
 */

import { splitBill } from '../engine/calculator.js';
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';

/**
 * Build a snapshot from the current editor state.
 * Strips the runtime-only `id` field from table-assigner items.
 * @param {string[]} participants
 * @param {{totalDiscount: number, totalShipping: number}} params
 * @param {Array} items - table-assigner items
 * @returns {object} snapshot
 */
export function buildSnapshot(participants, params, items, payment = null) {
  const snap = {
    participants: [...participants],
    params: {
      totalDiscount: params.totalDiscount || 0,
      totalShipping: params.totalShipping || 0,
    },
    items: items.map((item) => ({
      name: item.name,
      unitPrice: item.unitPrice,
      totalQty: item.totalQty,
      assignments: (item.assignments || []).map((a) => ({
        person: a.person,
        qty: a.qty,
      })),
    })),
  };
  if (payment && (payment.bank || payment.accountNumber || payment.accountName)) {
    snap.payment = {
      bank: payment.bank || '',
      accountNumber: payment.accountNumber || '',
      accountName: payment.accountName || '',
    };
  }
  return snap;
}

/**
 * Group assigned items by person. The single aggregation behind the table
 * assigner, the assigned list and computeSplit.
 * Seeded in participant order (so the rounding tie-break matches the host
 * screen), then any assigned-but-unlisted person on first use.
 * @param {string[]} participants
 * @param {Array} items - snapshot or table-assigner items (an `id` becomes `itemId`)
 * @returns {Object<string, {items: Array<{itemId, name, qty, unitPrice, price}>, subtotal: number}>}
 */
export function aggregateByPerson(participants, items) {
  const byPerson = {};
  (participants || []).forEach((p) => {
    byPerson[p] = { items: [], subtotal: 0 };
  });
  (items || []).forEach((item) => {
    (item.assignments || []).forEach((a) => {
      if (!byPerson[a.person]) {
        byPerson[a.person] = { items: [], subtotal: 0 };
      }
      const price = a.qty * item.unitPrice;
      byPerson[a.person].items.push({
        itemId: item.id,
        name: item.name,
        qty: a.qty,
        unitPrice: item.unitPrice,
        price,
      });
      byPerson[a.person].subtotal += price;
    });
  });
  return byPerson;
}

/**
 * Recompute the split result and items map from a snapshot. The only compute
 * path: Calculate, history meta and the shared view all go through it.
 * @param {object} snapshot
 * @returns {{result: object|null, itemsMap: object, payment: object|null}}
 *   result is null when no person has a subtotal above zero
 */
export function computeSplit(snapshot) {
  const byPerson = aggregateByPerson(snapshot.participants, snapshot.items);

  const orders = [];
  const itemsMap = {};
  Object.entries(byPerson).forEach(([name, data]) => {
    if (data.subtotal > 0) {
      orders.push({ name, amount: data.subtotal });
    }
    if (data.items.length > 0) {
      itemsMap[name] = data.items;
    }
  });

  const payment = snapshot.payment || null;
  if (orders.length === 0) return { result: null, itemsMap, payment };

  const params = snapshot.params || {};
  const result = splitBill({
    orders,
    totalDiscount: params.totalDiscount || 0,
    totalShipping: params.totalShipping || 0,
  });

  return { result, itemsMap, payment };
}

/** Legacy URL-safe base64 -> UTF-8 string (decodes pre-compression links). */
function fromBase64Url(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Encode a snapshot into a compact, compressed, URL-safe string.
 * Positional-array form with assignment persons referenced by index:
 *   [ persons, totalDiscount, totalShipping,
 *     [ [name, unitPrice, totalQty, [ [personIdx, qty], ... ]], ... ] ]
 * Only participants referenced by an item assignment are included (people
 * who ordered nothing never appear in the shared result), in participant
 * order, then the JSON is
 * compressed with lz-string to keep share links short.
 * @param {object} snapshot
 * @returns {string}
 */
export function encodeSnapshot(snapshot) {
  // Persons go in participant order (assigned ones only) so decoding keeps the
  // host's order; anyone assigned but not listed is appended on first use.
  const assigned = new Set();
  (snapshot.items || []).forEach((item) =>
    (item.assignments || []).forEach((a) => assigned.add(a.person)),
  );
  const persons = (snapshot.participants || []).filter((p) => assigned.has(p));
  const personIndex = (name) => {
    let i = persons.indexOf(name);
    if (i === -1) {
      persons.push(name);
      i = persons.length - 1;
    }
    return i;
  };
  const items = (snapshot.items || []).map((item) => [
    item.name,
    item.unitPrice,
    item.totalQty,
    (item.assignments || []).map((a) => [personIndex(a.person), a.qty]),
  ]);
  const params = snapshot.params || {};
  const compact = [
    persons,
    params.totalDiscount || 0,
    params.totalShipping || 0,
    items,
  ];
  if (snapshot.payment && (snapshot.payment.bank || snapshot.payment.accountNumber || snapshot.payment.accountName)) {
    compact.push([
      snapshot.payment.bank || '',
      snapshot.payment.accountNumber || '',
      snapshot.payment.accountName || '',
    ]);
  }
  return compressToEncodedURIComponent(JSON.stringify(compact));
}

/**
 * Build the read-only share URL for a snapshot (or history entry), payment included.
 * @param {object} snapshot
 * @returns {string}
 */
export function buildShareUrl(snapshot) {
  return `${location.origin}${location.pathname}#share=${encodeSnapshot(snapshot)}`;
}

/**
 * Rebuild a snapshot object from the compact-array JSON string.
 * @param {string} json
 * @returns {object|null}
 */
function rebuildFromCompact(json) {
  let compact;
  try {
    compact = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(compact) || compact.length < 4) return null;
  const [persons, totalDiscount, totalShipping, items] = compact;
  if (!Array.isArray(persons) || !Array.isArray(items)) return null;
  const res = {
    participants: persons,
    params: {
      totalDiscount: totalDiscount || 0,
      totalShipping: totalShipping || 0,
    },
    items: items.map((item) => ({
      name: item[0],
      unitPrice: item[1],
      totalQty: item[2],
      assignments: (item[3] || []).map((a) => ({
        person: persons[a[0]],
        qty: a[1],
      })),
    })),
  };
  if (Array.isArray(compact[4]) && compact[4].length >= 3) {
    const [bank, accountNumber, accountName] = compact[4];
    if (bank || accountNumber || accountName) {
      res.payment = {
        bank: bank || '',
        accountNumber: accountNumber || '',
        accountName: accountName || '',
      };
    }
  }
  return res;
}

/**
 * Decode a share string back into a snapshot. Accepts the current
 * lz-string-compressed form, and falls back to the legacy base64 form so
 * older share links keep working.
 * @param {string} str
 * @returns {object|null} snapshot, or null if malformed
 */
export function decodeSnapshot(str) {
  if (!str) return null;
  // Current format: lz-string compressed.
  try {
    const json = decompressFromEncodedURIComponent(str);
    if (json) {
      const snap = rebuildFromCompact(json);
      if (snap) return snap;
    }
  } catch {
    // not a compressed string - fall through to the legacy decoder
  }
  // Legacy format: URL-safe base64 of JSON.
  try {
    return rebuildFromCompact(fromBase64Url(str));
  } catch {
    return null;
  }
}
