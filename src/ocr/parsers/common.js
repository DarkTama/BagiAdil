/**
 * Shared helpers for the receipt parsers.
 */

/**
 * Parse a price string in Indonesian format.
 * Handles: "Rp 25.000", "Rp25.000", "25000", "25,000", "Rp 25000", "-Rp42.400".
 * @param {string} str - Raw price text.
 * @param {object} [options]
 * @param {boolean} [options.signed=false] - When false (default), a leading
 *   minus sign is stripped so the result is always non-negative. When true,
 *   the sign is preserved.
 * @returns {number}
 */
export function parsePrice(str, { signed = false } = {}) {
  if (!str) return 0;
  let cleaned = String(str);
  if (!signed) {
    cleaned = cleaned.replace(/^-/, '');
  }
  cleaned = cleaned
    .replace(/[Rr]p\.?\s*/g, '')
    .replace(/[.,]/g, '')
    .trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}
