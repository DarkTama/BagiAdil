/**
 * OCR Engine wrapper around Tesseract.js.
 * Lazy-loads Tesseract.js only when needed.
 */

let worker = null;

/**
 * Initialize the OCR worker with Indonesian language (English fallback).
 * @param {function} [onProgress] - Progress callback receiving {status, progress (0-1)}
 * @returns {Promise<void>}
 */
export async function initOCR(onProgress) {
  if (worker) return;

  const Tesseract = await import('tesseract.js');
  worker = await Tesseract.createWorker('ind+eng', undefined, {
    logger: (info) => {
      if (onProgress && info.progress !== undefined) {
        onProgress({ status: info.status, progress: info.progress });
      }
    },
  });
}

/**
 * Process an image source through OCR.
 * @param {File|Blob|string} imageSource - Image file, blob, or URL
 * @param {function} [onProgress] - Progress callback
 * @param {object} [options]
 * @param {string|number} [options.psm] - Optional Tesseract page segmentation mode
 * @returns {Promise<{text: string, confidence: number}|{error: string}>}
 */
export async function processImage(imageSource, onProgress, options = {}) {
  try {
    if (!worker) {
      await initOCR(onProgress);
    }

    if (options.psm !== undefined) {
      await worker.setParameters({ tessedit_pageseg_mode: String(options.psm) });
    }

    const result = await worker.recognize(imageSource);
    return {
      text: result.data.text,
      confidence: result.data.confidence,
    };
  } catch (err) {
    return { error: err.message || 'Failed to process image' };
  }
}

/**
 * Terminate the OCR worker and free resources.
 * @returns {Promise<void>}
 */
export async function terminateOCR() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
