// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { generateWhatsAppText } from '../../src/ui/export.js';
import { splitBill } from '../../src/engine/calculator.js';

describe('Export - WhatsApp Text Generation', () => {
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
      expect(text).toContain('*BagiAdil - Bill Split*');
    });

    it('should include total tagihan (original total)', () => {
      const text = generateWhatsAppText(sampleResult, {
        totalDiscount: 10000,
        totalShipping: 12000,
      });
      // Total tagihan = 25000 + 35000 + 15000 = 75000
      expect(text).toContain('Total Tagihan:');
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

    it('should include balanced/unbalanced status', () => {
      const text = generateWhatsAppText(sampleResult, {
        totalDiscount: 10000,
        totalShipping: 12000,
      });
      expect(text).toMatch(/_(Total: .+ \((balanced|unbalanced)\))_/);
    });
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
      expect(text).toContain('*BagiAdil - Bill Split*');
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
