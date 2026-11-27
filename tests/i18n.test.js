import { describe, it, expect } from 'vitest';
import id from '../src/i18n/id.js';
import en from '../src/i18n/en.js';

describe('i18n translations', () => {
  it('has footer.credit defined in both id and en', () => {
    expect(id['footer.credit']).toBeDefined();
    expect(typeof id['footer.credit']).toBe('string');
    expect(id['footer.credit'].length).toBeGreaterThan(0);

    expect(en['footer.credit']).toBeDefined();
    expect(typeof en['footer.credit']).toBe('string');
    expect(en['footer.credit'].length).toBeGreaterThan(0);
  });

  it('has item inline editing keys defined in both id and en', () => {
    const keys = [
      'table.edit',
      'table.save',
      'table.cancel',
      'table.errorItemName',
      'table.errorItemPrice',
      'table.errorItemQty',
      'table.qtyBelowAssigned',
    ];

    keys.forEach((key) => {
      expect(id[key], `Missing ${key} in id`).toBeDefined();
      expect(typeof id[key]).toBe('string');
      expect(id[key].length).toBeGreaterThan(0);

      expect(en[key], `Missing ${key} in en`).toBeDefined();
      expect(typeof en[key]).toBe('string');
      expect(en[key].length).toBeGreaterThan(0);
    });
  });
});

describe('i18n key parity', () => {
  it('has exactly the same keys in id and en', () => {
    const idKeys = Object.keys(id).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(idKeys);
  });

  it('has no empty translations', () => {
    [id, en].forEach((dict) => {
      Object.entries(dict).forEach(([key, value]) => {
        expect(value, key).toBeTypeOf('string');
        expect(value.trim().length, key).toBeGreaterThan(0);
      });
    });
  });
});
