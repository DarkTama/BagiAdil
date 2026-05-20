import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => {
  const mockTextContent = {
    items: [
      { str: 'Nasi Goreng', transform: [1, 0, 0, 1, 50, 700] },
      { str: '2x', transform: [1, 0, 0, 1, 200, 700] },
      { str: '15000', transform: [1, 0, 0, 1, 300, 700] },
      { str: 'Es Teh', transform: [1, 0, 0, 1, 50, 680] },
      { str: '1x', transform: [1, 0, 0, 1, 200, 680] },
      { str: '5000', transform: [1, 0, 0, 1, 300, 680] },
    ],
  };

  const mockPage = {
    getTextContent: vi.fn().mockResolvedValue(mockTextContent),
  };

  const mockPdf = {
    numPages: 2,
    getPage: vi.fn().mockResolvedValue(mockPage),
  };

  const mockLoadingTask = {
    promise: Promise.resolve(mockPdf),
  };

  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(() => mockLoadingTask),
  };
});

describe('processPDF', () => {
  let processPDF;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../src/ocr/pdf-engine.js');
    processPDF = mod.processPDF;
  });

  it('should return extracted text with confidence 100 on success', async () => {
    const mockFile = {
      type: 'application/pdf',
      name: 'receipt.pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
    };

    const result = await processPDF(mockFile);

    expect(result).toHaveProperty('text');
    expect(result.confidence).toBe(100);
    expect(result.text).toContain('Nasi Goreng 2x 15000');
    expect(result.text).toContain('Es Teh 1x 5000');
    // Lines should be separated by newlines
    expect(result.text).toContain('Nasi Goreng 2x 15000\nEs Teh 1x 5000');
  });

  it('should call onProgress during processing', async () => {
    const mockFile = {
      type: 'application/pdf',
      name: 'receipt.pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
    };

    const onProgress = vi.fn();
    await processPDF(mockFile, onProgress);

    expect(onProgress).toHaveBeenCalled();
    // Should have been called for: loading library, reading file, page 1, page 2
    expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(4);

    // Check that progress values increase
    const progressValues = onProgress.mock.calls.map(
      (call) => call[0].progress,
    );
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
  });

  it('should return an error object on failure', async () => {
    const mockFile = {
      type: 'application/pdf',
      name: 'bad.pdf',
      arrayBuffer: vi.fn().mockRejectedValue(new Error('Corrupted PDF')),
    };

    const result = await processPDF(mockFile);

    expect(result).toHaveProperty('error');
    expect(result.error).toBe('Corrupted PDF');
    expect(result).not.toHaveProperty('text');
  });

  it('should group text items within 3 units of Y-coordinate into the same line', async () => {
    // Override the mock to return items with slightly different Y coords
    const pdfjsLib = await import('pdfjs-dist');
    const proximityTextContent = {
      items: [
        // Line 1: items at Y=700, Y=701.5, Y=699 (all within 3 units of 700)
        { str: 'Item A', transform: [1, 0, 0, 1, 50, 700] },
        { str: '2x', transform: [1, 0, 0, 1, 200, 701.5] },
        { str: '10000', transform: [1, 0, 0, 1, 300, 699] },
        // Line 2: items at Y=680, Y=681 (within 3 units, but >3 from line 1)
        { str: 'Item B', transform: [1, 0, 0, 1, 50, 680] },
        { str: '1x', transform: [1, 0, 0, 1, 200, 681] },
        { str: '5000', transform: [1, 0, 0, 1, 300, 680] },
      ],
    };

    const proximityPage = { getTextContent: vi.fn().mockResolvedValue(proximityTextContent) };
    const proximityPdf = { numPages: 1, getPage: vi.fn().mockResolvedValue(proximityPage) };
    pdfjsLib.getDocument.mockReturnValueOnce({ promise: Promise.resolve(proximityPdf) });

    const mockFile = {
      type: 'application/pdf',
      name: 'receipt.pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
    };

    const result = await processPDF(mockFile);

    expect(result.text).toBe('Item A 2x 10000\nItem B 1x 5000');
    expect(result.confidence).toBe(100);
  });

  it('should sort items within a line by X position', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const unorderedTextContent = {
      items: [
        // Items on same line (Y=700) but added in wrong X order
        { str: '15000', transform: [1, 0, 0, 1, 300, 700] },
        { str: 'Nasi Goreng', transform: [1, 0, 0, 1, 50, 700] },
        { str: '2x', transform: [1, 0, 0, 1, 200, 700] },
      ],
    };

    const unorderedPage = { getTextContent: vi.fn().mockResolvedValue(unorderedTextContent) };
    const unorderedPdf = { numPages: 1, getPage: vi.fn().mockResolvedValue(unorderedPage) };
    pdfjsLib.getDocument.mockReturnValueOnce({ promise: Promise.resolve(unorderedPdf) });

    const mockFile = {
      type: 'application/pdf',
      name: 'receipt.pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
    };

    const result = await processPDF(mockFile);

    // Should be sorted by X: 50, 200, 300
    expect(result.text).toBe('Nasi Goreng 2x 15000');
  });

  it('should separate items more than 3 units apart into different lines', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const separateTextContent = {
      items: [
        { str: 'Line 1', transform: [1, 0, 0, 1, 50, 700] },
        { str: 'Line 2', transform: [1, 0, 0, 1, 50, 695] }, // 5 units apart - separate line
        { str: 'Line 3', transform: [1, 0, 0, 1, 50, 688] }, // 7 units from line 2 - separate line
      ],
    };

    const separatePage = { getTextContent: vi.fn().mockResolvedValue(separateTextContent) };
    const separatePdf = { numPages: 1, getPage: vi.fn().mockResolvedValue(separatePage) };
    pdfjsLib.getDocument.mockReturnValueOnce({ promise: Promise.resolve(separatePdf) });

    const mockFile = {
      type: 'application/pdf',
      name: 'receipt.pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
    };

    const result = await processPDF(mockFile);

    // Y descending: 700 > 695 > 688
    expect(result.text).toBe('Line 1\nLine 2\nLine 3');
  });

  it('should return an error when PDF contains no extractable text', async () => {
    // Override the mock to return empty text items
    const pdfjsLib = await import('pdfjs-dist');
    const emptyTextContent = { items: [] };
    const emptyPage = { getTextContent: vi.fn().mockResolvedValue(emptyTextContent) };
    const emptyPdf = { numPages: 1, getPage: vi.fn().mockResolvedValue(emptyPage) };
    pdfjsLib.getDocument.mockReturnValueOnce({ promise: Promise.resolve(emptyPdf) });

    const mockFile = {
      type: 'application/pdf',
      name: 'scanned.pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
    };

    const result = await processPDF(mockFile);

    expect(result).toHaveProperty('error');
    expect(result.error).toContain('No text found in PDF');
    expect(result).not.toHaveProperty('text');
  });
});
