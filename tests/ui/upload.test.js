// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initUpload } from '../../src/ui/upload.js';

describe('upload control (audit H6/M17)', () => {
  it('is a focusable button that opens the picker, without camera-only capture', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    initUpload(el, () => {});

    const btn = el.querySelector('#upload-btn');
    const input = el.querySelector('#receipt-file-input');
    expect(btn.tagName).toBe('BUTTON');
    expect(input.hasAttribute('capture')).toBe(false);

    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    btn.click();
    expect(click).toHaveBeenCalledTimes(1); // button click must not bubble into a 2nd open

    el.querySelector('.upload-text').click();
    expect(click).toHaveBeenCalledTimes(2); // empty part of the zone also opens it
  });
});
