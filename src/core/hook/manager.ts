import { randomUUID } from 'node:crypto';

import { createHookContext } from './context';

import type { HookLoader } from './loader';
import type { HookContext, HookModule } from './types';
import type { Host } from '../host';
import type { ConvertGroup, I18nEntry } from '../types';

const DEFAULT_TIMEOUT_MS = 30_000;

export class HookTimeoutError extends Error {
  readonly code = 'HOOK_TIMEOUT';

  constructor(public readonly phase: string, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    super(`Hook ${phase} timed out after ${timeoutMs}ms`);
    this.name = 'HookTimeoutError';
  }
}

async function withTimeout<T>(phase: string, value: Promise<T> | T, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HookTimeoutError(phase, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export interface HookManagerOptions {
  timeoutMs?: number;
  getUtilExtras?: () => Record<string, unknown>;
  getLegacyBindings?: () => Record<string, unknown>;
  adaptModule?: (module: HookModule, filePath: string) => HookModule;
}

interface LoadedHook {
  module: HookModule;
  filePath: string;
}

interface PositionLike {
  line: number;
  character: number;
}

function isPositionLike(value: unknown): value is PositionLike {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as PositionLike).line === 'number'
    && typeof (value as PositionLike).character === 'number';
}

function offsetAt(content: string, position: PositionLike): number {
  if (position.line <= 0) {
    return position.character;
  }

  let line = 0;
  let index = 0;
  while (index < content.length && line < position.line) {
    if (content[index] === '\n') {
      line += 1;
    }
    index += 1;
  }
  return index + position.character;
}

function normalizeRangeLike(content: string, range: unknown): { start: number; end: number } | undefined {
  if (!range || typeof range !== 'object') {
    return undefined;
  }

  const candidate = range as { start?: unknown; end?: unknown };
  if (typeof candidate.start === 'number' && typeof candidate.end === 'number') {
    return { start: candidate.start, end: candidate.end };
  }
  if (isPositionLike(candidate.start) && isPositionLike(candidate.end)) {
    return {
      start: offsetAt(content, candidate.start),
      end: offsetAt(content, candidate.end),
    };
  }
  return undefined;
}

function findRangesByMatchedText(content: string, groups: Array<Record<string, unknown>>): Map<Record<string, unknown>, { start: number; end: number }> {
  const result = new Map<Record<string, unknown>, { start: number; end: number }>();
  let cursor = 0;

  for (const group of groups) {
    const matchedText = typeof group.matchedText === 'string'
      ? group.matchedText
      : typeof group.originalText === 'string'
        ? group.originalText
        : typeof group.i18nValue === 'string'
          ? group.i18nValue
          : undefined;
    if (!matchedText) {
      continue;
    }

    const idx = content.indexOf(matchedText, cursor);
    if (idx === -1) {
      continue;
    }

    result.set(group, { start: idx, end: idx + matchedText.length });
    cursor = idx + matchedText.length;
  }

  return result;
}

function normalizeConvertGroups(rawGroups: unknown, host: Host): ConvertGroup[] {
  if (!Array.isArray(rawGroups)) {
    return [];
  }

  const active = host.getActiveContext();
  const content = active?.content ?? '';
  const rangeFallbacks = findRangesByMatchedText(content, rawGroups.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'));

  return rawGroups.flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      return [];
    }

    const group = raw as Record<string, unknown>;
    const normalizedRange = normalizeRangeLike(content, group.range) ?? rangeFallbacks.get(group);
    const originalText = typeof group.originalText === 'string'
      ? group.originalText
      : typeof group.i18nValue === 'string'
        ? group.i18nValue
        : typeof group.matchedText === 'string'
          ? group.matchedText
          : undefined;

    if (!originalText) {
      return [];
    }

    return [{
      id: typeof group.id === 'string' ? group.id : `g_${index}_${randomUUID()}`,
      filePath: typeof group.filePath === 'string' ? group.filePath : active?.filePath ?? host.workspaceRoot,
      range: normalizedRange ?? { start: 0, end: 0 },
      originalText,
      key: typeof group.key === 'string'
        ? group.key
        : typeof group.i18nKey === 'string'
          ? group.i18nKey
          : undefined,
      replacementText: typeof group.replacementText === 'string'
        ? group.replacementText
        : typeof group.overwriteText === 'string'
          ? group.overwriteText
          : undefined,
    }];
  });
}

export class HookManager {
  private readonly timeoutMs: number;
  private readonly getUtilExtras: () => Record<string, unknown>;
  private readonly getLegacyBindings: () => Record<string, unknown>;
  private readonly adaptModule: (module: HookModule, filePath: string) => HookModule;
  private readonly overrides: Host[] = [];
  private loaded?: LoadedHook;

  constructor(
    private readonly baseHost: Host,
    private readonly loader: HookLoader,
    private readonly getConfig: () => unknown,
    options: HookManagerOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.getUtilExtras = options.getUtilExtras ?? (() => ({}));
    this.getLegacyBindings = options.getLegacyBindings ?? (() => ({}));
    this.adaptModule = options.adaptModule ?? ((module) => module);
  }

  get loadedFilePath(): string | undefined {
    return this.loaded?.filePath;
  }

  get effectiveHost(): Host {
    return this.overrides[this.overrides.length - 1] ?? this.baseHost;
  }

  isLoaded(): boolean {
    return Boolean(this.loaded);
  }

  pushHostOverride(host: Host): void {
    this.overrides.push(host);
  }

  popHostOverride(): void {
    this.overrides.pop();
  }

  async reload(absPath: string): Promise<void> {
    const loaded = this.loader.load(absPath);
    this.loaded = {
      ...loaded,
      module: this.adaptModule(loaded.module, loaded.filePath),
    };
  }

  private buildContext(extraLegacy: Record<string, unknown> = {}): HookContext & Record<string, unknown> {
    return createHookContext({
      host: this.effectiveHost,
      utilExtras: this.getUtilExtras(),
      config: this.getConfig(),
      legacyBindings: {
        ...this.getLegacyBindings(),
        ...extraLegacy,
      },
    });
  }

  async invokeLoaded<T>(
    phase: string,
    invoke: (module: HookModule, ctx: HookContext & Record<string, unknown>) => Promise<T> | T,
    fallback: T,
    extraLegacy: Record<string, unknown> = {},
  ): Promise<T> {
    if (!this.loaded) {
      return fallback;
    }

    return withTimeout(phase, invoke(this.loaded.module, this.buildContext(extraLegacy)), this.timeoutMs);
  }

  async match(extraLegacy: Record<string, unknown> = {}): Promise<ConvertGroup[]> {
    const result = await this.invokeLoaded('match', (module, ctx) => module.match?.(ctx) ?? [], [], extraLegacy);
    return normalizeConvertGroups(result, this.effectiveHost);
  }

  async convert(groups: ConvertGroup[], extraLegacy: Record<string, unknown> = {}): Promise<ConvertGroup[]> {
    const result = await this.invokeLoaded(
      'convert',
      (module, ctx) => module.convert?.(groups, { ...ctx, convertGroups: (ctx as Record<string, unknown>).convertGroups ?? groups, groups } as HookContext & Record<string, unknown>) ?? groups,
      groups,
      extraLegacy,
    );
    return normalizeConvertGroups(result, this.effectiveHost);
  }

  async write(groups: ConvertGroup[], extraLegacy: Record<string, unknown> = {}): Promise<void> {
    await this.invokeLoaded(
      'write',
      (module, ctx) => module.write?.(groups, { ...ctx, convertGroups: (ctx as Record<string, unknown>).convertGroups ?? groups, groups } as HookContext & Record<string, unknown>),
      undefined,
      extraLegacy,
    );
  }

  async collectI18n(content: string, filePath: string, extraLegacy: Record<string, unknown> = {}): Promise<I18nEntry[]> {
    const result = await this.invokeLoaded(
      'collectI18n',
      (module, ctx) => module.collectI18n?.(content, filePath, ctx) ?? [],
      [],
      extraLegacy,
    );
    return Array.isArray(result)
      ? result.map((entry) => {
          const raw = entry as unknown as Record<string, unknown>;
          return {
            ...raw,
            text: typeof raw.text === 'string' ? raw.text : String(raw.value ?? ''),
            locale: typeof raw.locale === 'string' ? raw.locale : 'zh',
            filePath: typeof raw.filePath === 'string' ? raw.filePath : filePath,
          } as I18nEntry;
        })
      : [];
  }

  async matchI18n(key: string, extraLegacy: Record<string, unknown> = {}): Promise<boolean> {
    const result = await this.invokeLoaded(
      'matchI18n',
      (module, ctx) => module.matchI18n?.(key, ctx) ?? false,
      false,
      extraLegacy,
    );
    return Boolean(result);
  }
}
