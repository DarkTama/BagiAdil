/**
 * ShopeeFood receipt parser.
 * Extracts items, prices, subtotal, discount, and delivery fee from ShopeeFood receipt text.
 */

/**
 * Parse a price string in Indonesian format.
 * @param {string} str
 * @returns {number}
 */
function parsePrice(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[Rr]p\.?\s*/g, '').replace(/[.,]/g, '').trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse ShopeeFood receipt text into structured data.
 * @param {string} text - Raw OCR text from a ShopeeFood receipt
 * @returns {{items: Array<{name: string, quantity: number, price: number, total: number}>, subtotal: number, discount: number, deliveryFee: number, platform: string}}
 */
export function parseShopeeReceipt(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const items = [];
  let subtotal = 0;
  let discount = 0;
  let deliveryFee = 0;

  // Pattern: "Item Name  xQty  Price" or "Item Name  x2  Rp 25.000"
  const itemPatternA = /^(.+?)\s+x(\d+)\s+((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/;
  // Pattern: "Item Name  Rp XX.XXX" (qty=1 implied)
  const itemPatternB = /^(.+?)\s+((?:[Rr]p\.?\s*)[\d.,]+)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip known labels before trying item patterns
    if (isKnownLabel(line)) {
      // Extract value from the label line
      if (/^(subtotal|total\s*harga)/i.test(line)) {
        const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
        if (priceMatch) {
          subtotal = parsePrice(priceMatch[1]);
        } else if (i + 1 < lines.length) {
          subtotal = parsePrice(lines[i + 1]);
        }
      } else if (/^(voucher|diskon\s*shopeefood|diskon)/i.test(line)) {
        const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
        if (priceMatch) {
          discount = parsePrice(priceMatch[1]);
        } else if (i + 1 < lines.length) {
          discount = parsePrice(lines[i + 1]);
        }
      } else if (/^(ongkir|biaya\s*kirim|delivery)/i.test(line)) {
        const priceMatch = line.match(/((?:[Rr]p\.?\s*)?[\d.,]+)\s*$/);
        if (priceMatch) {
          deliveryFee = parsePrice(priceMatch[1]);
        } else if (i + 1 < lines.length) {
          deliveryFee = parsePrice(lines[i + 1]);
        }
      }
      continue;
    }

    // Try item pattern with quantity: "Item Name  x2  Rp 25.000"
    const matchA = itemPatternA.exec(line);
    if (matchA) {
      const name = matchA[1].trim();
      const qty = parseInt(matchA[2], 10);
      const price = parsePrice(matchA[3]);
      items.push({ name, quantity: qty, price, total: qty * price });
      continue;
    }

    // Try item pattern with Rp prefix (qty=1): "Item Name  Rp 25.000"
    const matchB = itemPatternB.exec(line);
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

function isKnownLabel(text) {
  return /^(subtotal|total\s*harga|voucher|diskon\s*shopeefood|diskon|ongkir|biaya\s*kirim|delivery)/i.test(text);
}
