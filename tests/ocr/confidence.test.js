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
    expect(result.issues).toContain('No items detected');
    expect(result.issues).toContain('Subtotal not detected');
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
    expect(result.issues).toContain('Subtotal not detected');
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
    expect(result.issues.some((i) => i.includes('unusual prices'))).toBe(true);
  });

  it('flags items with price exceeding 500000', () => {
    const ocrConfidence = 90;
    const parsedResult = {
      items: [{ name: 'Expensive', quantity: 1, price: 600000, total: 600000 }],
      subtotal: 600000,
      discount: 0,
      deliveryFee: 0,
    };

    const result = scoreConfidence(ocrConfidence, parsedResult);

    expect(result.issues.some((i) => i.includes('unusual prices'))).toBe(true);
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
});
