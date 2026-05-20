/**
 * GoFood receipt parser.
 * Extracts items, prices, subtotal, discount, and delivery fee from GoFood receipt text.
 */

/**
 * Parse a price string in Indonesian format.
 * Handles: "Rp 25.000", "Rp25.000", "25000", "25,000", "Rp 25000",
 *          "-Rp42.400", "-Rp 42.400" (strip minus, return positive number)
 * @param {string} str
 * @returns {number}
 */
function parsePrice(str) {
  if (!str) return 0;
  // Strip minus sign, Rp prefix, spaces, dots and commas
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
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const items = [];
  let subtotal = 0;
  let discount = 0;
  let deliveryFee = 0;

  // Real GoFood format: "4  L Original Pot Besar  @Rp20.300  Rp81.200"
  const itemPatternReal = /^(\d+)\s+(.+?)\s+@\s*Rp[\d.,]+\s+(Rp[\d.,]+)\s*$/;
  // Fallback: "1x Item Name  Price" or "2x Item Name  Rp 25.000"
  const itemPatternA = /^(\d+)\s*x\s+(.+?)\s{2,}((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/;
  // Pattern: "Qty x Price" (item name on previous line)
  const itemPatternB = /^(\d+)\s*x\s+((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for subtotal
    if (/^(subtotal|total\s*harga)/i.test(line)) {
      const priceMatch = line.match(/((?:-?\s*)?(?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        subtotal = parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        subtotal = parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Check for discount
    if (/^(diskon|promo|potongan)/i.test(line)) {
      const priceMatch = line.match(/(-?\s*(?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        discount = parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        discount = parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Check for delivery fee - accumulate ALL "biaya" lines (but NOT diskon lines)
    if (/biaya/i.test(line) && !/diskon/i.test(line)) {
      const priceMatch = line.match(/((?:-?\s*)?(?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        deliveryFee += parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        deliveryFee += parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Check for legacy delivery fee labels
    if (/^(ongkos\s*kirim|delivery\s*fee)/i.test(line)) {
      const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
      if (priceMatch) {
        deliveryFee += parsePrice(priceMatch[1]);
      } else if (i + 1 < lines.length) {
        deliveryFee += parsePrice(lines[i + 1]);
      }
      continue;
    }

    // Try real GoFood format: "4  L Original Pot Besar  @Rp20.300  Rp81.200"
    const matchReal = itemPatternReal.exec(line);
    if (matchReal) {
      const qty = parseInt(matchReal[1], 10);
      const name = matchReal[2].trim();
      const total = parsePrice(matchReal[3]);
      const price = Math.round(total / qty);
      items.push({ name, quantity: qty, price, total });
      continue;
    }

    // Check for "Qty x Price" line first (previous line is item name)
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
  return /^(subtotal|total\s*harga|diskon|promo|potongan|ongkos\s*kirim|biaya|delivery\s*fee)/i.test(text);
}
