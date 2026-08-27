/**
 * ShopeeFood receipt parser.
 * Extracts items, prices, subtotal, discount, and delivery fee from ShopeeFood receipt text.
 */

import { parsePrice } from './common.js';

/**
 * Parse ShopeeFood receipt text into structured data.
 * @param {string} text - Raw OCR text from a ShopeeFood receipt
 * @returns {{items: Array<{name: string, quantity: number, price: number, total: number}>, subtotal: number, discount: number, deliveryFee: number, platform: string}}
 */
export function parseShopeeReceipt(text) {
  const lines = text
    .split('\n')
    // Strip leading OCR junk (thumbnails read as "—.", "=", etc.) but keep "["
    // so topping lines stay detectable.
    .map((l) => l.trim().replace(/^[^\w[]+/, '').trim())
    .filter(Boolean);

  const items = [];
  let subtotal = 0;
  let discount = 0;
  let deliveryFee = 0;

  // Primary pattern for real receipts: "1 x  Item Name  Rp47.600"
  const realItemPattern = /^(\d+)\s*x\s+(.+?)\s+(Rp[\d.,]+)\s*$/i;
  // Legacy pattern: "Item Name  xQty  Price" or "Item Name  x2  Rp 25.000"
  const legacyItemPatternA = /^(.+?)\s+x(\d+)\s+((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/;
  // Legacy pattern: "Item Name  Rp XX.XXX" (qty=1 implied)
  const legacyItemPatternB = /^(.+?)\s+((?:[Rr]p\.?\s*)[\d.,]+)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip topping lines (lines starting with [ or containing [ ])
    if (/^\[/.test(line) || /\[\s*\]/.test(line)) {
      continue;
    }

    // Check for subtotal
    if (/subtotal\s*pesanan|^subtotal/i.test(line)) {
      const priceMatch = line.match(/((?:-?\s*)?(?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        subtotal = parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        subtotal = parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Check for discount (Voucher Diskon, Diskon ShopeeFood, Diskon)
    if (/voucher\s*diskon|diskon\s*shopeefood|^diskon|^voucher/i.test(line)) {
      const priceMatch = line.match(/(-?\s*(?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        discount = parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        discount = parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Check for delivery/service fees - accumulate "Biaya" and "Tip" lines (not totals)
    if (/biaya|^tip\b/i.test(line) && !/total/i.test(line)) {
      const priceMatch = line.match(/((?:-?\s*)?(?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        deliveryFee += parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        deliveryFee += parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Legacy: Check for ongkir/delivery keywords (single delivery fee)
    if (/^(ongkir|delivery)/i.test(line)) {
      const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        deliveryFee += parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        deliveryFee += parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Skip other known labels (Rincian Pesanan, Total harga, etc.)
    if (/^(rincian\s*pesanan|total\s*harga)/i.test(line)) {
      continue;
    }

    // Try primary real receipt pattern: "3 x  Item Name  Rp77.100"
    // The Rp value on Shopee receipts is the LINE TOTAL, not the unit price.
    const realMatch = realItemPattern.exec(line);
    if (realMatch) {
      const qty = parseInt(realMatch[1], 10);
      const name = realMatch[2].trim();
      const total = parsePrice(realMatch[3]);
      const price = Math.round(total / qty);
      items.push({ name, quantity: qty, price, total });
      continue;
    }

    // Try legacy pattern with quantity: "Item Name  x2  Rp 25.000"
    const matchA = legacyItemPatternA.exec(line);
    if (matchA) {
      const name = matchA[1].trim();
      const qty = parseInt(matchA[2], 10);
      const price = parsePrice(matchA[3]);
      items.push({ name, quantity: qty, price, total: qty * price });
      continue;
    }

    // Try legacy pattern with Rp prefix (qty=1): "Item Name  Rp 25.000"
    const matchB = legacyItemPatternB.exec(line);
    if (matchB) {
      const name = matchB[1].trim();
      const price = parsePrice(matchB[2]);
      if (name.length > 1 && price >= 1000) {
        items.push({ name, quantity: 1, price, total: price });
      }
      continue;
    }
  }

  return {
    items,
    subtotal,
    discount,
    deliveryFee,
    platform: 'shopeefood',
  };
}
