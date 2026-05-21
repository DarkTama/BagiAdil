// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { compressImage } from '../../src/ocr/image-compress.js';

describe('compressImage', () => {
  it('returns non-image files unchanged', async () => {
    const pdf = new File(['%PDF-1.4'], 'receipt.pdf', {
      type: 'application/pdf',
    });
    expect(await compressImage(pdf)).toBe(pdf);
  });

  it('returns falsy input unchanged', async () => {
    expect(await compressImage(null)).toBe(null);
    expect(await compressImage(undefined)).toBe(undefined);
  });

  it('returns the original image when the environment cannot compress', async () => {
    // jsdom provides no createImageBitmap, so compression is safely skipped
    // and the original file is returned.
    const img = new File([new Uint8Array([1, 2, 3, 4])], 'receipt.jpg', {
      type: 'image/jpeg',
    });
    expect(await compressImage(img)).toBe(img);
  });
});
