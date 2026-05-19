/**
 * Parser registry.
 * Auto-detects platform and routes to the appropriate parser.
 */

import { parseGoFoodReceipt } from './gofood.js';
import { parseShopeeReceipt } from './shopeefood.js';
import { parseGrabReceipt } from './grabfood.js';

export { parseGoFoodReceipt } from './gofood.js';
export { parseShopeeReceipt } from './shopeefood.js';
export { parseGrabReceipt } from './grabfood.js';

/**
 * Detect platform based on keywords in the OCR text.
 * @param {string} text - OCR extracted text
 * @returns {'gofood'|'shopeefood'|'grabfood'|'unknown'}
 */
export function detectPlatform(text) {
  const lower = text.toLowerCase();

  if (lower.includes('gofood') || lower.includes('go-food') || lower.includes('go food')) {
    return 'gofood';
  }

  if (lower.includes('shopeefood') || lower.includes('shopee food') || lower.includes('shopee')) {
    return 'shopeefood';
  }

  if (lower.includes('grabfood') || lower.includes('grab food') || lower.includes('grab')) {
    return 'grabfood';
  }

  return 'unknown';
}

/**
 * Parse receipt text using the specified or auto-detected platform parser.
 * @param {string} text - OCR extracted text
 * @param {string} [platform] - Optional platform override ('gofood', 'shopeefood', 'grabfood')
 * @returns {{items: Array, subtotal: number, discount: number, deliveryFee: number, platform: string}|{error: string}}
 */
export function parseReceipt(text, platform) {
  const detectedPlatform = platform || detectPlatform(text);

  switch (detectedPlatform) {
    case 'gofood':
      return parseGoFoodReceipt(text);
    case 'shopeefood':
      return parseShopeeReceipt(text);
    case 'grabfood':
      return parseGrabReceipt(text);
    default:
      return { error: 'Unable to detect platform. Please select manually.' };
  }
}
