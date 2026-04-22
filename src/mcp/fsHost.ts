import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as fg from 'fast-glob';
import { watch as watchFs } from 'chokidar';

import type { ActiveContext, Disposable, Host } from '@core/host';

export class PathOutsideWorkspaceError extends Error {
  readonly code = 'PATH_OUTSIDE_WORKSPACE';

  constructor(public readonly filePath: string) {
    super(`path outside workspace: ${filePath}`);
    this.name = 'PathOutsideWorkspaceError';
  }
}

export interface FsHostOptions {
  workspaceRoot: string;
  getActiveContext?: () => ActiveContext | undefined;
}

export class FsHost implements Host {
  readonly mode = 'mcp' as const;
  readonly workspaceRoot: string;
  private readonly activeProvider: () => ActiveContext | undefined;

  constructor(opts: FsHostOptions) {
    this.workspaceRoot = path.resolve(opts.workspaceRoot);
    this.activeProvider = opts.getActiveContext ?? (() => undefined);
  }

  private ensureInside(absPath: string): void {
    const resolved = path.resolve(absPath);
    const relative = path.relative(this.workspaceRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new PathOutsideWorkspaceError(resolved);
    }
  }

  async readFile(absPath: string): Promise<string> {
    const resolved = path.resolve(absPath);
    this.ensureInside(resolved);
    return await fs.readFile(resolved, 'utf-8');
  }

  async writeFile(absPath: string, content: string): Promise<void> {
    const resolved = path.resolve(absPath);
    this.ensureInside(resolved);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
  }

  async exists(absPath: string): Promise<boolean> {
    try {
      await fs.access(absPath);
      return true;
    } catch {
      return false;
    }
  }

  private sanitizeGlob(pattern: string): string {
    if (path.isAbsolute(pattern) || pattern.split(/[/\\]/).includes('..')) {
      throw new PathOutsideWorkspaceError(pattern);
    }
    return pattern;
  }

  async findFiles(include: string, exclude?: string): Promise<string[]> {
    return await fg.glob(this.sanitizeGlob(include), {
      cwd: this.workspaceRoot,
      ignore: exclude ? [this.sanitizeGlob(exclude)] : [],
      absolute: true,
      onlyFiles: true,
    });
  }

  watch(glob: string, onChange: (absPath: string) => void): Disposable {
    const watcher = watchFs(glob, {
      cwd: this.workspaceRoot,
      ignoreInitial: true,
    });

    watcher.on('all', (_event, filePath) => {
      onChange(path.resolve(this.workspaceRoot, filePath));
    });

    return {
      dispose() {
        void watcher.close();
      },
    };
  }

  getActiveContext(): ActiveContext | undefined {
    return this.activeProvider();
  }

  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string): void {
    process.stderr.write(`[${level}] ${msg}\n`);
  }
}
