import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function writeFixture(root: string) {
  await fs.mkdir(path.join(root, '.vscode'), { recursive: true });
  await fs.mkdir(path.join(root, 'locales'), { recursive: true });
  await fs.writeFile(path.join(root, 'locales/zh.json'), JSON.stringify({
    'I18N.a': '添加',
    'I18N.b': '删除',
    'I18N.c': '保存',
  }));
  await fs.writeFile(path.join(root, '.vscode/i18n-fast.hook.js'), `
    module.exports = {
      async collectI18n(ctx) {
        const content = await ctx.host.readFile(ctx.i18nFileUri.fsPath);
        const json = JSON.parse(content);
        return Object.entries(json).map(([key, value]) => ({ key, value, locale: 'zh', filePath: ctx.i18nFileUri.fsPath }));
      }
    };
  `);
  await fs.writeFile(path.join(root, '.vscode/settings.json'), JSON.stringify({
    'i18n-fast.hookFilePattern': '.vscode/i18n-fast.hook.js',
    'i18n-fast.i18nFilePattern': 'locales/*.json'
  }));
}

describe('list_i18n_entries tool', () => {
  let root: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-list-'));
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

  it('returns the default page', async () => {
    const res = await client.callTool({ name: 'list_i18n_entries', arguments: { locale: 'zh' } });
    const payload = JSON.parse((res.content[0] as { text: string }).text);
    expect(payload.total).toBe(3);
    expect(payload.entries).toHaveLength(3);
  });

  it('supports limit and offset', async () => {
    const res = await client.callTool({ name: 'list_i18n_entries', arguments: { locale: 'zh', limit: 2, offset: 1 } });
    const payload = JSON.parse((res.content[0] as { text: string }).text);
    expect(payload.total).toBe(3);
    expect(payload.entries).toHaveLength(2);
  });
});
