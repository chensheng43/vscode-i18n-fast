import { describe, expect, it } from 'vitest';

import { buildDiff } from '@core/convert/diffBuilder';

import type { Host } from '@core/host';

function memoryHost(files: Record<string, string>): Host {
  const map = new Map(Object.entries(files));
  return {
    mode: 'mcp',
    workspaceRoot: '/',
    async readFile(filePath) {
      return map.get(filePath) ?? '';
    },
    async writeFile() {},
    async exists(filePath) {
      return map.has(filePath);
    },
    async findFiles() {
      return [];
    },
    watch() {
      return { dispose() {} };
    },
    getActiveContext() {
      return undefined;
    },
    log() {},
  };
}

describe('buildDiff', () => {
  it('generates a unified diff for source replacements', async () => {
    const host = memoryHost({ '/a.ts': 'const x = "添加";' });
    const patches = await buildDiff(host, [{
      id: '1',
      filePath: '/a.ts',
      range: { start: 11, end: 13 },
      originalText: '添加',
      key: 'I18N.a',
      replacementText: "t('I18N.a')",
    }]);

    expect(patches).toHaveLength(1);
    expect(patches[0].unified_diff).toContain('-const x = "添加";');
    expect(patches[0].unified_diff).toContain("+const x = \"t('I18N.a')\";");
  });
});
