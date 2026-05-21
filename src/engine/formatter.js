/**
 * Format a numeric amount as Indonesian Rupiah currency string.
 * Produces output like "Rp 25.000" using Indonesian convention.
 * @param {number|string|Decimal} amount
 * @returns {string} formatted currency string (e.g., "Rp 25.000")
 */
export function formatCurrency(amount) {
  const num = Number(amount);
  const formatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  let formatted = formatter.format(num);
  // Normalize across environments: ensure "Rp" prefix with space and dot separators
  // Some environments output "IDR 25,000" or "Rp25.000" depending on ICU data
  formatted = formatted.replace(/^(IDR|Rp)\s*/, 'Rp ');
  // Normalize thousand separator to dot (Indonesian convention)
  formatted = formatted.replace(/Rp /, 'Rp ').replace(/,/g, '.');
  return formatted;
}

/**
 * Parse a user-entered Rupiah string into an integer amount.
 * Strips every non-digit character ("Rp 15.500" -> 15500, "" -> 0).
 * @param {string|number} str
 * @returns {number}
 */
export function parseRupiah(str) {
  if (typeof str === 'number') return Math.round(str) || 0;
  if (!str) return 0;
  const digits = String(str).replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}
