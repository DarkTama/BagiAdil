import { defineConfig } from 'vite';

export default defineConfig({
  base: '/BagiAdil/',
  build: {
    // html2pdf.js is dynamically imported only when the user clicks 'Export PDF'.
    // It pre-bundles jspdf and relies on html2canvas, emitting a lazy chunk of ~985 kB
    // minified (~286 kB gzipped). chunkSizeWarningLimit is scoped to 1000 kB (just above
    // the measured 985 kB lazy chunk) so the build does not warn on this known lazy module,
    // while still alerting if any chunk (or the entry bundle) exceeds 1000 kB.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
  },
});
