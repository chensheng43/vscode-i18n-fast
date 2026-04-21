import { I18nCache } from '@core/i18n/cache';
import { I18nScanner } from '@core/i18n/scanner';
import type { Disposable, Host } from '@core/host';

import { getConfig } from './config';
import Hook from './hook';
import type { I18nGroup } from './types';

type PathMap = Map<string, I18nGroup[]>;
type WorkspaceMap = Map<string, PathMap>;

function toI18nGroup(entry: Record<string, unknown>): I18nGroup {
  return {
    ...(entry as unknown as I18nGroup),
    key: String(entry.key ?? ''),
    value: typeof entry.value === 'string' ? entry.value : String(entry.text ?? ''),
    filePath: typeof entry.filePath === 'string' ? entry.filePath : undefined,
    line: typeof entry.line === 'number' ? entry.line : undefined,
  };
}

export default class I18n {
  private readonly cache = new I18nCache();
  private host?: Host;
  private i18nWatcher?: Disposable;
  private _onChange?: () => void;
  private static instance: I18n;

  static getInstance(): I18n {
    if (!I18n.instance) I18n.instance = new I18n();
    return I18n.instance;
  }

  setHost(h: Host): void {
    this.host = h;
  }

  private get h(): Host {
    if (!this.host) throw new Error('Host not set (did extension.ts call setHost?)');
    return this.host;
  }

  private get scanner(): I18nScanner {
    return new I18nScanner(this.h, Hook.getInstance().getCoreManager());
  }

  private async disposeWatcher() {
    this.i18nWatcher?.dispose();
    this.i18nWatcher = undefined;
  }

  async dispose(_workspaceKey?: string) {
    this.cache.clear();
    await this.disposeWatcher();
  }

  async init() {
    return await this.reload();
  }

  async reload(i18nFilePattern?: string) {
    i18nFilePattern = i18nFilePattern || getConfig().i18nFilePattern;
    await this.disposeWatcher();
    this.cache.clear();

    if (!i18nFilePattern) {
      this._onChange?.();
      return;
    }

    const entries = await this.scanner.scan(i18nFilePattern);
    this.cache.replace(entries);
    this.i18nWatcher = this.h.watch(i18nFilePattern, async () => {
      const nextEntries = await this.scanner.scan(i18nFilePattern!);
      this.cache.replace(nextEntries);
      this._onChange?.();
    });
    this._onChange?.();
  }

  get(): WorkspaceMap;
  get(workspaceKey: string): PathMap;
  get(workspaceKey?: string) {
    const pathMap: PathMap = new Map();
    for (const entry of this.cache.all()) {
      const filePath = entry.filePath;
      const groups = pathMap.get(filePath) ?? [];
      groups.push(toI18nGroup(entry as unknown as Record<string, unknown>));
      pathMap.set(filePath, groups);
    }

    if (workspaceKey) {
      return pathMap;
    }

    return new Map([[this.h.workspaceRoot, pathMap]]);
  }

  getI18nGroups(_workspaceKey?: string): I18nGroup[] {
    return Array.from(this.cache.all()).map((entry) => toI18nGroup(entry as unknown as Record<string, unknown>));
  }

  onChange(callback: I18n['_onChange']) {
    this._onChange = callback;
  }
}
