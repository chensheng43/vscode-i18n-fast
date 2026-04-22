import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import crypto from 'crypto-js';
import lodash from 'lodash';
import qs from 'qs';
import * as uuid from 'uuid';
import * as vscode from 'vscode';

import { HookLoader } from '@core/hook/loader';
import { HookManager } from '@core/hook/manager';
import type { ConvertGroup as CoreConvertGroup } from '@core/types';
import type { Host, Disposable } from '@core/host';

import { getConfig } from './config';
import { FILE_IGNORE } from './constant';
import I18n from './i18n';
import { showMessage } from './tips';
import {
  asyncSafeCall,
  convert2pinyin,
  getICUMessageFormatAST,
  getLoading,
  isInJsxAttribute,
  isInJsxElement,
  matchChinese,
  safeCall,
  setLoading,
  writeFileByEditor,
} from './utils';

import type { ExtensionContext, TextDocument, Uri } from 'vscode';
import type { MatchType } from './types/enums';
import type { ConvertGroup, I18nGroup } from './types';

const adaptLegacyHookModule = (module: Record<string, unknown>) => ({
  ...module,
  match: typeof module.match === 'function'
    ? (ctx: Record<string, unknown>) => (module.match as (ctx: Record<string, unknown>) => unknown)(ctx)
    : undefined,
  convert: typeof module.convert === 'function'
    ? (_groups: CoreConvertGroup[], ctx: Record<string, unknown>) => (module.convert as (ctx: Record<string, unknown>) => unknown)(ctx)
    : undefined,
  write: typeof module.write === 'function'
    ? (_groups: CoreConvertGroup[], ctx: Record<string, unknown>) => (module.write as (ctx: Record<string, unknown>) => unknown)(ctx)
    : undefined,
  collectI18n: typeof module.collectI18n === 'function'
    ? (_content: string, filePath: string, ctx: Record<string, unknown>) => (module.collectI18n as (ctx: Record<string, unknown>) => unknown)({
        ...ctx,
        i18nFileUri: vscode.Uri.file(filePath),
      })
    : undefined,
}) as any;

function toCoreGroup(document: TextDocument, group: ConvertGroup, index: number): CoreConvertGroup {
  return {
    id: `legacy_${index}`,
    filePath: document.uri.fsPath,
    range: group.range
      ? {
          start: document.offsetAt(group.range.start),
          end: document.offsetAt(group.range.end),
        }
      : { start: 0, end: 0 },
    originalText: group.i18nValue,
    key: group.i18nKey,
    replacementText: group.overwriteText,
  };
}

function toLegacyGroup(document: TextDocument, group: CoreConvertGroup): ConvertGroup {
  return {
    i18nValue: group.originalText,
    matchedText: document.getText(new vscode.Range(document.positionAt(group.range.start), document.positionAt(group.range.end))),
    range: new vscode.Range(document.positionAt(group.range.start), document.positionAt(group.range.end)),
    i18nKey: group.key,
    overwriteText: group.replacementText,
  };
}

class Hook {
  private extensionContext?: ExtensionContext;
  private host?: Host;
  private hookWatcher?: Disposable;
  private loading = false;
  private _onChange?: () => void;
  private mgr?: HookManager;
  private static instance: Hook;

  static getInstance(): Hook {
    if (!Hook.instance) Hook.instance = new Hook();
    return Hook.instance;
  }

  setHost(h: Host): void {
    this.host = h;
    this.mgr = new HookManager(h, new HookLoader(__filename), () => getConfig(), {
      getUtilExtras: () => ({
        qs,
        crypto,
        uuid,
        _: lodash,
        babel: { ...babelParser, traverse },
      }),
      getLegacyBindings: () => ({
        vscode,
        extensionContext: this.extensionContext,
        qs,
        crypto,
        uuid,
        _: lodash,
        babel: { ...babelParser, traverse },
        hook: Hook.getInstance(),
        i18n: I18n.getInstance(),
        convert2pinyin,
        isInJsxElement,
        isInJsxAttribute,
        writeFileByEditor,
        getICUMessageFormatAST,
        safeCall,
        asyncSafeCall,
        getConfig,
        getLoading,
        setLoading,
        showMessage,
        matchChinese,
      }),
      adaptModule: (module) => adaptLegacyHookModule(module as unknown as Record<string, unknown>),
    });
  }

  private get h(): Host {
    if (!this.host) throw new Error('Host not set (did extension.ts call setHost?)');
    return this.host;
  }

  private get manager(): HookManager {
    if (!this.mgr) throw new Error('HookManager not initialized (did setHost run?)');
    return this.mgr;
  }

  getCoreManager(): HookManager {
    return this.manager;
  }

  private async disposeWatcher() {
    this.hookWatcher?.dispose();
    this.hookWatcher = undefined;
  }

  async dispose(_workspaceKey?: string) {
    await this.disposeWatcher();
  }

  onChange(callback: Hook['_onChange']) {
    this._onChange = callback;
  }

  async init(extensionContext: ExtensionContext) {
    this.extensionContext = extensionContext;
    return await this.reload();
  }

  async reload(hookFilePattern?: string) {
    hookFilePattern = hookFilePattern || getConfig().hookFilePattern;
    await this.disposeWatcher();

    if (!hookFilePattern) {
      return;
    }

    this.loading = true;
    try {
      const [filePath] = await this.h.findFiles(hookFilePattern, FILE_IGNORE);
      if (filePath) {
        await this.manager.reload(filePath);
      }

      this.hookWatcher = this.h.watch(hookFilePattern, async (absPath) => {
        try {
          if (await this.h.exists(absPath)) {
            await this.manager.reload(absPath);
          } else {
            this.setHost(this.h);
          }
          this._onChange?.();
        } catch (error: any) {
          showMessage('warn', `<loadHook error> ${error?.stack || error}`);
        }
      });
    } catch (error: any) {
      showMessage('warn', `<loadHook error> ${error?.stack || error}`);
    } finally {
      this.loading = false;
    }
  }

  private async waitForReady() {
    while (this.loading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async match(context: { document: TextDocument }) {
    await this.waitForReady();
    const groups = await this.manager.match(context as unknown as Record<string, unknown>);
    return groups.map((group) => toLegacyGroup(context.document, group));
  }

  async convert(context: { convertGroups: ConvertGroup[]; document: TextDocument }) {
    await this.waitForReady();
    const coreGroups = context.convertGroups
      .filter((g) => !!g.range)
      .map((group, index) => toCoreGroup(context.document, group, index));
    const converted = await this.manager.convert(coreGroups, context as unknown as Record<string, unknown>);
    return converted.map((group) => toLegacyGroup(context.document, group));
  }

  async write(context: { convertGroups: ConvertGroup[]; document: TextDocument }) {
    await this.waitForReady();
    const coreGroups = context.convertGroups
      .filter((g) => !!g.range)
      .map((group, index) => toCoreGroup(context.document, group, index));
    await this.manager.write(coreGroups, context as unknown as Record<string, unknown>);
    return true;
  }

  async collectI18n(context: { i18nFileUri: Uri }) {
    await this.waitForReady();
    const content = await this.h.readFile(context.i18nFileUri.fsPath);
    return await this.manager.collectI18n(content, context.i18nFileUri.fsPath, context as unknown as Record<string, unknown>) as unknown as I18nGroup[];
  }

  async matchI18n(context: { type: MatchType; i18nGroups: I18nGroup[]; document: TextDocument }) {
    await this.waitForReady();
    return await this.manager.invokeLoaded<I18nGroup[]>(
      'matchI18n',
      (module, baseCtx) => {
        const fn = (module as Record<string, unknown>).matchI18n;
        if (typeof fn !== 'function') {
          return context.i18nGroups;
        }
        return (fn as (ctx: Record<string, unknown>) => unknown)({
          ...baseCtx,
          ...context,
        }) as I18nGroup[];
      },
      context.i18nGroups,
      context as unknown as Record<string, unknown>,
    );
  }
}

export default Hook;
