// @vitest-environment jsdom

import { describe, it, expect, beforeAll } from 'vitest';
import { generateWhatsAppText, buildPdfContent } from '../../src/ui/export.js';
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
      expect(text).toMatch(/_(Total: .+ \((Seimbang|Tidak Seimbang)\))_/);
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

describe('Export - PDF content is XSS-safe', () => {
  beforeAll(() => {
    setLocale('id');
  });

  it('renders malicious participant and item names as text, not markup', () => {
    const evilName = '<img src=x onerror="alert(1)">';
    const evilItem = '<script>alert(2)</script>';

    const result = splitBill({
      orders: [
        { name: evilName, amount: 25000 },
        { name: 'Bob', amount: 15000 },
      ],
      totalDiscount: 0,
      totalShipping: 0,
    });
    const itemsMap = {
      [evilName]: [{ name: evilItem, qty: 2, unitPrice: 5000, price: 10000 }],
    };

    const node = buildPdfContent(result, itemsMap);

    // No markup from the names was parsed into live elements.
    expect(node.querySelectorAll('img').length).toBe(0);
    expect(node.querySelectorAll('script').length).toBe(0);

    // The names survive verbatim as plain text.
    expect(node.textContent).toContain(evilName);
    expect(node.textContent).toContain(evilItem);

    const heading = [...node.querySelectorAll('h3')].find(
      (h) => h.textContent === evilName,
    );
    expect(heading).toBeTruthy();
  });

  it('builds one card per participant', () => {
    const result = splitBill({
      orders: [
        { name: 'Alice', amount: 25000 },
        { name: 'Bob', amount: 15000 },
      ],
      totalDiscount: 5000,
      totalShipping: 4000,
    });
    const node = buildPdfContent(result, null);
    expect(node.querySelectorAll('h3').length).toBe(2);
    expect(node.textContent).toContain('Alice');
    expect(node.textContent).toContain('Bob');
  });
});
