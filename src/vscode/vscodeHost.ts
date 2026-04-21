import { workspace, window, Uri, RelativePattern } from 'vscode';
import type { Host, ActiveContext, Disposable } from '@core/host';

export class VsCodeHost implements Host {
  readonly mode = 'vscode' as const;
  readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
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
    const folder = workspace.workspaceFolders?.[0];
    if (!folder) return [];
    const pattern = new RelativePattern(folder, include);
    const uris = await workspace.findFiles(pattern, exclude);
    return uris.map((u) => u.fsPath);
  }

  watch(glob: string, onChange: (absPath: string) => void): Disposable {
    const folder = workspace.workspaceFolders?.[0];
    if (!folder) return { dispose() {} };
    const pattern = new RelativePattern(folder, glob);
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
    const selections = editor.selections.map((s) => ({
      start: doc.offsetAt(s.start),
      end: doc.offsetAt(s.end)
    }));
    return {
      filePath: doc.uri.fsPath,
      content,
      selections,
      cursor: doc.offsetAt(editor.selection.active)
    };
  }

  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string): void {
    console[level === 'debug' ? 'log' : level](msg);
  }
}
