// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { preprocessForOCR } from '../../src/ocr/image-preprocess.js';

describe('preprocessForOCR', () => {
  it('returns non-image files unchanged', async () => {
    const pdf = new File(['%PDF-1.4'], 'receipt.pdf', {
      type: 'application/pdf',
    });
    expect(await preprocessForOCR(pdf)).toBe(pdf);
  });

  it('returns falsy input unchanged', async () => {
    expect(await preprocessForOCR(null)).toBe(null);
    expect(await preprocessForOCR(undefined)).toBe(undefined);
  });

  it('returns the original image when the environment cannot process it', async () => {
    // jsdom provides no createImageBitmap, so preprocessing is safely skipped.
    const img = new File([new Uint8Array([1, 2, 3, 4])], 'receipt.jpg', {
      type: 'image/jpeg',
    });
    expect(await preprocessForOCR(img)).toBe(img);
  });
});
