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

  it('should group items with Y-values within 3 units on the same line', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    // Items with Y=699 and Y=698 should group (within 3 units)
    // Items with Y=680 and Y=682 should group (within 3 units)
    const closeYTextContent = {
      items: [
        { str: 'Item A', transform: [1, 0, 0, 1, 50, 699] },
        { str: '10000', transform: [1, 0, 0, 1, 200, 698] },
        { str: 'Item B', transform: [1, 0, 0, 1, 50, 680] },
        { str: '20000', transform: [1, 0, 0, 1, 200, 682] },
      ],
    };
    const closePage = { getTextContent: vi.fn().mockResolvedValue(closeYTextContent) };
    const closePdf = { numPages: 1, getPage: vi.fn().mockResolvedValue(closePage) };
    pdfjsLib.getDocument.mockReturnValueOnce({ promise: Promise.resolve(closePdf) });

    const mockFile = {
      type: 'application/pdf',
      name: 'receipt.pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
    };

    const result = await processPDF(mockFile);

    expect(result).toHaveProperty('text');
    // Y=699 and Y=698 group together (within 3 units proximity)
    // Y=680 and Y=682 group together (within 3 units proximity)
    expect(result.text).toContain('Item A 10000');
    expect(result.text).toContain('Item B 20000');
    // They should be on separate lines since the two groups are far apart
    const lines = result.text.trim().split('\n');
    expect(lines.length).toBe(2);
  });

  it('should group items at Y=700 and Y=701 on the same line (boundary case)', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    // Y=700 and Y=701 are 1 unit apart - must end up on the same line
    // This was broken with the old bucket-based approach
    const boundaryTextContent = {
      items: [
        { str: 'Boundary A', transform: [1, 0, 0, 1, 50, 701] },
        { str: '25000', transform: [1, 0, 0, 1, 200, 700] },
        { str: 'Other Line', transform: [1, 0, 0, 1, 50, 650] },
      ],
    };
    const boundaryPage = { getTextContent: vi.fn().mockResolvedValue(boundaryTextContent) };
    const boundaryPdf = { numPages: 1, getPage: vi.fn().mockResolvedValue(boundaryPage) };
    pdfjsLib.getDocument.mockReturnValueOnce({ promise: Promise.resolve(boundaryPdf) });

    const mockFile = {
      type: 'application/pdf',
      name: 'receipt.pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
    };

    const result = await processPDF(mockFile);

    expect(result).toHaveProperty('text');
    // Y=700 and Y=701 should be on the same line
    expect(result.text).toContain('Boundary A 25000');
    const lines = result.text.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('Boundary A 25000');
    expect(lines[1]).toBe('Other Line');
  });
});
