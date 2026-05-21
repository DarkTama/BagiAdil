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

/**
 * Encode a snapshot into a URL-safe base64 string (UTF-8 safe).
 * @param {object} snapshot
 * @returns {string}
 */
export function encodeSnapshot(snapshot) {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode a URL-safe base64 string back into a snapshot.
 * @param {string} str
 * @returns {object|null} snapshot, or null if malformed
 */
export function decodeSnapshot(str) {
  try {
    if (!str) return null;
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
