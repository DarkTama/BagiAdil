/**
 * PDF text extraction engine using pdfjs-dist.
 * Lazy-loads pdfjs-dist only when needed.
 */

/**
 * Process a PDF file and extract its text content.
 * @param {File} file - PDF file to process
 * @param {function} [onProgress] - Progress callback receiving {status, progress (0-1)}
 * @returns {Promise<{text: string, confidence: number}|{error: string}>}
 */
export async function processPDF(file, onProgress) {
  try {
    if (onProgress) {
      onProgress({ status: 'Loading PDF library...', progress: 0 });
    }

    const pdfjsLib = await import('pdfjs-dist');

    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;

    if (onProgress) {
      onProgress({ status: 'Reading PDF file...', progress: 0.1 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const totalPages = pdf.numPages;
    const textParts = [];

    for (let i = 1; i <= totalPages; i++) {
      if (onProgress) {
        onProgress({
          status: `Processing page ${i} of ${totalPages}...`,
          progress: 0.1 + (i / totalPages) * 0.9,
        });
      }

      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // Collect all items with their Y and X positions
      const rawItems = textContent.items.map((item) => ({
        str: item.str,
        y: item.transform[5],
        x: item.transform[4],
      }));

      // Sort by Y descending (PDF Y is bottom-up)
      rawItems.sort((a, b) => b.y - a.y);

      // Group by proximity: items within 3 units of the group's Y are same line
      const lines = [];
      rawItems.forEach((item) => {
        const lastLine = lines[lines.length - 1];
        if (lastLine && Math.abs(lastLine.y - item.y) <= 3) {
          lastLine.items.push(item);
        } else {
          lines.push({ y: item.y, items: [item] });
        }
      });

      // Sort items within each line by X position, then join
      const pageText = lines.map((line) => {
        return line.items.sort((a, b) => a.x - b.x).map(i => i.str).join(' ');
      }).join('\n');
      textParts.push(pageText);
    }

    const text = textParts.join('\n');

    if (!text.trim()) {
      return {
        error:
          'No text found in PDF. The file may be a scanned image - try uploading as an image for OCR processing.',
      };
    }

    if (onProgress) {
      onProgress({ status: 'Complete!', progress: 1 });
    }

    return { text, confidence: 100 };
  } catch (err) {
    return { error: err.message || 'Failed to process PDF' };
  }
}
