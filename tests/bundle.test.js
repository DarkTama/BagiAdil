import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Bundle and code-splitting invariants', () => {
  const srcDir = path.resolve(__dirname, '../src');

  // Helper to recursively find JS files
  function getJsFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(getJsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it('ensures heavy libraries are never statically imported in src/', () => {
    const jsFiles = getJsFiles(srcDir);
    const heavyLibraries = ['tesseract.js', 'pdfjs-dist', 'html2pdf.js'];

    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const lib of heavyLibraries) {
        // Look for static import: import ... from 'lib'
        const staticImportRegex = new RegExp(
          `import\\s+(?:(?:\\{[^}]*\\}|\\*\\s+as\\s+\\w+|[\\w]+)(?:\\s*,\\s*(?:\\{[^}]*\\}|\\*\\s+as\\s+\\w+|[\\w]+))?\\s+from)?\\s*['"]${lib}['"]`,
        );
        expect(
          staticImportRegex.test(content),
          `File ${path.relative(srcDir, file)} should not statically import ${lib}`,
        ).toBe(false);
      }
    }
  });

  it('ensures heavy libraries are loaded via dynamic import()', () => {
    const ocrEnginePath = path.join(srcDir, 'ocr', 'ocr-engine.js');
    const pdfEnginePath = path.join(srcDir, 'ocr', 'pdf-engine.js');
    const exportPath = path.join(srcDir, 'ui', 'export.js');

    const ocrContent = fs.readFileSync(ocrEnginePath, 'utf8');
    expect(ocrContent).toMatch(/import\(['"]tesseract\.js['"]\)/);

    const pdfContent = fs.readFileSync(pdfEnginePath, 'utf8');
    expect(pdfContent).toMatch(/import\(['"]pdfjs-dist['"]\)/);

    // PDF export is the browser's print dialog now; html2pdf.js is gone.
    const exportContent = fs.readFileSync(exportPath, 'utf8');
    expect(exportContent).not.toMatch(/html2pdf/);
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    expect(pkg.dependencies['html2pdf.js']).toBeUndefined();
  });

  it('validates dist/index.html initial assets when dist/ exists', () => {
    const distIndexPath = path.resolve(__dirname, '../dist/index.html');
    if (!fs.existsSync(distIndexPath)) {
      // Skip if dist hasn't been built yet
      return;
    }

    const htmlContent = fs.readFileSync(distIndexPath, 'utf8');
    // Ensure tesseract, pdfjs, and html2pdf are not referenced in dist/index.html
    expect(htmlContent).not.toMatch(/tesseract/i);
    expect(htmlContent).not.toMatch(/pdfjs/i);
    expect(htmlContent).not.toMatch(/html2pdf/i);
    expect(htmlContent).not.toMatch(/pdf\.worker/i);
  });
});
