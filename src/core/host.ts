export type HostMode = 'vscode' | 'mcp';

/**
 * Snapshot of what the user/tool is currently working on. In VS Code mode
 * this reflects `window.activeTextEditor`; in MCP mode it comes from the
 * tool-call arguments via `activeContextStore`. Fields are immutable.
 */
export interface ActiveContext {
  readonly filePath: string;
  readonly content: string;
  /**
   * Character-offset selection ranges. `undefined` means "no restriction —
   * scan the whole file". An empty array is treated the same as `undefined`
   * by conventional consumers; prefer `undefined` in new code.
   */
  readonly selections?: ReadonlyArray<{ readonly start: number; readonly end: number }>;
  readonly cursor?: number;
}

export interface Disposable {
  dispose(): void;
}

/**
 * Abstraction over the host environment (VS Code extension host or MCP
 * stdio server). Implementations: `VsCodeHost` (Task 9), `FsHost` (Task 17).
 */
export interface Host {
  readonly mode: HostMode;

  /**
   * POSIX-normalized absolute path, no trailing separator. Implementations
   * must call `path.resolve` (or equivalent) before exposing this. All glob
   * patterns passed to `findFiles`/`watch` are resolved relative to this.
   */
  readonly workspaceRoot: string;

  /** Reads a UTF-8 text file. Throws if the file does not exist. */
  readFile(absPath: string): Promise<string>;

  /**
   * Writes a UTF-8 text file. Creates parent directories as needed.
   * Implementations MAY enforce that `absPath` is inside `workspaceRoot`
   * (FsHost does; VsCodeHost defers to the editor's own permissions).
   */
  writeFile(absPath: string, content: string): Promise<void>;

  /** True if the path exists (as a file or directory). Never throws. */
  exists(absPath: string): Promise<boolean>;

  /**
   * Finds files matching a glob. `include` is resolved relative to
   * `workspaceRoot` (NOT an absolute glob). `exclude` is similarly relative.
   * Returns absolute paths.
   */
  findFiles(include: string, exclude?: string): Promise<string[]>;

  /**
   * Watches a glob relative to `workspaceRoot`. Fires `onChange(absPath)`
   * for create / modify / delete events. Dispose the returned handle to
   * stop watching.
   */
  watch(glob: string, onChange: (absPath: string) => void): Disposable;

  /**
   * Returns the current focus context, or `undefined` if none. In VS Code
   * mode this maps from `window.activeTextEditor`; in MCP mode it comes
   * from the current tool call's arguments.
   */
  getActiveContext(): ActiveContext | undefined;

  /**
   * Diagnostic log. Implementations route to whatever makes sense in their
   * environment (VS Code output channel / MCP stderr).
   */
  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string): void;
}
