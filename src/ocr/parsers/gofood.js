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

  // Pattern 1: @ or similar prefix before unit price (@ misread as a or ©)
  // e.g. "4  L Original Pot Besar  @Rp20.300  Rp81.200"
  const patternAtPrefix =
    /^(\d+)\s+(.+?)\s+[@a©]\s*[Rr]p[\d.,]+\s+([Rr]p[\d.,]+)\s*$/;
  // Pattern 2: Two Rp values on the line (no @ at all)
  // e.g. "4  L Original Pot Besar  Rp20.300  Rp81.200"
  const patternTwoRp =
    /^(\d+)\s+(.+?)\s+[Rr]p[\d.,]+\s+([Rr]p[\d.,]+)\s*$/;
  // Pattern 3: QTY and one Rp value (total only, no unit price)
  // e.g. "4  L Original Pot Besar  Rp81.200"
  const patternSingleRp = /^(\d+)\s+(.+?)\s+([Rr]p[\d.,]+)\s*$/;
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

    // Try pattern 1: @ or similar prefix before unit price
    const matchAt = patternAtPrefix.exec(line);
    if (matchAt) {
      const qty = parseInt(matchAt[1], 10);
      const name = matchAt[2].trim();
      const total = parsePrice(matchAt[3]);
      const price = Math.round(total / qty);
      items.push({ name, quantity: qty, price, total });
      continue;
    }

    // Try pattern 2: Two Rp values (no @ symbol)
    const matchTwoRp = patternTwoRp.exec(line);
    if (matchTwoRp) {
      const qty = parseInt(matchTwoRp[1], 10);
      const name = matchTwoRp[2].trim();
      const total = parsePrice(matchTwoRp[3]);
      const price = Math.round(total / qty);
      items.push({ name, quantity: qty, price, total });
      continue;
    }

    // Try pattern 3: Single Rp value (total only)
    const matchSingleRp = patternSingleRp.exec(line);
    if (matchSingleRp) {
      const qty = parseInt(matchSingleRp[1], 10);
      const name = matchSingleRp[2].trim();
      const total = parsePrice(matchSingleRp[3]);
      // Guard: item name must be at least 3 chars, not a known label, and price >= 1000
      if (name.length >= 3 && !isKnownLabel(name) && total >= 1000) {
        const price = Math.round(total / qty);
        items.push({ name, quantity: qty, price, total });
        continue;
      }
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
  return /^(subtotal|total|diskon|promo|potongan|ongkos\s*kirim|biaya|delivery\s*fee)/i.test(
    text,
  );
}
