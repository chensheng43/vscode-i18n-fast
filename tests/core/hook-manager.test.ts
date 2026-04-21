import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { HookLoader } from '@core/hook/loader';
import { HookManager, HookTimeoutError } from '@core/hook/manager';

import type { ActiveContext, Host } from '@core/host';

function makeHost(active?: ActiveContext): Host {
  const files = new Map<string, string>();
  return {
    mode: 'mcp',
    workspaceRoot: '/work',
    async readFile(filePath) {
      return files.get(filePath) ?? '';
    },
    async writeFile(filePath, content) {
      files.set(filePath, content);
    },
    async exists(filePath) {
      return files.has(filePath);
    },
    async findFiles() {
      return [];
    },
    watch() {
      return { dispose() {} };
    },
    getActiveContext() {
      return active;
    },
    log() {},
  };
}

describe('HookManager', () => {
  const basicHookPath = path.resolve(__dirname, 'fixtures/hooks/basic.js');
  const slowHookPath = path.resolve(__dirname, 'fixtures/hooks/slow.js');

  it('runs match/convert/write end-to-end', async () => {
    const host = makeHost({ filePath: '/work/src/a.ts', content: '添加用户' });
    const manager = new HookManager(host, new HookLoader(__filename), () => ({}));
    await manager.reload(basicHookPath);

    const matched = await manager.match();
    expect(matched[0].originalText).toBe('添加用户');

    const converted = await manager.convert(matched);
    expect(converted[0].key).toBe('I18N.auto.g0');

    await manager.write(converted);
    expect(await host.readFile('/work/locales/zh.json')).toContain('添加用户');
  });

  it('times out a hung hook phase', async () => {
    const host = makeHost({ filePath: '/work/src/a.ts', content: '添加用户' });
    const manager = new HookManager(host, new HookLoader(__filename), () => ({}), { timeoutMs: 5 });
    await manager.reload(slowHookPath);

    vi.useFakeTimers();
    try {
      const pending = manager.match();
      const assertion = expect(pending).rejects.toBeInstanceOf(HookTimeoutError);
      await vi.advanceTimersByTimeAsync(10);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
