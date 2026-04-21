import { describe, it, expect } from 'vitest';
import type { Host, ActiveContext, Disposable } from '@core/host';

function createFakeHost(): Host {
  const files = new Map<string, string>();
  return {
    mode: 'mcp',
    workspaceRoot: '/work',
    async readFile(p) { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p)!; },
    async writeFile(p, c) { files.set(p, c); },
    async exists(p) { return files.has(p); },
    async findFiles() { return Array.from(files.keys()); },
    watch(): Disposable { return { dispose() {} }; },
    getActiveContext(): ActiveContext | undefined { return undefined; },
    log() {}
  };
}

describe('Host', () => {
  it('fake host 能 roundtrip 写读', async () => {
    const h = createFakeHost();
    await h.writeFile('/work/a.json', '{"x":1}');
    expect(await h.readFile('/work/a.json')).toBe('{"x":1}');
    expect(await h.exists('/work/a.json')).toBe(true);
  });
});
