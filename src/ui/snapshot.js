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

/**
 * Build a snapshot from the current editor state.
 * Strips the runtime-only `id` field from table-assigner items.
 * @param {string[]} participants
 * @param {{totalDiscount: number, totalShipping: number}} params
 * @param {Array} items - table-assigner items
 * @returns {object} snapshot
 */
export function buildSnapshot(participants, params, items) {
  return {
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
}

/**
 * Recompute the split result and items map from a snapshot.
 * Mirrors the per-person aggregation done by table-assigner's getTableState().
 * @param {object} snapshot
 * @returns {{result: object, itemsMap: object}}
 */
export function computeSplit(snapshot) {
  const assignments = {};
  (snapshot.items || []).forEach((item) => {
    (item.assignments || []).forEach((a) => {
      if (!assignments[a.person]) {
        assignments[a.person] = { items: [], subtotal: 0 };
      }
      assignments[a.person].items.push({
        name: item.name,
        qty: a.qty,
        unitPrice: item.unitPrice,
        price: a.qty * item.unitPrice,
      });
      assignments[a.person].subtotal += a.qty * item.unitPrice;
    });
  });

  const orders = [];
  const itemsMap = {};
  Object.entries(assignments).forEach(([name, data]) => {
    if (data.subtotal > 0) {
      orders.push({ name, amount: data.subtotal });
    }
    if (data.items.length > 0) {
      itemsMap[name] = data.items;
    }
  });

  const params = snapshot.params || {};
  const result = splitBill({
    orders,
    totalDiscount: params.totalDiscount || 0,
    totalShipping: params.totalShipping || 0,
  });

  return { result, itemsMap };
}

/** UTF-8-safe string -> URL-safe base64. */
function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** URL-safe base64 -> UTF-8 string. */
function fromBase64Url(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Encode a snapshot into a compact URL-safe string.
 * Uses a positional-array form with assignment persons referenced by index
 * into the participants list, so names are not repeated per assignment:
 *   [ participants, totalDiscount, totalShipping,
 *     [ [name, unitPrice, totalQty, [ [personIdx, qty], ... ]], ... ] ]
 * @param {object} snapshot
 * @returns {string}
 */
export function encodeSnapshot(snapshot) {
  const persons = [...(snapshot.participants || [])];
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
  return toBase64Url(JSON.stringify(compact));
}

/**
 * Decode a compact share string back into a snapshot.
 * @param {string} str
 * @returns {object|null} snapshot, or null if malformed
 */
export function decodeSnapshot(str) {
  try {
    if (!str) return null;
    const compact = JSON.parse(fromBase64Url(str));
    if (!Array.isArray(compact) || compact.length < 4) return null;
    const [persons, totalDiscount, totalShipping, items] = compact;
    if (!Array.isArray(persons) || !Array.isArray(items)) return null;
    return {
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
  } catch {
    return null;
  }
}
