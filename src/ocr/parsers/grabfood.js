/**
 * GrabFood receipt parser.
 * Extracts items, prices, subtotal, discount, and delivery fee from GrabFood receipt text.
 */

import { parsePrice as parsePriceShared } from './common.js';

/**
 * Parse a price string, preserving any leading minus sign (GrabFood receipts
 * occasionally list signed values).
 * @param {string} str
 * @returns {number}
 */
function parsePrice(str) {
  return parsePriceShared(str, { signed: true });
}

/**
 * Parse GrabFood receipt text into structured data.
 * @param {string} text - Raw OCR text from a GrabFood receipt
 * @returns {{items: Array<{name: string, quantity: number, price: number, total: number}>, subtotal: number, discount: number, deliveryFee: number, platform: string}}
 */
export function parseGrabReceipt(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const items = [];
  let subtotal = 0;
  let discount = 0;
  let deliveryFee = 0;

  // Pattern 1: "Qty x Item Name  Price" e.g. "2 x Nasi Goreng  Rp 25.000"
  const itemPatternA = /^(\d+)\s*x\s+(.+?)\s+((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/;
  // Pattern 2: "Item Name\nRp XX.XXX" (item on one line, price on next)
  const priceOnlyPattern = /^((?:[Rr]p\.?\s*)[\d.,]+)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip known labels
    if (isKnownLabel(line)) {
      if (/^(subtotal|total\s*harga)/i.test(line)) {
        const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
        if (priceMatch) {
          subtotal = parsePrice(priceMatch[1]);
        } else if (i + 1 < lines.length) {
          subtotal = parsePrice(lines[i + 1]);
        }
      } else if (/^(promo|discount|grabfood\s*discount)/i.test(line)) {
        const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
        if (priceMatch) {
          discount = parsePrice(priceMatch[1]);
        } else if (i + 1 < lines.length) {
          discount = parsePrice(lines[i + 1]);
        }
      } else if (/^(delivery\s*fee|biaya\s*antar)/i.test(line)) {
        const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
        if (priceMatch) {
          deliveryFee = parsePrice(priceMatch[1]);
        } else if (i + 1 < lines.length) {
          deliveryFee = parsePrice(lines[i + 1]);
        }
      } else if (/^tip\b/i.test(line)) {
        // "Tip for driver" / "Tip untuk driver" - fold into delivery fee
        const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
        if (priceMatch) {
          deliveryFee += parsePrice(priceMatch[1]);
        }
      }
      continue;
    }

    // Try pattern: "2 x Item Name  Rp 25.000"
    const matchA = itemPatternA.exec(line);
    if (matchA) {
      const qty = parseInt(matchA[1], 10);
      const name = matchA[2].trim();
      const price = parsePrice(matchA[3]);
      items.push({ name, quantity: qty, price, total: qty * price });
      continue;
    }

    // Try pattern: "Item Name" followed by "Rp XX.XXX" on next line
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const priceMatch = priceOnlyPattern.exec(nextLine);
      if (priceMatch && !isKnownLabel(line) && !priceOnlyPattern.test(line)) {
        const name = line.trim();
        const price = parsePrice(priceMatch[1]);
        if (name.length > 1 && price >= 1000) {
          items.push({ name, quantity: 1, price, total: price });
          i++; // skip the price line
          continue;
        }
      }
    }
  }

  return {
    items,
    subtotal,
    discount,
    deliveryFee,
    platform: 'grabfood',
  };
}

function isKnownLabel(text) {
  return /^(subtotal|total\s*harga|promo|discount|grabfood\s*discount|delivery\s*fee|biaya\s*antar|tip\b)/i.test(text);
}
