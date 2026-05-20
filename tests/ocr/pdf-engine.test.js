import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => {
  const mockTextContent = {
    items: [
      { str: 'Nasi Goreng' },
      { str: '2x' },
      { str: '15000' },
      { str: 'Es Teh' },
      { str: '1x' },
      { str: '5000' },
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
    expect(result.text).toContain('Nasi Goreng');
    expect(result.text).toContain('Es Teh');
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
});
