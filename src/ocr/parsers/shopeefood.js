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
  // Item thumbnails OCR as a short junk token before the qty ("dl 3x ...",
  // "d 1x ...") - tolerate one token of up to 4 chars there.
  const realItemPattern = /^(?:\S{1,4}\s+)?(\d+)\s*x\s+(.+?)\s+(Rp[\d.,]+)\s*$/i;
  // Legacy pattern: "Item Name  xQty  Price" or "Item Name  x2  Rp 25.000"
  const legacyItemPatternA = /^(.+?)\s+x(\d+)\s+((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/;
  // Legacy pattern: "Item Name  Rp XX.XXX" (qty=1 implied)
  const legacyItemPatternB = /^(.+?)\s+((?:[Rr]p\.?\s*)[\d.,]+)\s*$/;
  // Split-line helpers when OCR separates the Rp price onto an adjacent line
  const standalonePricePattern = /^Rp\.?\s*[\d.,]+$/i;
  const nextLineAmountPattern = /^-?\s*(?:[Rr]p\.?\s*)?[\d.,]+$/;
  const splitItemPattern = /^(?:\S{1,4}\s+)?(\d+)\s*x\s+(.+?)\s*$/i;

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
      } else if (i + 1 < lines.length && nextLineAmountPattern.test(lines[i + 1])) {
        subtotal = parsePrice(lines[i + 1]);
        i++;
      }
      continue;
    }

    // Check for discount (Voucher Diskon, Diskon ShopeeFood, Diskon)
    if (/voucher\s*diskon|diskon\s*shopeefood|^diskon|^voucher/i.test(line)) {
      const priceMatch = line.match(/(-?\s*(?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        discount = parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length && nextLineAmountPattern.test(lines[i + 1])) {
        discount = parsePrice(lines[i + 1]);
        i++;
      }
      continue;
    }

    // Check for delivery/service fees - accumulate "Biaya" and "Tip" lines (not totals)
    if (/biaya|^tip\b/i.test(line) && !/total/i.test(line)) {
      const priceMatch = line.match(/((?:-?\s*)?(?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        deliveryFee += parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length && nextLineAmountPattern.test(lines[i + 1])) {
        deliveryFee += parsePrice(lines[i + 1]);
        i++;
      }
      continue;
    }

    // Legacy: Check for ongkir/delivery keywords (single delivery fee)
    if (/^(ongkir|delivery)/i.test(line)) {
      const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        deliveryFee += parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length && nextLineAmountPattern.test(lines[i + 1])) {
        deliveryFee += parsePrice(lines[i + 1]);
        i++;
      }
      continue;
    }

    // Skip other known labels (Rincian Pesanan, Total harga, etc.)
    if (/^(rincian\s*pesanan|total\s*harga)/i.test(line)) {
      continue;
    }

    // Split Case A: standalone price line immediately before "qty x Name"
    if (standalonePricePattern.test(line) && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (
        !isSkipOrSummaryLine(nextLine) &&
        !realItemPattern.test(nextLine) &&
        !legacyItemPatternA.test(nextLine) &&
        !legacyItemPatternB.test(nextLine)
      ) {
        const splitMatch = splitItemPattern.exec(nextLine);
        if (splitMatch) {
          const qty = parseInt(splitMatch[1], 10);
          const name = splitMatch[2].trim();
          const total = parsePrice(line);
          if (qty > 0 && name.length > 1 && total >= 1000) {
            items.push({ name, quantity: qty, price: Math.round(total / qty), total });
            i++;
            continue;
          }
        }
      }
    }

    // Try primary real receipt pattern: "3 x  Item Name  Rp77.100"
    // The Rp value on Shopee receipts is the LINE TOTAL, not the unit price.
    const realMatch = realItemPattern.exec(line);
    if (realMatch) {
      const qty = parseInt(realMatch[1], 10);
      const name = realMatch[2].trim();
      const total = parsePrice(realMatch[3]);
      if (qty > 0) {
        const price = Math.round(total / qty);
        items.push({ name, quantity: qty, price, total });
        continue;
      }
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

    // Split Case B: "qty x Name" followed by standalone "Rp..." on next line
    const splitMatchB = splitItemPattern.exec(line);
    if (splitMatchB && i + 1 < lines.length && standalonePricePattern.test(lines[i + 1])) {
      const qty = parseInt(splitMatchB[1], 10);
      const name = splitMatchB[2].trim();
      const total = parsePrice(lines[i + 1]);
      if (qty > 0 && name.length > 1 && total >= 1000) {
        items.push({ name, quantity: qty, price: Math.round(total / qty), total });
        i++;
        continue;
      }
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

function isSkipOrSummaryLine(line) {
  return (
    /^\[/.test(line) ||
    /\[\s*\]/.test(line) ||
    /subtotal\s*pesanan|^subtotal/i.test(line) ||
    /voucher\s*diskon|diskon\s*shopeefood|^diskon|^voucher/i.test(line) ||
    (/biaya|^tip\b/i.test(line) && !/total/i.test(line)) ||
    /^(ongkir|delivery)/i.test(line) ||
    /^(rincian\s*pesanan|total\s*harga)/i.test(line)
  );
}
