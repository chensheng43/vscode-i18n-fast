import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@mcp': path.resolve(__dirname, 'src/mcp')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/fixtures/**'],
    coverage: { provider: 'v8', include: ['src/core/**', 'src/mcp/**'] }
  }
});
