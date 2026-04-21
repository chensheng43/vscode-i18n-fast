export type HostMode = 'vscode' | 'mcp';

export interface ActiveContext {
  filePath: string;
  content: string;
  selections?: Array<{ start: number; end: number }>;
  cursor?: number;
}

export interface Disposable {
  dispose(): void;
}

export interface Host {
  readonly mode: HostMode;
  readonly workspaceRoot: string;

  readFile(absPath: string): Promise<string>;
  writeFile(absPath: string, content: string): Promise<void>;
  exists(absPath: string): Promise<boolean>;
  findFiles(include: string, exclude?: string): Promise<string[]>;

  watch(glob: string, onChange: (absPath: string) => void): Disposable;

  getActiveContext(): ActiveContext | undefined;

  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string): void;
}
