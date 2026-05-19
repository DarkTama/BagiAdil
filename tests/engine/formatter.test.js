import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../../src/engine/formatter.js';

describe('formatCurrency', () => {
  it('formats a basic amount in IDR with Rp prefix', () => {
    const result = formatCurrency(25000);
    expect(result).toBe('Rp 25.000');
  });

  it('formats zero', () => {
    const result = formatCurrency(0);
    expect(result).toBe('Rp 0');
  });

  it('formats large amounts with proper thousand separators (dots)', () => {
    const result = formatCurrency(1500000);
    expect(result).toBe('Rp 1.500.000');
  });

  it('formats without decimal fraction digits', () => {
    const result = formatCurrency(25000);
    // Should not contain decimal fraction like ,00
    expect(result).not.toMatch(/,\d{2}$/);
  });

  it('formats string input', () => {
    const result = formatCurrency('42000');
    expect(result).toBe('Rp 42.000');
  });

  it('formats amounts that are multiples of 100', () => {
    const result = formatCurrency(99000);
    expect(result).toBe('Rp 99.000');
  });

  it('formats small amounts correctly', () => {
    const result = formatCurrency(500);
    expect(result).toBe('Rp 500');
  });
});
