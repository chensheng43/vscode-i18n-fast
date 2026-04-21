/**
 * vitest is pinned at ^2.x intentionally. vitest 3+ depends on vite 6+,
 * which has removed the CJS Node API. This project builds via webpack in
 * CJS mode (no "type": "module" in package.json), so vitest 3+ would fail
 * to load its own config. Upgrade only when the extension migrates to ESM.
 */
import { defineConfig, defaultExclude } from 'vitest/config';
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
    exclude: [...defaultExclude, 'tests/e2e/fixtures/**'],
    coverage: { provider: 'v8', include: ['src/core/**', 'src/mcp/**'] }
  }
});
