/**
 * Split "snapshot" helpers.
 * A snapshot is the full editable input state of one bill split. It is the
 * single payload shared by the history feature and the share-link feature.
 *
 * Shape:
 *   {
 *     participants: string[],
 *     params: { totalDiscount: number, totalShipping: number },
 *     items: [{ name, unitPrice, totalQty, split?: true, assignments: [{ person, qty }] }]
 *   }
 *
 * Without `split`, an assignment's qty is whole units of the item (they sum to
 * at most totalQty). With `split: true` the whole item (unitPrice * totalQty)
 * is shared and each qty is a share weight: equal weights split it evenly,
 * 2:1 gives one person twice the other's part.
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
    v: 1,
    participants: [...participants],
    params: {
      totalDiscount: params.totalDiscount || 0,
      totalShipping: params.totalShipping || 0,
    },
    items: items.map((item) => ({
      name: item.name,
      unitPrice: item.unitPrice,
      totalQty: item.totalQty,
      ...(item.split ? { split: true } : {}),
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
 * Divide a whole-rupiah total by integer weights into whole-rupiah parts that
 * sum to the total exactly: floor each part, then hand the leftover rupiah one
 * by one to the largest fractional remainders (ties: earlier weight first).
 * @param {number} total - non-negative integer
 * @param {number[]} weights - positive integers
 * @returns {number[]}
 */
export function allocateByWeight(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  let left = total - parts.reduce((s, p) => s + p, 0);
  const order = weights
    .map((w, i) => i)
    .sort((a, b) => ((total * weights[b]) % sum) - ((total * weights[a]) % sum) || a - b);
  for (let j = 0; left > 0; j++, left--) parts[order[j]] += 1;
  return parts;
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
    const assignments = item.assignments || [];
    const weights = assignments.map((a) => a.qty);
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    const shares = item.split && assignments.length ? allocateByWeight(item.unitPrice * item.totalQty, weights) : null;
    assignments.forEach((a, i) => {
      if (!byPerson[a.person]) {
        byPerson[a.person] = { items: [], subtotal: 0 };
      }
      let line;
      if (!item.split) {
        line = { itemId: item.id, name: item.name, qty: a.qty, unitPrice: item.unitPrice, price: a.qty * item.unitPrice };
      } else if (a.qty === totalWeight) {
        // Sole sharer pays the whole item: same line as owning every unit.
        line = { itemId: item.id, name: item.name, qty: item.totalQty, unitPrice: item.unitPrice, price: shares[i] };
      } else {
        // Part of a shared item. qty stays 1 so result lines print "name - price";
        // the (share/total) marker in the name is language-neutral.
        line = {
          itemId: item.id,
          name: `${item.name} (${a.qty}/${totalWeight})`,
          qty: 1,
          unitPrice: item.unitPrice,
          price: shares[i],
          share: [a.qty, totalWeight],
        };
      }
      byPerson[a.person].items.push(line);
      byPerson[a.person].subtotal += line.price;
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
 * Versioned positional-array form with assignment persons referenced by index:
 *   [ 2, persons, totalDiscount, totalShipping,
 *     [ [name, unitPrice, totalQty, [ [personIdx, qty], ... ]], ... ], payment? ]
 * A shared item appends a 1 flag: [name, unitPrice, totalQty, assigns, 1], and
 * then the version is 3, so an older app rejects the link instead of reading
 * share weights as units. Without shared items the output stays v2.
 * Legacy v1 links (no leading version number) are still decoded.
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
  const items = (snapshot.items || []).map((item) => {
    const entry = [
      item.name,
      item.unitPrice,
      item.totalQty,
      (item.assignments || []).map((a) => [personIndex(a.person), a.qty]),
    ];
    if (item.split) entry.push(1);
    return entry;
  });
  const params = snapshot.params || {};
  const compact = [
    (snapshot.items || []).some((item) => item.split) ? 3 : 2,
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

const isStr = (x) => typeof x === 'string';
// Whole rupiah, like the engine requires: anything else would throw inside splitBill.
const isNum = (x) => Number.isInteger(x) && x >= 0;
const isPosInt = (x) => Number.isInteger(x) && x >= 1;

/**
 * Check that a snapshot is safe to feed to computeSplit and the editor.
 * Used on every untrusted source (share links, drafts).
 * @param {object} snap
 * @returns {boolean}
 */
export function validateSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return false;
  const { participants, params, items, payment } = snap;
  if (!Array.isArray(participants) || !Array.isArray(items)) return false;
  if (!participants.every((p) => isStr(p) && p.trim())) return false;
  if (new Set(participants).size !== participants.length) return false;
  if (!params || !isNum(params.totalDiscount) || !isNum(params.totalShipping)) return false;
  const known = new Set(participants);
  const itemsOk = items.every((item) => {
    if (!item || !isStr(item.name) || !isNum(item.unitPrice) || !isPosInt(item.totalQty)) return false;
    if (!Array.isArray(item.assignments)) return false;
    if (item.split !== undefined && item.split !== true) return false;
    let assigned = 0;
    for (const a of item.assignments) {
      if (!a || !known.has(a.person) || !isPosInt(a.qty)) return false;
      assigned += a.qty;
    }
    // Share weights may exceed totalQty, but price * weight must stay exact.
    if (item.split) return Number.isSafeInteger(item.unitPrice * item.totalQty * Math.max(assigned, 1));
    return assigned <= item.totalQty;
  });
  if (!itemsOk) return false;
  if (payment !== undefined && payment !== null) {
    if (!isStr(payment.bank) || !isStr(payment.accountNumber) || !isStr(payment.accountName)) return false;
  }
  return true;
}

/**
 * Rebuild a snapshot object from the compact-array JSON string (v2, or the
 * legacy v1 layout without the leading version number).
 * @param {string} json
 * @returns {object|null} a validated snapshot, or null
 */
function rebuildFromCompact(json) {
  let compact;
  try {
    compact = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(compact) || compact.length < 4) return null;
  if (typeof compact[0] === 'number') {
    // Versioned link. Unknown future versions are rejected, not guessed at.
    if (compact[0] !== 2 && compact[0] !== 3) return null;
    compact = compact.slice(1);
  } else if (!Array.isArray(compact[0])) {
    return null;
  }
  const [persons, totalDiscount, totalShipping, items, pay] = compact;
  if (!Array.isArray(persons) || !Array.isArray(items)) return null;
  const shapeOk = items.every(
    (item) =>
      Array.isArray(item) &&
      (item[3] === undefined || (Array.isArray(item[3]) && item[3].every(Array.isArray))) &&
      (item[4] === undefined || item[4] === 1),
  );
  if (!shapeOk) return null;

  const res = {
    participants: persons,
    params: {
      totalDiscount: totalDiscount === undefined ? 0 : totalDiscount,
      totalShipping: totalShipping === undefined ? 0 : totalShipping,
    },
    items: items.map((item) => ({
      name: item[0],
      unitPrice: item[1],
      totalQty: item[2],
      ...(item[4] === 1 ? { split: true } : {}),
      assignments: (item[3] || []).map((a) => ({
        // An index that is not a valid position stays undefined and fails validation.
        person: Number.isInteger(a[0]) ? persons[a[0]] : undefined,
        qty: a[1],
      })),
    })),
  };
  if (pay !== undefined && pay !== null) {
    if (!Array.isArray(pay) || pay.length < 3) return null;
    const [bank, accountNumber, accountName] = pay;
    if (bank || accountNumber || accountName) {
      res.payment = { bank, accountNumber, accountName };
    }
  }
  return validateSnapshot(res) ? res : null;
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
