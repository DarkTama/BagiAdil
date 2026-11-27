// @vitest-environment jsdom

import { describe, it, expect, beforeAll } from 'vitest';
import { generateWhatsAppText } from '../../src/ui/export.js';
import { splitBill } from '../../src/engine/calculator.js';
import { setLocale } from '../../src/i18n/index.js';

describe('Export - WhatsApp Text Generation', () => {
  beforeAll(() => {
    setLocale('id');
  });

  const sampleResult = splitBill({
    orders: [
      { name: 'Alice', amount: 25000 },
      { name: 'Bob', amount: 35000 },
      { name: 'Charlie', amount: 15000 },
    ],
    totalDiscount: 10000,
    totalShipping: 12000,
  });

  describe('format structure', () => {
    it('should include BagiAdil header', () => {
      const text = generateWhatsAppText(sampleResult, {
        totalDiscount: 10000,
        totalShipping: 12000,
      });
      expect(text).toContain('*BagiAdil - Pembagian Tagihan*');
    });

    it('should include the food total', () => {
      const text = generateWhatsAppText(sampleResult, {
        totalDiscount: 10000,
        totalShipping: 12000,
      });
      // Food total = 25000 + 35000 + 15000 = 75000
      expect(text).toContain('Total Makanan:');
      expect(text).toContain('75.000');
    });

    it('should include discount and shipping', () => {
      const text = generateWhatsAppText(sampleResult, {
        totalDiscount: 10000,
        totalShipping: 12000,
      });
      expect(text).toContain('Diskon:');
      expect(text).toContain('10.000');
      expect(text).toContain('Ongkir:');
      expect(text).toContain('12.000');
    });

    it('should include pembagian section header', () => {
      const text = generateWhatsAppText(sampleResult, {
        totalDiscount: 10000,
        totalShipping: 12000,
      });
      expect(text).toContain('*Pembagian:*');
    });

    it('ends with the grand total and no internal balance jargon', () => {
      const text = generateWhatsAppText(sampleResult, {
        totalDiscount: 10000,
        totalShipping: 12000,
      });
      expect(text).toMatch(/_Total: [^()]+_/);
      expect(text).not.toMatch(/Seimbang/);
    });

    it('appends the share link only when one is provided', () => {
      const params = { totalDiscount: 10000, totalShipping: 12000 };
      const withLink = generateWhatsAppText(
        sampleResult,
        params,
        'https://bagiadil.test/#share=abc123',
      );
      expect(withLink).toContain('https://bagiadil.test/#share=abc123');
      expect(generateWhatsAppText(sampleResult, params)).not.toContain('#share=');
    });
  });

    it('includes payment destination when provided', () => {
      const text = generateWhatsAppText(
        sampleResult,
        { totalDiscount: 10000, totalShipping: 12000 },
        '',
        { bank: 'BCA', accountNumber: '1234567890', accountName: 'Budi' },
      );
      expect(text).toContain('*Pembayaran:*');
      expect(text).toContain('BCA: 1234567890');
      expect(text).toContain('a.n. Budi');
    });

    it('omits payment destination when null or empty', () => {
      const text = generateWhatsAppText(
        sampleResult,
        { totalDiscount: 10000, totalShipping: 12000 },
        '',
        null,
      );
      expect(text).not.toContain('*Pembayaran:*');
    });

  describe('participant names and amounts', () => {
    it('should contain all participant names', () => {
      const text = generateWhatsAppText(sampleResult, {
        totalDiscount: 10000,
        totalShipping: 12000,
      });
      expect(text).toContain('Alice');
      expect(text).toContain('Bob');
      expect(text).toContain('Charlie');
    });

    it('should list each participant with dash prefix', () => {
      const text = generateWhatsAppText(sampleResult, {
        totalDiscount: 10000,
        totalShipping: 12000,
      });
      expect(text).toContain('- Alice:');
      expect(text).toContain('- Bob:');
      expect(text).toContain('- Charlie:');
    });

    it('should include Rp amounts for each participant', () => {
      const text = generateWhatsAppText(sampleResult, {
        totalDiscount: 10000,
        totalShipping: 12000,
      });
      // Each participant line should contain "Rp" with an amount
      const lines = text.split('\n').filter((l) => l.startsWith('- '));
      expect(lines.length).toBe(3);
      lines.forEach((line) => {
        expect(line).toContain('Rp');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle single participant', () => {
      const result = splitBill({
        orders: [{ name: 'Alice', amount: 50000 }],
        totalDiscount: 0,
        totalShipping: 10000,
      });
      const text = generateWhatsAppText(result, {
        totalDiscount: 0,
        totalShipping: 10000,
      });
      expect(text).toContain('- Alice:');
      expect(text).toContain('*BagiAdil - Pembagian Tagihan*');
    });

    it('should handle zero discount and shipping', () => {
      const result = splitBill({
        orders: [
          { name: 'Alice', amount: 30000 },
          { name: 'Bob', amount: 20000 },
        ],
        totalDiscount: 0,
        totalShipping: 0,
      });
      const text = generateWhatsAppText(result);
      expect(text).toContain('Diskon: Rp 0');
      expect(text).toContain('Ongkir: Rp 0');
    });
  });
});

describe('Export - WhatsApp items', () => {
  beforeAll(() => {
    setLocale('id');
  });

  it('lists each person\'s items under their line, without breaking the "- " lines', () => {
    const result = splitBill({ orders: [{ name: 'Ani', amount: 30000 }], totalDiscount: 0, totalShipping: 0 });
    const text = generateWhatsAppText(result, {}, '', null, {
      Ani: [
        { name: 'Nasi', qty: 2, unitPrice: 10000, price: 20000 },
        { name: 'Teh', qty: 1, unitPrice: 10000, price: 10000 },
      ],
    });
    expect(text).toContain('- Ani: Rp 30.000\n   · 2x Nasi\n   · Teh\n');
    expect(text.split('\n').filter((l) => l.startsWith('- ')).length).toBe(1);
  });
});
