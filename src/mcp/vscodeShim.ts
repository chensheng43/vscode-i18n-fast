import Module from 'node:module';
import { EventEmitter } from 'node:events';

import type { Host } from '@core/host';

let installed = false;

function locateHookFrame(stack: string | undefined): { file: string; line: number } | undefined {
  if (!stack) {
    return undefined;
  }

  for (const line of stack.split('\n')) {
    const match = line.match(/\((.+?\.hook\.js):(\d+):\d+\)/) || line.match(/at (.+?\.hook\.js):(\d+):\d+/);
    if (match) {
      return { file: match[1], line: Number(match[2]) };
    }
  }
  return undefined;
}

export class UnsupportedInMcpError extends Error {
  readonly code = 'UNSUPPORTED_IN_MCP';
  readonly hookLocation?: { file: string; line: number };

  constructor(public readonly api: string) {
    super(`vscode.${api} is not available in MCP mode. Use ctx.host.* instead.`);
    this.name = 'UnsupportedInMcpError';
    this.hookLocation = locateHookFrame(this.stack);
  }
}

function buildShim(host: Host): unknown {
  const guard = (api: string): never => {
    throw new UnsupportedInMcpError(api);
  };

  class Position {
    constructor(public readonly line: number, public readonly character: number) {}
  }

  class Range {
    constructor(public readonly start: Position, public readonly end: Position) {}
  }

  class Uri {
    readonly scheme = 'file';

    constructor(public readonly fsPath: string) {}

    static file(filePath: string) {
      return new Uri(filePath);
    }

    static parse(value: string) {
      return new Uri(value.replace(/^file:\/\//, ''));
    }

    get path() {
      return this.fsPath;
    }

    toString() {
      return `file://${this.fsPath}`;
    }
  }

  const workspace = {
    get workspaceFolders() {
      return [{ uri: Uri.file(host.workspaceRoot), name: 'workspace', index: 0 }];
    },
    fs: {
      async readFile(uri: Uri) {
        return Buffer.from(await host.readFile(uri.fsPath), 'utf-8');
      },
      async writeFile(uri: Uri, bytes: Uint8Array) {
        await host.writeFile(uri.fsPath, Buffer.from(bytes).toString('utf-8'));
      },
      async stat(uri: Uri) {
        if (!(await host.exists(uri.fsPath))) {
          throw new Error(`ENOENT: ${uri.fsPath}`);
        }
        return { type: 1 };
      },
      async readDirectory() {
        return guard('workspace.fs.readDirectory');
      },
    },
    findFiles(include: string, exclude?: string) {
      return host.findFiles(include, exclude).then((paths) => paths.map((filePath) => Uri.file(filePath)));
    },
    getConfiguration() {
      return {
        get: () => undefined,
        has: () => false,
        inspect: () => undefined,
        update: () => guard('workspace.getConfiguration.update'),
      };
    },
    asRelativePath(filePath: string) {
      return filePath.startsWith(host.workspaceRoot)
        ? filePath.slice(host.workspaceRoot.length + 1)
        : filePath;
    },
    openTextDocument: () => guard('workspace.openTextDocument'),
    onDidChangeTextDocument: () => guard('workspace.onDidChangeTextDocument'),
    onDidChangeConfiguration: () => guard('workspace.onDidChangeConfiguration'),
  };

  return new Proxy({}, {
    get(_target, prop: string) {
      switch (prop) {
        case 'Uri': return Uri;
        case 'Range': return Range;
        case 'Position': return Position;
        case 'EventEmitter': return EventEmitter;
        case 'workspace': return workspace;
        case 'window': return new Proxy({}, { get: (_t, name: string) => () => guard(`window.${name}`) });
        case 'commands': return new Proxy({}, { get: (_t, name: string) => () => guard(`commands.${name}`) });
        case 'languages': return new Proxy({}, { get: (_t, name: string) => () => guard(`languages.${name}`) });
        case 'env': return { clipboard: new Proxy({}, { get: (_t, name: string) => () => guard(`env.clipboard.${name}`) }) };
        default: return undefined;
      }
    },
  });
}

export function installVscodeShim(host: Host): void {
  if (installed) {
    return;
  }

  const shim = buildShim(host);
  const moduleInternal = Module as unknown as {
    _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
  };
  const originalLoad = moduleInternal._load;
  moduleInternal._load = function patchedLoad(request: string, parent: NodeModule | null | undefined, isMain: boolean) {
    if (request === 'vscode') {
      return shim;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  installed = true;
}
