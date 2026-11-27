// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { setLocale, getLocale, t } from '../src/i18n/index.js';

describe('setLocale', () => {
  afterEach(() => setLocale('id'));

  it('keeps <html lang> in sync with the active locale (audit M9)', () => {
    expect(document.documentElement.lang).toBe('id');
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(t('validation.nameEmpty')).toBe('Name cannot be empty');
  });
});
