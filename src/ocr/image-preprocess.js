/**
 * OCR image preprocessing.
 * Keeps clean full-contrast screenshots in color (returning the original file
 * unchanged when already within maxDimension) and converts low-contrast photos
 * to grayscale with a contrast stretch for Tesseract. It is always safe to
 * call: non-images, failures, and unsupported environments return the
 * original file unchanged.
 */

/**
 * Preprocess an image for OCR: downscale oversized images and apply
 * grayscale + contrast stretch only for low-contrast photos.
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

    // Pass 1: read-only luminance scan to check whether contrast stretching is needed.
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
      );
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }

    const range = max - min;
    const needsContrastStretch = range > 0 && (min > 15 || max < 240);

    if (!needsContrastStretch) {
      // Clean full-contrast screenshots perform worse in Tesseract when forced
      // to grayscale; return the original file if no downscaling was needed,
      // or encode the full-color downscaled canvas.
      if (scale === 1) {
        return file;
      }
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });
      return blob || file;
    }

    // Pass 2: grayscale + contrast stretch to [0, 255] for low-contrast photos.
    const factor = 255 / range;
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
      );
      const v = Math.min(255, Math.max(0, Math.round((lum - min) * factor)));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
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
