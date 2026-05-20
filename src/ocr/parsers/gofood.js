/**
 * GoFood receipt parser.
 * Extracts items, prices, subtotal, discount, and delivery fee from GoFood receipt text.
 */

/**
 * Parse a price string in Indonesian format.
 * Handles: "Rp 25.000", "Rp25.000", "25000", "25,000", "Rp 25000", "-Rp42.400"
 * Always returns a positive number (minus sign is stripped).
 * @param {string} str
 * @returns {number}
 */
function parsePrice(str) {
  if (!str) return 0;
  // Strip minus sign, Rp prefix, spaces, dots, and commas
  const cleaned = str
    .replace(/^-/, '')
    .replace(/[Rr]p\.?\s*/g, '')
    .replace(/[.,]/g, '')
    .trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse GoFood receipt text into structured data.
 * @param {string} text - Raw OCR text from a GoFood receipt
 * @returns {{items: Array<{name: string, quantity: number, price: number, total: number}>, subtotal: number, discount: number, deliveryFee: number, platform: string}}
 */
export function parseGoFoodReceipt(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  let subtotal = 0;
  let discount = 0;
  let deliveryFee = 0;

  // Primary pattern for real receipts: "4  L Original Pot Besar  @Rp20.300  Rp81.200"
  // Captures qty, name, and the LAST Rp value (total price)
  const realItemPattern =
    /^(\d+)\s+(.+?)\s+@\s*[Rr]p[\d.,]+\s+([Rr]p[\d.,]+)\s*$/;
  // Legacy pattern 1: "1x Item Name  Price" or "2x Item Name  Rp 25.000"
  const legacyPatternA =
    /^(\d+)\s*x\s+(.+?)\s{2,}((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/;
  // Legacy pattern 2: "Qty x Price" (with optional Rp) - item name is on previous line
  const legacyPatternB = /^(\d+)\s*x\s+((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for subtotal (Total harga, Subtotal)
    if (/^(total\s*harga|subtotal)/i.test(line)) {
      const priceMatch = line.match(/((?:-?\s*)?(?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        subtotal = parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        subtotal = parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Check for discount (Diskon, Promo, Potongan) - NOT lines that also contain "Biaya"
    if (/^(diskon|promo|potongan)/i.test(line) && !/biaya/i.test(line)) {
      const priceMatch = line.match(/(-?\s*(?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        discount = parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        discount = parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Check for delivery/service fees - accumulate ALL "Biaya" lines
    if (/biaya/i.test(line)) {
      const priceMatch = line.match(/((?:-?\s*)?(?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        deliveryFee += parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        deliveryFee += parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Legacy: Check for ongkos kirim/delivery fee keywords (single delivery fee)
    if (/^(ongkos\s*kirim|delivery\s*fee)/i.test(line)) {
      const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        deliveryFee += parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        deliveryFee += parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Try primary real receipt pattern: "4  L Original Pot Besar  @Rp20.300  Rp81.200"
    const realMatch = realItemPattern.exec(line);
    if (realMatch) {
      const qty = parseInt(realMatch[1], 10);
      const name = realMatch[2].trim();
      const total = parsePrice(realMatch[3]);
      const price = Math.round(total / qty);
      items.push({ name, quantity: qty, price, total });
      continue;
    }

    // Check for "Qty x Price" line (previous line is item name) - must check before pattern A
    const matchB = line.match(legacyPatternB);
    if (matchB && i > 0) {
      const qty = parseInt(matchB[1], 10);
      const price = parsePrice(matchB[2]);
      const name = lines[i - 1].trim();
      // Only use if the previous line is not a known label
      if (!isKnownLabel(name)) {
        items.push({ name, quantity: qty, price, total: qty * price });
        continue;
      }
    }

    // Try legacy "1x Item Name  Price" (with at least 2 spaces before price)
    const matchA = line.match(legacyPatternA);
    if (matchA) {
      const qty = parseInt(matchA[1], 10);
      const name = matchA[2].trim();
      const price = parsePrice(matchA[3]);
      items.push({ name, quantity: qty, price, total: qty * price });
      continue;
    }
  }

  return {
    items,
    subtotal,
    discount,
    deliveryFee,
    platform: 'gofood',
  };
}

function isKnownLabel(text) {
  return /^(subtotal|total\s*harga|diskon|promo|potongan|ongkos\s*kirim|biaya|delivery\s*fee)/i.test(
    text,
  );
}
