import type { HookManager } from '../hook/manager';
import type { Host } from '../host';
import type { I18nEntry } from '../types';

export class I18nScanner {
  constructor(
    private readonly host: Host,
    private readonly hookManager: HookManager,
  ) {}

  async scan(pattern: string): Promise<I18nEntry[]> {
    if (!pattern) {
      return [];
    }

    const files = await this.host.findFiles(pattern);
    const all: I18nEntry[] = [];
    for (const filePath of files) {
      const content = await this.host.readFile(filePath);
      const entries = await this.hookManager.collectI18n(content, filePath, {
        filePath,
      });
      all.push(...entries);
    }
    return all;
  }
}
