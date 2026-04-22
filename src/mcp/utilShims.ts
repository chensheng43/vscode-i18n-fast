import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { replace } from 'lodash';
import { parse as parseMessageFormat } from '@formatjs/icu-messageformat-parser';
import { isSupported, convertToPinyin } from 'tiny-pinyin';

import { isInJsxElement as coreIsInJsxElement } from '@core/text/jsx';
import { matchChinese as coreMatchChinese } from '@core/text/matchChinese';

import type { Host } from '@core/host';
import type { ResolvedConfig } from '@core/types';
import type { ContentRef, DocumentShim } from './documentShim';

declare const __non_webpack_require__: NodeRequire;

// ---------------------------------------------------------------------------
// Pure utilities (stateless, go in getLegacyBindings)
// ---------------------------------------------------------------------------

export const safeCall = <T extends (...args: any[]) => any>(
  fn: T,
  args: Parameters<T>,
  errorCb?: (error: any) => ReturnType<T>,
) => {
  try {
    return fn(...(args || []));
  } catch (error) {
    return errorCb?.(error) || null;
  }
};

export const asyncSafeCall = async <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  args: Parameters<T>,
  errorCb?: (error: any) => ReturnType<T>,
) => {
  try {
    return await fn(...(args || []));
  } catch (error) {
    return errorCb?.(error);
  }
};

export const getICUMessageFormatAST = (message: string) => {
  return parseMessageFormat(message, { ignoreTag: true, requiresOtherClause: false });
};

export const convert2pinyin = (
  str: string,
  opt: { separator?: string; lowerCase?: boolean; limit?: number; forceSplit?: boolean },
) => {
  if (!isSupported()) {
    throw new Error('current environment does not support converting to pinyin.');
  }

  opt = opt || {};
  opt.lowerCase = opt.lowerCase ?? true;
  opt.forceSplit = opt.forceSplit ?? false;

  str = replace(str, /([^\p{L}\p{N}\s]|\n)/gu, '');

  if (opt.separator) {
    str = replace(str, /([一-龥])|([a-zA-Z]+)/g, '$& ').trim().replace(/\s+/g, ' ');
  }

  str = replace(str, /[一-龥]/g, (matched) => convertToPinyin(matched, void 0, opt.lowerCase));

  if (opt.separator) {
    str = str.split(' ').join(opt.separator);
  }

  if (opt.limit) {
    str = str.slice(0, opt.limit);

    if (!opt.forceSplit && opt.separator) {
      const sepLength = opt.separator.length;
      const endPart = str.slice(-sepLength);
      const lastSeparatorIndex = str.lastIndexOf(opt.separator);

      if (endPart === opt.separator || endPart.startsWith(opt.separator)) {
        str = str.slice(0, -endPart.length);
      } else if (lastSeparatorIndex !== -1) {
        str = str.slice(0, lastSeparatorIndex);
      }
    }
  }

  return str;
};

export const isInJsxElement = (input: string | object, start: number, _end: number) => {
  if (typeof input === 'string') {
    return coreIsInJsxElement(input, start);
  }

  const end = _end;
  let inJsx = false;
  const checkJSXText = (node: any) => {
    return node.start != null && node.end != null && start >= node.start && end <= node.end;
  };
  const checkJSXChildren = (node: any) => {
    const nodeStart = node?.openingElement?.end || node?.openingFragment?.end;
    const nodeEnd = node?.closingElement?.start || node?.closingFragment?.start;
    if (nodeStart == null || nodeEnd == null) return false;
    if (start >= nodeStart && end <= nodeEnd) {
      if (node.children.length === 0) return true;
      for (const child of node.children) {
        if (child.type === 'JSXText') return checkJSXText(child);
      }
    }
    return false;
  };

  traverse(input as any, {
    JSXFragment({ node }: any) { if (checkJSXChildren(node)) inJsx = true; },
    JSXElement({ node }: any) { if (checkJSXChildren(node)) inJsx = true; },
    JSXText({ node }: any) { if (checkJSXText(node)) inJsx = true; },
  });

  return inJsx;
};

export const isInJsxAttribute = (input: string | object, start: number, end: number) => {
  const AST = typeof input === 'string'
    ? parse(input, {
        sourceType: 'module',
        plugins: ['jsx'],
        errorRecovery: true,
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        allowSuperOutsideMethod: true,
        allowUndeclaredExports: true,
        allowAwaitOutsideFunction: true,
      })
    : input;

  let inJsxAttribute = false;
  traverse(AST as any, {
    JSXElement({ node }: any) {
      if (node.start == null || node.end == null) return;
      if (start >= node.start && end <= node.end) {
        const { attributes } = node.openingElement;
        if (!attributes) return;
        for (const attr of attributes) {
          if (attr.type !== 'JSXAttribute' || !attr.value || attr.value.type !== 'StringLiteral') continue;
          if (attr.value.start == null || attr.value.end == null) continue;
          if (start >= attr.value.start && end <= attr.value.end) {
            inJsxAttribute = true;
          }
        }
      }
    },
  });

  return inJsxAttribute;
};

export const setLoading = (_loading: boolean, _text?: string) => {};
export const getLoading = () => false;

// ---------------------------------------------------------------------------
// Factory utilities (built with host/config, go in getLegacyBindings)
// ---------------------------------------------------------------------------

export function buildShowMessage(host: Host) {
  return (type: 'info' | 'warn' | 'error', message: string) => {
    host.log(type === 'info' ? 'info' : type, `[i18n-fast] ${message}`);
  };
}

export function buildGetConfig(readConfig: () => ResolvedConfig) {
  return () => readConfig();
}

// ---------------------------------------------------------------------------
// Per-call utilities (go in legacyContext from convertText.ts)
// ---------------------------------------------------------------------------

function offsetAtInContent(content: string, position: { line: number; character: number }): number {
  if (position.line <= 0) return position.character;
  let line = 0;
  let index = 0;
  while (index < content.length && line < position.line) {
    if (content[index] === '\n') line += 1;
    index += 1;
  }
  return index + position.character;
}

export function buildWriteFileByEditor(
  getHost: () => Host,
  trackedPath?: string,
  contentRef?: ContentRef,
) {
  return async (
    fileUri: { fsPath: string } | string,
    contentOrList: string | Array<{ range: any; content: string }>,
    _isSave = false,
    _needSnapshot = true,
  ): Promise<boolean> => {
    const host = getHost();
    const fsPath = typeof fileUri === 'string' ? fileUri : fileUri.fsPath;

    if (typeof contentOrList === 'string') {
      await host.writeFile(fsPath, contentOrList);
      if (trackedPath && contentRef && fsPath === trackedPath) {
        contentRef.value = contentOrList;
      }
      return true;
    }

    const current = (trackedPath && contentRef && fsPath === trackedPath)
      ? contentRef.value
      : await host.readFile(fsPath);
    const edits = contentOrList
      .map((edit) => {
        const range = edit.range;
        let start: number;
        let end: number;
        if (typeof range.start === 'number' && typeof range.end === 'number') {
          start = range.start;
          end = range.end;
        } else {
          start = offsetAtInContent(current, range.start);
          end = offsetAtInContent(current, range.end);
        }
        return { start, end, content: edit.content };
      })
      .sort((a, b) => b.start - a.start);

    let result = current;
    for (const edit of edits) {
      result = result.substring(0, edit.start) + edit.content + result.substring(edit.end);
    }
    await host.writeFile(fsPath, result);
    if (trackedPath && contentRef && fsPath === trackedPath) {
      contentRef.value = result;
    }
    return true;
  };
}

const MATCH_END_CHARS = new Set(["'", '"', '`', '\n', '>', '<', '}', '{', '(', ')']);
const MATCH_QUOTE_CHARS = new Set(['"', "'", '`']);
const MATCH_EXCLUDES = ['v-track:'];

export function buildMatchChinese() {
  const vscode = __non_webpack_require__('vscode') as {
    Position: new (line: number, character: number) => { line: number; character: number };
    Range: new (start: any, end: any) => { start: any; end: any };
  };

  return (document: DocumentShim) => {
    const documentText = document.getText();
    if (!documentText) return [];

    const hits = coreMatchChinese(documentText, { excludes: MATCH_EXCLUDES });
    if (!hits.length) return [];

    const result: Array<{ matchedText: string; i18nValue: string; range: any }> = [];
    let nextIndex = -1;

    for (const hit of hits) {
      const i = hit.start;
      if (i < nextIndex) continue;

      let begin = i - 1;
      let end = i + 1;

      while (begin >= 0 && !MATCH_END_CHARS.has(documentText[begin])) begin--;
      while (end < documentText.length && !MATCH_END_CHARS.has(documentText[end])) end++;

      if (documentText[begin] === '`') {
        while (end < documentText.length && documentText[end] !== '`') end++;
      }
      if (documentText[end] === '`') {
        while (begin >= 0 && documentText[begin] !== '`') begin--;
      }

      let start = begin + 1;
      nextIndex = end;
      let key = documentText.substring(start, end);

      if (documentText[begin] !== '`') {
        const trimmedKey = key.trim();
        if (trimmedKey !== key) {
          const leadingSpaces = key.length - key.trimStart().length;
          const trailingSpaces = key.length - key.trimEnd().length;
          start += leadingSpaces;
          end -= trailingSpaces;
          key = trimmedKey;
        }
      }

      if (MATCH_EXCLUDES.some((k) => key.includes(k))) continue;

      const startPos = document.positionAt(start);
      const endPos = document.positionAt(end);
      let matchedText = key;
      let range = new vscode.Range(startPos, endPos);

      if (MATCH_QUOTE_CHARS.has(documentText[begin]) && documentText[begin] === documentText[end]) {
        matchedText = `${documentText[begin]}${key}${documentText[end]}`;
        range = new vscode.Range(document.positionAt(start - 1), document.positionAt(end + 1));
      }

      result.push({ matchedText, i18nValue: key, range });
    }

    return result;
  };
}
