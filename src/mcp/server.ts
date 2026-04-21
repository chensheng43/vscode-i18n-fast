#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

import { FsHost } from './fsHost';
import { getActive } from './activeContextStore';
import { buildRuntime } from './runtime';
import { handleConvertText } from './tools/convertText';
import { handleListI18nEntries } from './tools/listI18nEntries';
import { handleQueryI18n } from './tools/queryI18n';
import { handleUndo } from './tools/undo';
import { installVscodeShim } from './vscodeShim';

function parseArgs(argv: string[]): { workspace: string } {
  const index = argv.indexOf('--workspace');
  return {
    workspace: index >= 0 ? argv[index + 1] : process.cwd(),
  };
}

async function main() {
  const { workspace } = parseArgs(process.argv.slice(2));
  const host = new FsHost({ workspaceRoot: workspace, getActiveContext: getActive });
  installVscodeShim(host);
  const runtime = await buildRuntime(host);
  void runtime;
  const server = new McpServer({ name: 'i18n-fast', version: '0.1.0' });

  server.registerTool('ping', {
    description: 'Health check',
  }, async () => ({
    content: [{ type: 'text', text: `ok @ ${host.workspaceRoot}` }],
  }));


  server.registerTool('query_i18n', {
    description: '反查 i18n key 原文，或判断文本是否已有对应 key。',
    inputSchema: {
      keys: z.array(z.string()).optional(),
      text: z.string().optional(),
      locale: z.string().optional(),
    },
  }, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await handleQueryI18n(runtime, args)) }],
  }));


  server.registerTool('convert_text', {
    description: '把文件里的硬编码文本转换为 i18n key，返回源码 patch + 已写入的 i18n 文件。',
    inputSchema: {
      files: z.array(z.object({
        path: z.string(),
        content: z.string(),
        selections: z.array(z.object({ start: z.number(), end: z.number() })).optional(),
      })),
      conflict_policy: z.enum(['reuse', 'ignore', 'picker', 'smart']).optional(),
      picker_resolutions: z.record(z.string(), z.string()).optional(),
    },
  }, async (args) => {
    try {
      return {
        content: [{ type: 'text', text: JSON.stringify(await handleConvertText(runtime, args)) }],
      };
    } catch (error) {
      const payload = error instanceof Error
        ? {
            code: (error as Error & { code?: string }).code ?? error.name,
            message: error.message,
            conflicts: (error as Error & { conflicts?: unknown[] }).conflicts,
            hook_location: (error as Error & { hookLocation?: unknown }).hookLocation,
          }
        : { code: 'INTERNAL', message: String(error) };
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      };
    }
  });


  server.registerTool('list_i18n_entries', {
    description: '分页倾倒 i18n 索引。',
    inputSchema: {
      locale: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
  }, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await handleListI18nEntries(runtime, args)) }],
  }));


  server.registerTool('undo', {
    description: '按 undo_token 回滚 MCP 直写的 i18n 文件；不传 token 则回退最近一次。',
    inputSchema: {
      undo_token: z.string().optional(),
    },
  }, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await handleUndo(runtime, args)) }],
  }));


  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
