import { workspace, window, Uri, RelativePattern } from 'vscode';
import * as path from 'node:path';
import type { Host, ActiveContext, Disposable } from '@core/host';

export class VsCodeHost implements Host {
  readonly mode = 'vscode' as const;
  readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  async readFile(absPath: string): Promise<string> {
    const bytes = await workspace.fs.readFile(Uri.file(absPath));
    return Buffer.from(bytes).toString('utf-8');
  }

  async writeFile(absPath: string, content: string): Promise<void> {
    await workspace.fs.writeFile(Uri.file(absPath), Buffer.from(content, 'utf-8'));
  }

  async exists(absPath: string): Promise<boolean> {
    try {
      await workspace.fs.stat(Uri.file(absPath));
      return true;
    } catch {
      return false;
    }
  }

  async findFiles(include: string, exclude?: string): Promise<string[]> {
    const pattern = new RelativePattern(Uri.file(this.workspaceRoot), include);
    // exclude is passed as a raw string to workspace.findFiles; VS Code matches
    // it against paths relative to the workspace root (not this.workspaceRoot),
    // so callers should use `**/name/**` style glob patterns to be unambiguous.
    const uris = await workspace.findFiles(pattern, exclude);
    return uris.map((u) => u.fsPath);
  }

  watch(glob: string, onChange: (absPath: string) => void): Disposable {
    const pattern = new RelativePattern(Uri.file(this.workspaceRoot), glob);
    const watcher = workspace.createFileSystemWatcher(pattern);
    const d1 = watcher.onDidChange((u) => onChange(u.fsPath));
    const d2 = watcher.onDidCreate((u) => onChange(u.fsPath));
    const d3 = watcher.onDidDelete((u) => onChange(u.fsPath));
    return { dispose() { d1.dispose(); d2.dispose(); d3.dispose(); watcher.dispose(); } };
  }

  getActiveContext(): ActiveContext | undefined {
    const editor = window.activeTextEditor;
    if (!editor) return undefined;
    const doc = editor.document;
    const content = doc.getText();
    const selections: ActiveContext['selections'] = editor.selections.map((s) => ({
      start: doc.offsetAt(s.start),
      end: doc.offsetAt(s.end)
    } as const));
    return {
      filePath: doc.uri.fsPath,
      content,
      selections,
      cursor: doc.offsetAt(editor.selection.active)
    };
  }

  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string): void {
    // TODO(future task): route to a VS Code OutputChannel for user-visible
    // diagnostics. `console.*` only surfaces in the extension development host.
    console[level === 'debug' ? 'log' : level](msg);
  }
}
