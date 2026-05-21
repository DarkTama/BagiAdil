/**
 * Client-side image compression for receipt uploads.
 * Downscaling large photos speeds up OCR and keeps the stored receipt copy
 * small. It is always safe to call: anything it cannot compress (non-images,
 * unsupported environments, failures, already-small images) is returned
 * unchanged.
 */

/**
 * Downscale and re-encode an image file as a JPEG blob.
 * @param {File|Blob} file - The uploaded image.
 * @param {object} [options]
 * @param {number} [options.maxDimension=2000] - Longest-edge cap in pixels.
 * @param {number} [options.quality=0.85] - JPEG quality (0-1).
 * @returns {Promise<File|Blob>} The compressed blob, or the original file.
 */
export async function compressImage(
  file,
  { maxDimension = 2000, quality = 0.85 } = {},
) {
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

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });

    // Keep the original when compression did not help (e.g. small screenshots).
    if (!blob || blob.size >= file.size) {
      return file;
    }
    return blob;
  } catch {
    return file;
  }
}
