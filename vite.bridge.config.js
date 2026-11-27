import { defineConfig } from 'vite';

export default defineConfig({
  root: 'bridge',
  base: '/BagiAdil/',
  build: {
    outDir: '../dist-bridge',
    emptyOutDir: true,
  },
});
