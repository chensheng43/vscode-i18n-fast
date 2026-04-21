import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function writeFixture(root: string) {
  await fs.mkdir(path.join(root, '.vscode'), { recursive: true });
  await fs.mkdir(path.join(root, 'locales'), { recursive: true });
  await fs.writeFile(path.join(root, 'locales/zh.json'), JSON.stringify({ 'I18N.a': '添加' }));
  await fs.writeFile(path.join(root, '.vscode/i18n-fast.hook.js'), `
    module.exports = {
      async collectI18n(context) {
        const content = (await context.vscode.workspace.fs.readFile(context.i18nFileUri)).toString();
        const json = JSON.parse(content);
        const locale = context.i18nFileUri.fsPath.match(/([a-z]+)\\.json$/)[1];
        return Object.entries(json).map(([key, value]) => ({ key, value, locale, filePath: context.i18nFileUri.fsPath }));
      }
    };
  `);
  await fs.writeFile(path.join(root, '.vscode/settings.json'), JSON.stringify({
    'i18n-fast.hookFilePattern': '.vscode/i18n-fast.hook.js',
    'i18n-fast.i18nFilePattern': 'locales/*.json'
  }));
}

describe('query_i18n tool', () => {
  let root: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-query-'));
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

  it('returns hits and misses', async () => {
    const res = await client.callTool({
      name: 'query_i18n',
      arguments: { keys: ['I18N.a', 'I18N.missing'], locale: 'zh' },
    });
    const payload = JSON.parse((res.content[0] as { text: string }).text);
    expect(payload.hits).toHaveLength(1);
    expect(payload.hits[0].text).toBe('添加');
    expect(payload.misses).toEqual(['I18N.missing']);
  });
});
