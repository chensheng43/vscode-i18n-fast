import type { I18nEntry } from '../types';

export class I18nCache {
  private entries: I18nEntry[] = [];

  replace(entries: I18nEntry[]): void {
    this.entries = entries.slice();
  }

  clear(): void {
    this.entries = [];
  }

  all(): readonly I18nEntry[] {
    return this.entries;
  }

  byKey(key: string): I18nEntry[] {
    return this.entries.filter((entry) => entry.key === key);
  }

  byText(text: string): I18nEntry[] {
    return this.entries.filter((entry) => entry.text === text);
  }

  paginate(opts: { locale?: string; limit: number; offset: number }): { entries: I18nEntry[]; total: number } {
    const filtered = opts.locale
      ? this.entries.filter((entry) => entry.locale === opts.locale)
      : this.entries;

    return {
      entries: filtered.slice(opts.offset, opts.offset + opts.limit),
      total: filtered.length,
    };
  }
}
