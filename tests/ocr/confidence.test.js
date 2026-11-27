import { describe, it, expect } from 'vitest';
import { scoreConfidence } from '../../src/ocr/confidence.js';

describe('Confidence scoring', () => {
  it('returns high confidence for good OCR and complete parsing', () => {
    const ocrConfidence = 92;
    const parsedResult = {
      items: [
        { name: 'Nasi Goreng', quantity: 1, price: 25000, total: 25000 },
        { name: 'Es Teh', quantity: 2, price: 5000, total: 10000 },
        { name: 'Ayam Bakar', quantity: 1, price: 35000, total: 35000 },
      ],
      subtotal: 70000,
      discount: 10000,
      deliveryFee: 8000,
    };

    const result = scoreConfidence(ocrConfidence, parsedResult);

    expect(result.level).toBe('high');
    expect(result.overall).toBeGreaterThanOrEqual(80);
    expect(result.issues).toHaveLength(0);
  });

  it('returns low confidence for bad OCR and missing fields', () => {
    const ocrConfidence = 25;
    const parsedResult = {
      items: [],
      subtotal: 0,
      discount: 0,
      deliveryFee: 0,
    };

    const result = scoreConfidence(ocrConfidence, parsedResult);

    expect(result.level).toBe('low');
    expect(result.overall).toBeLessThan(50);
    expect(result.issues).toContainEqual({ key: 'confidence.noItems' });
    expect(result.issues).toContainEqual({ key: 'confidence.noSubtotal' });
  });

  it('returns medium confidence for decent OCR but incomplete parsing', () => {
    const ocrConfidence = 70;
    const parsedResult = {
      items: [{ name: 'Item', quantity: 1, price: 20000, total: 20000 }],
      subtotal: 0,
      discount: 0,
      deliveryFee: 0,
    };

    const result = scoreConfidence(ocrConfidence, parsedResult);

    expect(result.level).toBe('medium');
    expect(result.overall).toBeGreaterThanOrEqual(50);
    expect(result.overall).toBeLessThan(80);
    expect(result.issues).toContainEqual({ key: 'confidence.noSubtotal' });
  });

  it('flags items with unusual prices', () => {
    const ocrConfidence = 85;
    const parsedResult = {
      items: [
        { name: 'Normal Item', quantity: 1, price: 25000, total: 25000 },
        { name: 'Suspicious Item', quantity: 1, price: 100, total: 100 },
      ],
      subtotal: 25100,
      discount: 0,
      deliveryFee: 0,
    };

    const result = scoreConfidence(ocrConfidence, parsedResult);

    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.key === 'confidence.unusualPrices')).toBe(true);
  });

  it('flags items with price exceeding 2000000', () => {
    const ocrConfidence = 90;
    const parsedResult = {
      items: [{ name: 'Expensive', quantity: 1, price: 2500000, total: 2500000 }],
      subtotal: 2500000,
      discount: 0,
      deliveryFee: 0,
    };

    const result = scoreConfidence(ocrConfidence, parsedResult);

    expect(result.issues.some((i) => i.key === 'confidence.unusualPrices')).toBe(true);
  });

  it('accepts items priced up to 2000000 as reasonable', () => {
    const ocrConfidence = 90;
    const parsedResult = {
      items: [{ name: 'Party order', quantity: 1, price: 1500000, total: 1500000 }],
      subtotal: 1500000,
      discount: 0,
      deliveryFee: 0,
    };

    const result = scoreConfidence(ocrConfidence, parsedResult);

    expect(result.issues.some((i) => i.key === 'confidence.unusualPrices')).toBe(false);
  });

  it('handles zero OCR confidence', () => {
    const result = scoreConfidence(0, {
      items: [{ name: 'Item', quantity: 1, price: 20000, total: 20000 }],
      subtotal: 20000,
      discount: 0,
      deliveryFee: 0,
    });

    expect(result.overall).toBeLessThan(50);
    expect(result.level).toBe('low');
  });

  it('handles null/undefined OCR confidence gracefully', () => {
    const result = scoreConfidence(null, {
      items: [{ name: 'Item', quantity: 1, price: 20000, total: 20000 }],
      subtotal: 20000,
      discount: 0,
      deliveryFee: 0,
    });

    expect(result.overall).toBeDefined();
    expect(result.level).toBeDefined();
    expect(typeof result.overall).toBe('number');
  });

  it('clamps confidence to 0-100 range', () => {
    const result = scoreConfidence(150, {
      items: [
        { name: 'Item 1', quantity: 1, price: 20000, total: 20000 },
        { name: 'Item 2', quantity: 1, price: 30000, total: 30000 },
        { name: 'Item 3', quantity: 1, price: 15000, total: 15000 },
      ],
      subtotal: 65000,
      discount: 5000,
      deliveryFee: 8000,
    });

    expect(result.overall).toBeLessThanOrEqual(100);
    expect(result.overall).toBeGreaterThanOrEqual(0);
  });

  it('flags subtotal mismatch and caps confidence below high', () => {
    const parsedResult = {
      items: [
        { name: 'Paket Geprek Mentai B', quantity: 1, price: 34100, total: 34100 },
        { name: 'Paket Geprek B', quantity: 1, price: 32700, total: 32700 },
        { name: 'Es Susu Kurma', quantity: 1, price: 25000, total: 25000 },
      ],
      subtotal: 101400,
      discount: 50000,
      deliveryFee: 7500,
    };

    const res82 = scoreConfidence(82, parsedResult);
    expect(res82.overall).toBeLessThanOrEqual(75);
    expect(res82.level).toBe('medium');
    expect(res82.issues).toContainEqual({
      key: 'confidence.subtotalMismatch',
      itemsTotal: 91800,
      subtotal: 101400,
      diff: 9600,
    });

    const res98 = scoreConfidence(98, parsedResult);
    expect(res98.overall).toBeLessThanOrEqual(75);
    expect(res98.level).toBe('medium');
  });

  it('awards high confidence with no mismatch issue when items sum equals subtotal', () => {
    const result = scoreConfidence(85, {
      items: [
        { name: 'Paket Geprek Mentai B', quantity: 1, price: 34100, total: 34100 },
        { name: 'Cream Soup', quantity: 1, price: 9600, total: 9600 },
        { name: 'Paket Geprek B', quantity: 1, price: 32700, total: 32700 },
        { name: 'Es Susu Kurma', quantity: 1, price: 25000, total: 25000 },
      ],
      subtotal: 101400,
      discount: 50000,
      deliveryFee: 7500,
    });

    expect(result.level).toBe('high');
    expect(result.overall).toBeGreaterThanOrEqual(80);
    expect(result.issues).toEqual([]);
  });
});
