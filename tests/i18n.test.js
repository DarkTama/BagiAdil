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
});
