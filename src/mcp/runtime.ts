import * as path from 'node:path';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import crypto from 'crypto-js';
import lodash from 'lodash';
import qs from 'qs';
import * as uuid from 'uuid';

import { HookLoader } from '@core/hook/loader';
import { HookManager } from '@core/hook/manager';
import { I18nCache } from '@core/i18n/cache';
import { I18nScanner } from '@core/i18n/scanner';
import { FileSnapshotStack } from '@core/snapshot/fileSnapshotStack';
import type { Host } from '@core/host';
import type { ResolvedConfig } from '@core/types';

import { UnsupportedInMcpError } from './vscodeShim';
import { parseJsonc } from './parseJsonc';

declare const __non_webpack_require__: NodeRequire;

const DEFAULT_CONFIG: ResolvedConfig = {
  hookFilePattern: '.vscode/i18n-fast.hook.js',
  i18nFilePattern: '',
  conflictPolicy: 'smart',
  autoMatchChinese: true,
};

function loadShimmedVscode(): unknown {
  return __non_webpack_require__('vscode');
}

function adaptLegacyHookModule(module: Record<string, unknown>) {
  return {
    ...module,
    match: typeof module.match === 'function'
      ? (ctx: Record<string, unknown>) => (module.match as (ctx: Record<string, unknown>) => unknown)(ctx)
      : undefined,
    convert: typeof module.convert === 'function'
      ? (_groups: unknown, ctx: Record<string, unknown>) => (module.convert as (ctx: Record<string, unknown>) => unknown)(ctx)
      : undefined,
    write: typeof module.write === 'function'
      ? (_groups: unknown, ctx: Record<string, unknown>) => (module.write as (ctx: Record<string, unknown>) => unknown)(ctx)
      : undefined,
    collectI18n: typeof module.collectI18n === 'function'
      ? (_content: string, filePath: string, ctx: Record<string, unknown>) => (module.collectI18n as (ctx: Record<string, unknown>) => unknown)({
          ...ctx,
          i18nFileUri: (loadShimmedVscode() as typeof import('vscode')).Uri.file(filePath),
        })
      : undefined,
  };
}

export class HookNotFoundError extends Error {
  readonly code = 'HOOK_NOT_FOUND';

  constructor(public readonly expectedPath: string) {
    super(`hook file not found at ${expectedPath}`);
    this.name = 'HookNotFoundError';
  }
}

export interface McpRuntime {
  host: Host;
  hookManager: HookManager;
  scanner: I18nScanner;
  cache: I18nCache;
  snapshots: FileSnapshotStack;
  readConfig(): ResolvedConfig;
}

export async function buildRuntime(host: Host): Promise<McpRuntime> {
  const configPath = path.join(host.workspaceRoot, '.vscode', 'settings.json');
  let raw: Record<string, unknown> = {};
  if (await host.exists(configPath)) {
    try {
      raw = parseJsonc(await host.readFile(configPath)) as Record<string, unknown>;
    } catch {
      raw = {};
    }
  }

  const readConfig = (): ResolvedConfig => ({
    ...DEFAULT_CONFIG,
    hookFilePattern: String(raw['i18n-fast.hookFilePattern'] ?? DEFAULT_CONFIG.hookFilePattern),
    i18nFilePattern: String(raw['i18n-fast.i18nFilePattern'] ?? DEFAULT_CONFIG.i18nFilePattern),
    conflictPolicy: (raw['i18n-fast.conflictPolicy'] as ResolvedConfig['conflictPolicy']) ?? DEFAULT_CONFIG.conflictPolicy,
    autoMatchChinese: Boolean(raw['i18n-fast.autoMatchChinese'] ?? DEFAULT_CONFIG.autoMatchChinese),
  });

  const hookManager = new HookManager(host, new HookLoader(__filename), readConfig, {
    getUtilExtras: () => ({
      qs,
      crypto,
      uuid,
      _: lodash,
      babel: { ...babelParser, traverse },
    }),
    getLegacyBindings: () => ({
      vscode: loadShimmedVscode(),
      qs,
      crypto,
      uuid,
      _: lodash,
      babel: { ...babelParser, traverse },
      UnsupportedInMcpError,
    }),
    adaptModule: (module) => adaptLegacyHookModule(module as Record<string, unknown>) as any,
  });

  return {
    host,
    hookManager,
    scanner: new I18nScanner(host, hookManager),
    cache: new I18nCache(),
    snapshots: new FileSnapshotStack({ maxSize: 10 }),
    readConfig,
  };
}

export async function ensureHookLoaded(runtime: McpRuntime): Promise<void> {
  if (runtime.hookManager.isLoaded()) {
    return;
  }

  const hookPath = path.resolve(runtime.host.workspaceRoot, runtime.readConfig().hookFilePattern);
  if (!(await runtime.host.exists(hookPath))) {
    throw new HookNotFoundError(hookPath);
  }
  await runtime.hookManager.reload(hookPath);
}

export async function ensureI18nLoaded(runtime: McpRuntime): Promise<void> {
  const config = runtime.readConfig();
  if (!config.i18nFilePattern) {
    runtime.cache.clear();
    return;
  }

  await ensureHookLoaded(runtime);
  const entries = await runtime.scanner.scan(config.i18nFilePattern);
  runtime.cache.replace(entries);
}
