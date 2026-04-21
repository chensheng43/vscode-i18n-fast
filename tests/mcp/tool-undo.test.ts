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

describe('undo tool', () => {
  let root: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-undo-'));
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

  it('reverts locale writes for a known undo token', async () => {
    const localePath = path.join(root, 'locales/zh.json');
    const before = await fs.readFile(localePath, 'utf-8');

    const filePath = path.join(root, 'src/a.ts');
    const content = await fs.readFile(filePath, 'utf-8');
    const convertRes = await client.callTool({
      name: 'convert_text',
      arguments: { files: [{ path: filePath, content }] },
    });
    const convertPayload = JSON.parse((convertRes.content[0] as { text: string }).text);

    const undoRes = await client.callTool({
      name: 'undo',
      arguments: { undo_token: convertPayload.undo_token },
    });
    const undoPayload = JSON.parse((undoRes.content[0] as { text: string }).text);
    expect(undoPayload.reverted_files).toContain(localePath);
    expect(await fs.readFile(localePath, 'utf-8')).toBe(before);
  });

  it('returns an empty list for unknown tokens', async () => {
    const res = await client.callTool({ name: 'undo', arguments: { undo_token: 'snap_unknown' } });
    const payload = JSON.parse((res.content[0] as { text: string }).text);
    expect(payload.reverted_files).toEqual([]);
  });
});
