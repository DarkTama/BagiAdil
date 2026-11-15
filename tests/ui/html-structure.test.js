// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

/**
 * Guards the app-critical structure of index.html. A bad merge once dropped
 * the #results section and duplicated #history, which crashed the app at
 * runtime - this test catches that class of corruption before it ships.
 */
const htmlPath = fileURLToPath(new URL('../../index.html', import.meta.url));
const doc = new JSDOM(readFileSync(htmlPath, 'utf-8')).window.document;

describe('index.html structure', () => {
  const required = [
    '#manual-section',
    '#ocr-section',
    '#history',
    '#split-workflow',
    '#table-assigner',
    '#results',
    '#export-section',
  ];

  it.each(required)('contains exactly one %s', (selector) => {
    expect(doc.querySelectorAll(selector).length).toBe(1);
  });

  it('has the #results .section-content container that renderResults targets', () => {
    expect(doc.querySelector('#results .section-content')).toBeTruthy();
  });

  it('has no duplicate element IDs', () => {
    const ids = [...doc.querySelectorAll('[id]')].map((el) => el.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  it('has the three mode tabs in order', () => {
    const modes = [...doc.querySelectorAll('.mode-tab')].map(
      (btn) => btn.dataset.mode,
    );
    expect(modes).toEqual(['manual', 'ocr', 'history']);
  });

  it('contains footer author credit links with target="_blank" and rel containing noopener', () => {
    const footer = doc.querySelector('footer');
    expect(footer).toBeTruthy();

    const githubLink = footer.querySelector('a[href="https://github.com/DarkTama"]');
    expect(githubLink).toBeTruthy();
    expect(githubLink.getAttribute('target')).toBe('_blank');
    expect(githubLink.getAttribute('rel')).toContain('noopener');

    const portfolioLink = footer.querySelector('a[href="https://darktama.dev"]');
    expect(portfolioLink).toBeTruthy();
    expect(portfolioLink.getAttribute('target')).toBe('_blank');
    expect(portfolioLink.getAttribute('rel')).toContain('noopener');
  });
});
