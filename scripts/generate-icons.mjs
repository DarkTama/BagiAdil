/**
 * Generate the PWA icon PNGs from the master SVG.
 * Run after changing src/assets/icon.svg:  npm run icons
 */
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(root, 'src/assets/icon.svg'));
const outDir = join(root, 'public/icons');
await mkdir(outDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of targets) {
  // Render the SVG at high density, then resize down for a crisp result.
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(outDir, file));
  console.log(`generated public/icons/${file}`);
}
