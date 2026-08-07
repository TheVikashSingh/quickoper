import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@calc': fileURLToPath(new URL('./src/lib/calc', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // calc/ is the only place correctness is load-bearing, so it is the only
    // place a coverage number would mean anything.
    coverage: {
      include: ['src/lib/calc/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
