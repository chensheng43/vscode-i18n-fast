import { createRequire } from 'node:module';
import type { HookModule } from './types';

export interface LoadResult {
  module: HookModule;
  filePath: string;
}

export class HookLoader {
  private readonly nodeRequire: NodeRequire;

  constructor(anchorFile: string) {
    this.nodeRequire = createRequire(anchorFile);
  }

  load(absPath: string): LoadResult {
    const resolved = this.nodeRequire.resolve(absPath);
    delete this.nodeRequire.cache[resolved];
    const mod = this.nodeRequire(resolved) as HookModule;
    return { module: mod, filePath: resolved };
  }
}
