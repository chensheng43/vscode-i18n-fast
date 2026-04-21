import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function copyDir(src: string, dst: string) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const sourcePath = path.join(src, entry.name);
    const targetPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

function readPayload(result: Awaited<ReturnType<Client['callTool']>>) {
  return JSON.parse((result.content[0] as { text: string }).text);
}

describe('e2e: convert -> query -> undo', () => {
  let root: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-fast-e2e-'));
    await copyDir(path.resolve(__dirname, 'fixtures/vue-project'), root);
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.resolve(__dirname, '../../dist/mcp-server.js'), '--workspace', root],
      cwd: path.resolve(__dirname, '../..'),
    });
    client = new Client({ name: 'e2e-client', version: '0.0.0' }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('runs the full convert, query, and undo flow', async () => {
    let result = await client.callTool({ name: 'query_i18n', arguments: { text: '添加用户' } });
    expect(readPayload(result).hits).toHaveLength(0);

    const filePath = path.join(root, 'src/FooBar.vue');
    const beforeSource = await fs.readFile(filePath, 'utf-8');
    result = await client.callTool({
      name: 'convert_text',
      arguments: { files: [{ path: filePath, content: beforeSource }] },
    });
    const convertPayload = readPayload(result);
    expect(convertPayload.source_patches).toHaveLength(1);
    expect(convertPayload.source_patches[0].unified_diff).toContain("I18N.tian_jia_yong_hu");
    expect(convertPayload.source_patches[0].unified_diff).toContain("I18N.delete");
    expect(convertPayload.undo_token).toMatch(/^snap_/);

    const localePath = path.join(root, 'locales/zh.json');
    const localeAfterConvert = JSON.parse(await fs.readFile(localePath, 'utf-8')) as Record<string, string>;
    expect(localeAfterConvert['I18N.delete']).toBe('删除');
    expect(localeAfterConvert['I18N.tian_jia_yong_hu']).toBe('添加用户');

    result = await client.callTool({ name: 'query_i18n', arguments: { text: '添加用户' } });
    expect(readPayload(result).hits.length).toBeGreaterThan(0);

    result = await client.callTool({ name: 'undo', arguments: { undo_token: convertPayload.undo_token } });
    expect(readPayload(result).reverted_files).toContain(localePath);

    const localeAfterUndo = JSON.parse(await fs.readFile(localePath, 'utf-8')) as Record<string, string>;
    expect(localeAfterUndo).toEqual({ 'I18N.delete': '删除' });

    result = await client.callTool({ name: 'query_i18n', arguments: { text: '添加用户' } });
    expect(readPayload(result).hits).toHaveLength(0);
  });
});
