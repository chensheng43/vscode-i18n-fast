import { beforeAll, describe, expect, it } from 'vitest';

import { installVscodeShim, UnsupportedInMcpError } from '@mcp/vscodeShim';

import type { Host } from '@core/host';

function fakeHost(): Host {
  return {
    mode: 'mcp',
    workspaceRoot: '/w',
    async readFile() {
      return 'hello';
    },
    async writeFile() {},
    async exists() {
      return true;
    },
    async findFiles() {
      return ['/w/a.json'];
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

beforeAll(() => {
  installVscodeShim(fakeHost());
});

describe('vscodeShim', () => {
  it('maps Uri.file to an fsPath', () => {
    const vscode = require('vscode');
    expect(vscode.Uri.file('/x').fsPath).toBe('/x');
  });

  it('bridges workspace.fs.readFile to the host', async () => {
    const vscode = require('vscode');
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file('/w/a.json'));
    expect(Buffer.from(bytes).toString('utf-8')).toBe('hello');
  });

  it('rejects window APIs', () => {
    const vscode = require('vscode');
    expect(() => vscode.window.showQuickPick([])).toThrow(UnsupportedInMcpError);
  });

  it('rejects clipboard APIs', () => {
    const vscode = require('vscode');
    expect(() => vscode.env.clipboard.readText()).toThrow(UnsupportedInMcpError);
  });
});
