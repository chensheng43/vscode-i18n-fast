import type { ActiveContext, Host } from '../host';
import type { ConvertGroup, I18nEntry } from '../types';

export interface HookUtils {
  matchChinese: typeof import('../text/matchChinese').matchChinese;
  isInJsxElement: typeof import('../text/jsx').isInJsxElement;
  parseIcuMessage: typeof import('../text/icu').parseIcuMessage;
  extractIcuPlaceholders: typeof import('../text/icu').extractIcuPlaceholders;
  [key: string]: unknown;
}

export interface HookContext {
  host: Host;
  active?: ActiveContext;
  util: HookUtils;
  config: unknown;
}

export interface HookModule {
  match?(ctx: HookContext): Promise<ConvertGroup[]> | ConvertGroup[];
  convert?(groups: ConvertGroup[], ctx: HookContext): Promise<ConvertGroup[]> | ConvertGroup[];
  write?(groups: ConvertGroup[], ctx: HookContext): Promise<void> | void;
  collectI18n?(content: string, filePath: string, ctx: HookContext): Promise<I18nEntry[]> | I18nEntry[];
  matchI18n?(key: string, ctx: HookContext): Promise<boolean> | boolean;
  [key: string]: unknown;
}
