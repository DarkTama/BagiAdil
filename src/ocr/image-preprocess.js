/**
 * OCR image preprocessing.
 * Converts an uploaded photo to grayscale with a mild contrast stretch before
 * OCR - this helps Tesseract on photographed receipts. It is always safe to
 * call: non-images, failures, and unsupported environments return the
 * original file unchanged. The conversion is deliberately gentle (no hard
 * binarization) so it does not degrade already-clean screenshots.
 */

/**
 * Preprocess an image for OCR: downscale, grayscale, mild contrast stretch.
 * @param {File|Blob} file - The uploaded image.
 * @param {object} [options]
 * @param {number} [options.maxDimension=2000] - Longest-edge cap in pixels.
 * @returns {Promise<File|Blob>} The processed blob, or the original file.
 */
export async function preprocessForOCR(file, { maxDimension = 2000 } = {}) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return file;
  }
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxDimension ? maxDimension / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Pass 1: grayscale via luminance, tracking the value range.
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
      );
      data[i] = lum;
      data[i + 1] = lum;
      data[i + 2] = lum;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }

    // Pass 2: mild contrast stretch - normalize the range to 0-255. Skipped
    // when the range is already full (clean screenshots) or degenerate.
    const range = max - min;
    if (range > 0 && range < 255) {
      const factor = 255 / range;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.min(255, Math.max(0, Math.round((data[i] - min) * factor)));
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });
    return blob || file;
  } catch {
    return file;
  }
}
