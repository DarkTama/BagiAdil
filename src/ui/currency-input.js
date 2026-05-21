/**
 * Currency input helper.
 * Turns a plain numeric input into one that displays Indonesian Rupiah
 * (e.g. "Rp 15.500") while the user types.
 */

import { formatCurrency, parseRupiah } from '../engine/formatter.js';

/**
 * Attach live Rupiah formatting to a text input.
 * @param {HTMLInputElement} input
 */
export function attachCurrencyInput(input) {
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.addEventListener('input', () => {
    const amount = parseRupiah(input.value);
    input.value = amount ? formatCurrency(amount) : '';
    // Keep the caret at the end after reformatting.
    const end = input.value.length;
    input.setSelectionRange(end, end);
  });
}

/**
 * Read the integer amount from a currency input.
 * @param {HTMLInputElement} input
 * @returns {number}
 */
export function getCurrencyValue(input) {
  return parseRupiah(input?.value);
}

/**
 * Set a currency input's displayed value from an integer amount.
 * @param {HTMLInputElement} input
 * @param {number} amount
 */
export function setCurrencyValue(input, amount) {
  if (!input) return;
  const num = parseRupiah(amount);
  input.value = num ? formatCurrency(num) : '';
}
