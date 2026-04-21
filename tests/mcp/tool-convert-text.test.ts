import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function writeFixture(root: string) {
  await fs.mkdir(path.join(root, '.vscode'), { recursive: true });
  await fs.mkdir(path.join(root, 'locales'), { recursive: true });
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'locales/zh.json'), '{}');
  await fs.writeFile(path.join(root, 'src/a.ts'), 'const x = "添加用户";');
  await fs.writeFile(path.join(root, '.vscode/i18n-fast.hook.js'), `
    module.exports = {
      match(ctx) {
        const active = ctx.host.getActiveContext();
        const hits = ctx.util.matchChinese(active.content);
        return hits.map((hit, index) => ({
          id: 'g' + index,
          filePath: active.filePath,
          range: { start: hit.start, end: hit.end },
          originalText: hit.text,
        }));
      },
      convert(ctx) {
        return ctx.groups.map((group) => ({
          ...group,
          key: 'I18N.auto.' + group.id,
          replacementText: "t('I18N.auto." + group.id + "')",
        }));
      },
      async write(ctx) {
        const localePath = ctx.host.workspaceRoot + '/locales/zh.json';
        const json = JSON.parse(await ctx.host.readFile(localePath));
        for (const group of ctx.groups) {
          json[group.key] = group.originalText;
        }
        await ctx.host.writeFile(localePath, JSON.stringify(json, null, 2));
      },
      async collectI18n(ctx) {
        const content = await ctx.host.readFile(ctx.i18nFileUri.fsPath);
        const json = JSON.parse(content);
        return Object.entries(json).map(([key, value]) => ({ key, value, locale: 'zh', filePath: ctx.i18nFileUri.fsPath }));
      }
    };
  `);
  await fs.writeFile(path.join(root, '.vscode/settings.json'), JSON.stringify({
    'i18n-fast.hookFilePattern': '.vscode/i18n-fast.hook.js',
    'i18n-fast.i18nFilePattern': 'locales/*.json',
    'i18n-fast.conflictPolicy': 'smart'
  }));
}

describe('convert_text tool', () => {
  let root: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-convert-'));
    await writeFixture(root);
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.resolve(__dirname, '../../dist/mcp-server.js'), '--workspace', root],
      cwd: path.resolve(__dirname, '../..'),
    });
    client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns source patches and an undo token', async () => {
    const filePath = path.join(root, 'src/a.ts');
    const content = await fs.readFile(filePath, 'utf-8');
    const res = await client.callTool({
      name: 'convert_text',
      arguments: { files: [{ path: filePath, content }] },
    });
    const payload = JSON.parse((res.content[0] as { text: string }).text);
    expect(payload.source_patches).toHaveLength(1);
    expect(payload.source_patches[0].unified_diff).toContain("t('I18N.auto.g0')");
    expect(payload.i18n_writes_applied.length).toBeGreaterThan(0);
    expect(payload.undo_token).toMatch(/^snap_/);

    const zh = JSON.parse(await fs.readFile(path.join(root, 'locales/zh.json'), 'utf-8'));
    expect(Object.values(zh)).toContain('添加用户');
  });

  it('returns CONTENT_DRIFT when the provided content is stale', async () => {
    const filePath = path.join(root, 'src/a.ts');
    const res = await client.callTool({
      name: 'convert_text',
      arguments: { files: [{ path: filePath, content: 'const x = "完全不同";' }] },
    });
    expect(res.isError).toBe(true);
    const payload = JSON.parse((res.content[0] as { text: string }).text);
    expect(payload.code).toBe('CONTENT_DRIFT');
  });
});
