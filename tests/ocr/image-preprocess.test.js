// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { preprocessForOCR } from '../../src/ocr/image-preprocess.js';

describe('preprocessForOCR', () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;

  afterEach(() => {
    if (originalCreateImageBitmap === undefined) {
      delete globalThis.createImageBitmap;
    } else {
      globalThis.createImageBitmap = originalCreateImageBitmap;
    }
    vi.restoreAllMocks();
  });

  function mockCanvasAndBitmap({ width, height, pixels }) {
    const closeSpy = vi.fn();
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      width,
      height,
      close: closeSpy,
    });

    const data = new Uint8ClampedArray(pixels);
    const drawImage = vi.fn();
    const putImageData = vi.fn();
    const ctx = {
      drawImage,
      getImageData: vi.fn(() => ({ data })),
      putImageData,
    };

    const outputBlob = new Blob(['processed'], { type: 'image/jpeg' });
    const toBlob = vi.fn((cb) => cb(outputBlob));

    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ctx,
          toBlob,
        };
      }
      return origCreateElement(tag);
    });

    return { data, drawImage, putImageData, toBlob, outputBlob, closeSpy };
  }

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

  it('returns full-contrast phone screenshot within maxDimension unchanged without grayscale or re-encoding', async () => {
    const img = new File([new Uint8Array([1, 2, 3, 4])], 'screenshot.jpg', {
      type: 'image/jpeg',
    });
    const { putImageData, toBlob, closeSpy } = mockCanvasAndBitmap({
      width: 1080,
      height: 2400,
      pixels: [0, 0, 0, 255, 255, 255, 255, 255],
    });

    const result = await preprocessForOCR(img);

    expect(result).toBe(img);
    expect(putImageData).not.toHaveBeenCalled();
    expect(toBlob).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('downscales oversized full-contrast screenshot in color as lossless PNG without grayscale', async () => {
    const img = new File([new Uint8Array([1, 2, 3, 4])], 'big-screenshot.png', {
      type: 'image/png',
    });
    const { drawImage, putImageData, toBlob, outputBlob } = mockCanvasAndBitmap({
      width: 1400,
      height: 3500,
      pixels: [0, 0, 0, 255, 255, 255, 255, 255],
    });

    const result = await preprocessForOCR(img);

    expect(result).toBe(outputBlob);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1120, 2800);
    expect(putImageData).not.toHaveBeenCalled();
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  });

  it('applies grayscale and contrast stretch to low-contrast photos', async () => {
    const img = new File([new Uint8Array([1, 2, 3, 4])], 'photo.jpg', {
      type: 'image/jpeg',
    });
    const { data, putImageData, toBlob, outputBlob } = mockCanvasAndBitmap({
      width: 800,
      height: 1200,
      pixels: [60, 60, 60, 255, 190, 190, 190, 255],
    });

    const result = await preprocessForOCR(img);

    expect(result).toBe(outputBlob);
    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
    expect(data[4]).toBe(255);
    expect(data[5]).toBe(255);
    expect(data[6]).toBe(255);
  });
});
