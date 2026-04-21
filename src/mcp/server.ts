#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { FsHost } from './fsHost';
import { buildRuntime } from './runtime';
import { installVscodeShim } from './vscodeShim';

function parseArgs(argv: string[]): { workspace: string } {
  const index = argv.indexOf('--workspace');
  return {
    workspace: index >= 0 ? argv[index + 1] : process.cwd(),
  };
}

async function main() {
  const { workspace } = parseArgs(process.argv.slice(2));
  const host = new FsHost({ workspaceRoot: workspace });
  installVscodeShim(host);
  const runtime = await buildRuntime(host);
  void runtime;
  const server = new McpServer({ name: 'i18n-fast', version: '0.1.0' });

  server.registerTool('ping', {
    description: 'Health check',
  }, async () => ({
    content: [{ type: 'text', text: `ok @ ${host.workspaceRoot}` }],
  }));

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
