import { defineConfig } from 'vite';

export default defineConfig({
  base: '/BagiAdil/',
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
  },
});
