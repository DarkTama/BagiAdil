/**
 * GoFood receipt parser.
 * Extracts items, prices, subtotal, discount, and delivery fee from GoFood receipt text.
 */

/**
 * Parse a price string in Indonesian format.
 * Handles: "Rp 25.000", "Rp25.000", "25000", "25,000", "Rp 25000"
 * @param {string} str
 * @returns {number}
 */
function parsePrice(str) {
  if (!str) return 0;
  // Remove "Rp" prefix, spaces, dots (thousands separator), and commas
  const cleaned = str.replace(/[Rr]p\.?\s*/g, '').replace(/[.,]/g, '').trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse GoFood receipt text into structured data.
 * @param {string} text - Raw OCR text from a GoFood receipt
 * @returns {{items: Array<{name: string, quantity: number, price: number, total: number}>, subtotal: number, discount: number, deliveryFee: number, platform: string}}
 */
export function parseGoFoodReceipt(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const items = [];
  let subtotal = 0;
  let discount = 0;
  let deliveryFee = 0;

  // Pattern 1: "1x Item Name  Price" or "2x Item Name  Rp 25.000"
  // Name must not start with "Rp" to avoid false matches with "Qty x Rp Price" format
  const itemPatternA = /^(\d+)\s*x\s+(.+?)\s{2,}((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/;
  // Pattern 2: "Qty x Price" (with optional Rp) - item name is on previous line
  const itemPatternB = /^(\d+)\s*x\s+((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for "Qty x Price" line first (previous line is item name)
    // This must be checked before pattern A to avoid false matches
    const matchB = line.match(itemPatternB);
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

    // Check for "1x Item Name  Price" (with at least 2 spaces before price)
    const matchA = line.match(itemPatternA);
    if (matchA) {
      const qty = parseInt(matchA[1], 10);
      const name = matchA[2].trim();
      const price = parsePrice(matchA[3]);
      items.push({ name, quantity: qty, price, total: qty * price });
      continue;
    }

    // Check for subtotal
    if (/^(subtotal|total\s*harga)/i.test(line)) {
      const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        subtotal = parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        subtotal = parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Check for discount
    if (/^(diskon|promo|potongan)/i.test(line)) {
      const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        discount = parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        discount = parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Check for delivery fee
    if (/^(ongkos\s*kirim|biaya\s*pengiriman|delivery\s*fee)/i.test(line)) {
      const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        deliveryFee = parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        deliveryFee = parsePrice(lines[i + 1]);
      }
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
  return /^(subtotal|total\s*harga|diskon|promo|potongan|ongkos\s*kirim|biaya\s*pengiriman|delivery\s*fee)/i.test(text);
}
